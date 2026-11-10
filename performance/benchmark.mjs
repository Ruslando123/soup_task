import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { cpus, platform, release } from 'node:os'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'

const variant = process.argv[2]
if (!['baseline', 'optimized'].includes(variant)) throw new Error('Usage: npm run benchmark -- baseline|optimized')
const trials = Number(process.env.BENCH_TRIALS || 3)
const cwd = resolve('dist-benchmark')
const evidence = resolve('performance/results')
await mkdir(evidence, { recursive: true })
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname
    const file = resolve(cwd, '.' + path)
    if (!file.startsWith(cwd + '/')) throw new Error()
    const body = await readFile(file)
    res.writeHead(200, {
      'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html',
      'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp',
    })
    res.end(body)
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const viewport = { width: 1280, height: 900 }
const samples = []
let browser
try {
  for (let trial = 0; trial < trials; trial++) {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const version = browser.version()
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
    const target = await page.context().newCDPSession(page)
    const controller = await browser.newBrowserCDPSession()
    await target.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await target.send('Performance.enable')
    const traceDone = new Promise(resolve => controller.once('Tracing.tracingComplete', resolve))
    if (trial === 0) {
      await controller.send('Tracing.start', {
        transferMode: 'ReturnAsStream',
        traceConfig: { includedCategories: ['devtools.timeline', 'blink.user_timing', 'toplevel', 'loading', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame'] },
      })
    }
    await page.goto(`${origin}/performance/index.html?variant=${variant}`)
    await page.waitForFunction(() => window.bench?.ready || window.bench?.error)
    const initial = await page.evaluate(() => window.bench)
    if (initial.error) throw new Error(initial.error)
    if (variant === 'baseline' && initial.initialRows.some(n => n !== 1_000_000)) throw new Error('Baseline did not render full data')
    if (variant === 'optimized' && initial.initialRows.some(n => n < 2 || n >= 10_000)) throw new Error('Optimized fixture did not downsample')
    const heap = (await target.send('Performance.getMetrics')).metrics.find(x => x.name === 'JSHeapUsedSize')?.value
    const processInfo = (await controller.send('SystemInfo.getProcessInfo')).processInfo
    const ids = processInfo.filter(p => p.type === 'renderer').map(p => p.id)
    const rss = Object.fromEntries(execFileSync('ps', ['-o', 'pid=,rss=', '-p', ids.join(',')], { encoding: 'utf8' }).trim().split('\n').map(l => l.trim().split(/\s+/).map(Number)))
    const overlay = page.locator('.u-over').first()
    const rect = await overlay.boundingBox()
    if (!rect) throw new Error('Chart did not lay out')
    const move = async frac => page.mouse.move(rect.x + rect.width * frac, rect.y + 38)
    await page.mouse.move(0, 0)
    // Use a synthetic native mouse drag; each drag narrows to the same central fraction.
    for (let i = 0; i < 3; i++) {
      await move(.23); await page.mouse.down(); await move(.77); await page.mouse.up()
      await page.waitForFunction(n => window.bench.zoom.length >= n, i + 1)
    }
    for (const frac of [.2, .4, .5, .65, .8, .42, .61]) {
      const before = await page.evaluate(() => window.bench.hover.length)
      await move(frac)
      await page.waitForFunction(n => window.bench.hover.length > n, before)
    }
    const state = await page.evaluate(() => window.bench)
    // Origin-scoped browser memory estimate may be unavailable. Renderer RSS is separate.
    const originBytes = await page.evaluate(async () => {
      if (!performance.measureUserAgentSpecificMemory) return null
      return (await Promise.race([
        performance.measureUserAgentSpecificMemory().then(x => x.bytes).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), 3500)),
      ]))
    })
    let rendererPid
    if (trial === 0) {
      await controller.send('Tracing.end')
      const { stream } = await traceDone
      const traceFile = resolve(evidence, `${variant}.trace.json.gz`)
      const chunks = []
      for (;;) {
        const chunk = await controller.send('IO.read', { handle: stream })
        chunks.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8'))
        if (chunk.eof) break
      }
      await controller.send('IO.close', { handle: stream })
      const raw = Buffer.concat(chunks)
      const parsed = JSON.parse(raw)
      rendererPid = parsed.traceEvents.flatMap(e => e.name === 'TracingStartedInBrowser' ? e.args?.data?.frames || [] : [])
        .filter(frame => frame.url?.startsWith(origin)).at(-1)?.processId
        ?? parsed.traceEvents.find(e => e.name === 'bench:initial:start')?.pid
      await pipeline(Readable.from([gzipSync(raw)]), createWriteStream(traceFile))
    }
    // Headless can keep a spare renderer. Use the traced main renderer on trial one.
    samples.push({ trial: trial + 1, chrome: version, ...state, hover: state.hover.slice(-7), heap, rss, rendererPid, originBytes })
    process.stdout.write(JSON.stringify(samples.at(-1)) + '\n')
    await browser.close(); browser = undefined
  }
  await writeFile(resolve(evidence, `${variant}.json`), JSON.stringify({
    variant, cpuRate: 4, viewport, deviceScaleFactor: 1, host: { platform: platform(), release: release(), cpu: cpus()[0]?.model }, samples,
  }, null, 2) + '\n')
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
