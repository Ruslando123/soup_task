import { COLORS, makePlot, plotWidth } from '../src/components/plot.ts'
import { metricValue } from '../src/data/format.ts'
import { METRICS } from '../src/data/types.ts'
import { baseline } from './baseline.ts'
import { optimized } from './optimized.ts'

const width = 1100, height = 180
const root = document.querySelector<HTMLElement>('#bench')!
const state = { ready: false, zoom: [] as number[], hover: [] as number[], initial: 0, error: '', initialRows: [] as number[] }
Object.assign(window, { bench: state })
const framePresented = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

async function main() {
  performance.mark('bench:initial:start')
  const source = new URLSearchParams(location.search).get('variant') === 'optimized' ? optimized() : baseline()
  window.addEventListener('pagehide', () => source.close(), { once: true })
  const domain = await source.load()
  const frames = await source.frames(domain, plotWidth(width))
  const charts = METRICS.map((metric, i) => {
    const section = document.createElement('section'), label = document.createElement('h2'), host = document.createElement('div')
    const output = document.createElement('output')
    label.textContent = metric
    section.append(label, host, output); root.append(section)
    let sequence = 0, last = -1
    return makePlot(host, {
      width, height, color: COLORS[metric], locale: 'en-US', log: false, frame: frames[i]!, range: domain,
      async onZoom(range) {
        const start = performance.now()
        performance.mark('bench:zoom:start')
        const next = await source.frames(range, plotWidth(width))
        charts.forEach((chart, idx) => chart.update(next[idx]!, range))
        await framePresented()
        state.zoom.push(performance.now() - start)
        performance.measure('bench:zoom', 'bench:zoom:start')
      },
      async onHover(value) {
        const step = Math.round(value)
        if (!state.ready || last === step) return
        last = step
        const token = ++sequence
        const start = performance.now()
        performance.mark('bench:hover:start')
        const inspection = await source.inspect(step)
        if (token !== sequence || inspection.kind !== 'observed') return
        const reading = inspection.values[metric]
        output.value = `Step ${inspection.step} · ${typeof reading === 'number' ? metricValue(reading) : reading}`
        await framePresented()
        if (token !== sequence) return
        state.hover.push(performance.now() - start)
        performance.measure('bench:hover', 'bench:hover:start')
      },
    })
  })
  await framePresented()
  state.initial = performance.now()
  state.initialRows = frames.map(f => f.displayed)
  state.ready = true
  performance.measure('bench:initial work', 'bench:initial:start')
}
void main().catch((error: unknown) => { state.error = String(error) })
