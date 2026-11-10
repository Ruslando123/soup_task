import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { cpus, platform, release } from 'node:os'
import { preview } from 'vite'

const pairs = 5
const viewport = { width: 1280, height: 900 }
const deviceScaleFactor = 1
const cpuRate = 4
const launchFlag = '--enable-blink-features=ForceEagerMeasureMemory'
const samples = []
const server = await preview({
  configFile: 'vite.benchmark.config.ts',
  preview: {
    host: '127.0.0.1',
    port: 0,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})

try {
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  for (let trial = 1; trial <= pairs; trial++) {
    const order = trial % 2 ? ['baseline', 'optimized'] : ['optimized', 'baseline']
    for (const variant of order) {
      const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [launchFlag] })
      try {
        const page = await browser.newPage({ viewport, deviceScaleFactor })
        const target = await page.context().newCDPSession(page)
        await target.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
        await page.goto(`${origin}/performance/index.html?variant=${variant}`)
        await page.waitForFunction(() => window.bench?.ready || window.bench?.error)
        const { error, initialRows } = await page.evaluate(() => window.bench)
        if (error) throw new Error(error)
        const expectedRows = variant === 'baseline' ? [1_000_000, 1_000_000, 1_000_000] : [1964, 1962, 1964]
        if (String(initialRows) !== String(expectedRows)) throw new Error(`Unexpected point counts for ${variant}: ${initialRows}`)
        const measurement = await page.evaluate(async () => {
          if (!window.crossOriginIsolated || !performance.measureUserAgentSpecificMemory) {
            throw new Error('Chrome page memory API is unavailable')
          }
          const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Chrome page memory measurement timed out')), 15_000))
          return Promise.race([performance.measureUserAgentSpecificMemory(), timeout])
        })
        const workerBytes = measurement.breakdown
          .filter(item => item.attribution.some(source => source.scope === 'DedicatedWorkerGlobalScope'))
          .reduce((sum, item) => sum + item.bytes, 0)
        if (!Number.isSafeInteger(measurement.bytes) || measurement.bytes <= 0 ||
          (variant === 'optimized' && workerBytes <= 0)) {
          throw new Error(`Incomplete Chrome memory attribution for ${variant}`)
        }
        samples.push({ trial, variant, chrome: browser.version(), initialRows, workerBytes, ...measurement })
        console.log(`Pair ${trial} · ${variant} · ${measurement.bytes} bytes`)
      } finally {
        await browser.close()
      }
    }
  }
  const result = {
    measuredAt: new Date().toISOString(),
    metric: 'performance.measureUserAgentSpecificMemory',
    checkpoint: 'Full domain, all three charts ready, before zoom or hover',
    host: { platform: platform(), release: release(), cpu: cpus()[0]?.model },
    viewport, deviceScaleFactor, cpuRate, launchFlag, samples,
  }
  await mkdir('performance/results', { recursive: true })
  await writeFile('performance/results/tab-memory.json', JSON.stringify(result, null, 2) + '\n')
} finally {
  await server.close()
}
