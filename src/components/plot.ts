import uPlot from 'uplot'
import type { ChartFrame, Range } from '../data/types.ts'
import { countValue, metricValue } from '../data/format.ts'
import 'uplot/dist/uPlot.min.css'

export const COLORS = { loss: '#b5a0ff', lr: '#73dacf', grad_norm: '#ffbf7c' }
export function xRange([a, b]: Range): Range { return a === b ? [a - .5, a + .5] : [a, b] }

export function yRange(extrema: Range | null, log: boolean): Range {
  if (!extrema) return log ? [1, 10] : [0, 1]
  const [low, high] = extrema
  if (log) {
    const min = low / 1.18 || low
    const max = high * 1.18
    return [min, Number.isFinite(max) ? max : high]
  }
  const padding = (high - low) * .085 || (Math.abs(high) * .12 || 1)
  return [Number.isFinite(low - padding) ? low - padding : low, Number.isFinite(high + padding) ? high + padding : high]
}

export type PlotConfig = {
  width: number; height: number; color: string; locale: string; log: boolean
  range: Range; frame: ChartFrame
  onHover: (step: number) => void; onZoom: (range: Range) => void
}
const yAxisWidth = 83, rightPadding = 36
export const plotWidth = (canvasWidth: number) => Math.max(1, canvasWidth - yAxisWidth - rightPadding)

const textColor = '#a5afc7', gridColor = '#272e41'

export function makePlot(host: HTMLElement, cfg: PlotConfig) {
  let current = cfg
  const data = (frame: ChartFrame): uPlot.AlignedData => [frame.x, frame.y]
  const stepAt = (u: uPlot, pos: number) => u.posToVal(pos, 'x')
  const plot = new uPlot({
    width: cfg.width, height: cfg.height, padding: [null, rightPadding, null, null],
    legend: { show: false },
    cursor: { y: false, points: { show: false }, drag: { x: true, y: false, setScale: false, dist: 6 } },
    series: [{}, { stroke: cfg.color, width: 1.65, spanGaps: false, points: { show: false } }],
    scales: {
      x: { time: false, range: () => [...xRange(current.range)] },
      y: { distr: cfg.log ? 3 : 1, range: () => [...yRange(current.frame.extrema, current.log)] },
    },
    axes: [
      {
        stroke: textColor, size: 34, space: 86, grid: { show: false }, ticks: { stroke: gridColor },
        font: '11px ui-monospace, monospace',
        filter: (_u, ticks) => ticks.map(v => Number.isInteger(v) ? v : null),
        values: (_u, vals) => vals.map(v => v == null ? '' : countValue(v, current.locale)),
      },
      {
        stroke: textColor, size: yAxisWidth, space: 24, grid: { stroke: gridColor, width: 1 }, ticks: { show: false },
        font: '11px ui-monospace, monospace',
        values: (_u, vals) => vals.map(v => v == null ? '' : metricValue(v, current.locale, false)),
      },
    ],
    hooks: {
      setCursor: [u => {
        const left = u.cursor.left ?? -1
        if (left >= 0 && u.select.width === 0) current.onHover(stepAt(u, left))
      }],
      setSelect: [u => {
        if (u.select.width < 6) return
        const a = stepAt(u, u.select.left), b = stepAt(u, u.select.left + u.select.width)
        u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false)
        current.onZoom([a, b])
      }],
      draw: [u => {
        if (!current.frame.isolated.length) return
        const { ctx, bbox } = u
        ctx.save()
        ctx.beginPath(); ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height); ctx.clip()
        ctx.fillStyle = current.color
        const radius = 2.5 * uPlot.pxRatio
        for (let i = 0; i < current.frame.isolated.length; i += 2) {
          const x = u.valToPos(current.frame.isolated[i]!, 'x', true)
          const y = u.valToPos(current.frame.isolated[i + 1]!, 'y', true)
          ctx.beginPath(); ctx.arc(x, y, radius, 0, 2 * Math.PI); ctx.fill()
        }
        ctx.restore()
      }],
    },
  }, data(cfg.frame), host)

  return {
    update(frame: ChartFrame, range: Range) {
      current = { ...current, frame, range }
      plot.batch(() => {
        plot.setData(data(frame), false)
        const [min, max] = xRange(range)
        plot.setScale('x', { min, max })
        const [ymin, ymax] = yRange(frame.extrema, current.log)
        plot.setScale('y', { min: ymin, max: ymax })
      })
    },
    resize(width: number, height: number) { plot.setSize({ width, height }) },
    destroy() { plot.destroy() },
  }
}
