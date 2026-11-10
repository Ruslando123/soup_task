import { CircleHelp, Crosshair, Maximize2, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { makePlot, plotWidth } from '../../components/plot'
import { countValue, metricValue } from '../../data/format'
import type { RunClient } from '../../data/runClient'
import type { ChartFrame, Inspection, Metric, MetricStats, Range } from '../../data/types'

const chartColors = { loss: '#df8057', lr: '#80aeca', grad_norm: '#b29bd8' }
const labels = {
  loss: { title: 'Loss', units: 'Objective value · unitless', description: 'Lower loss can indicate progress; inspect the shape and data quality.' },
  lr: { title: 'Learning rate', units: 'Optimizer step size · unitless', description: 'Check for schedule changes and true zeros.' },
  grad_norm: { title: 'Gradient norm', units: 'L2 magnitude · unitless', description: 'Look for abrupt changes in gradient magnitude.' },
}

type Snapshot = { frame: ChartFrame; range: Range; log: boolean; width: number }
type Input = { step: number; announce: boolean; generation: number; snapshot: Snapshot }
const height = 212

function fittedRange(range: Range, domain: Range): Range {
  const a = Math.max(domain[0], Math.floor(Math.min(...range)))
  const b = Math.min(domain[1], Math.ceil(Math.max(...range)))
  if (b < a) return domain
  return [a, b]
}
function readingText(inspection: Inspection, metric: Metric, locale: string) {
  if (inspection.kind === 'empty') return 'No observation to inspect'
  if (inspection.kind === 'gap') return `Step ${countValue(inspection.requested, locale)} · Missing between steps ${countValue(inspection.after, locale)} and ${countValue(inspection.before, locale)}`
  const value = inspection.values[metric]
  const text = typeof value === 'number' ? metricValue(value, locale) : value === 'missing' ? 'Missing measurement' : `${value} (invalid)`
  return `Step ${countValue(inspection.step, locale)} · ${text}${inspection.step === inspection.requested ? '' : ' (nearest recorded step)'}`
}

export function MetricChart({ client, metric, domain, stats, interval, locale, onReload }: {
  client: RunClient; metric: Metric; domain: Range; stats: MetricStats; interval: number; locale: string; onReload: () => void
}) {
  const { title, units, description } = labels[metric]
  const [range, setRange] = useState<Range>(domain)
  const [log, setLog] = useState(false)
  const [width, setWidth] = useState(0)
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [error, setError] = useState('')
  const [reading, setReading] = useState<{ input: Input; value: Inspection }>()
  const [spoken, setSpoken] = useState<{ input: Input; value: Inspection }>()
  const [stepInput, setStepInput] = useState('')
  const plotHost = useRef<HTMLDivElement>(null)
  const plot = useRef<ReturnType<typeof makePlot> | undefined>(undefined)
  const currentSnapshot = useRef<Snapshot | undefined>(undefined)
  const drawnSnapshot = useRef<Snapshot | undefined>(undefined)
  const raf = useRef(0)
  const busy = useRef(false)
  const generation = useRef(0)
  const queue = useRef<Input | undefined>(undefined)
  const cursorStep = useRef<number | undefined>(undefined)
  const lastInput = useRef<Input | undefined>(undefined)
  const present = !!snapshot
  const displayedLog = snapshot?.log ?? false

  useLayoutEffect(() => {
    const node = plotHost.current!
    const observer = new ResizeObserver(() => setWidth(Math.floor(node.clientWidth)))
    observer.observe(node)
    setWidth(Math.floor(node.clientWidth))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!width) return
    let active = true
    void client.request('sample', { metric, range, width: plotWidth(width), log }).then(frame => {
      if (!active) return
      setSnapshot({ frame, range, log, width })
      setError('')
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Sampling failed.')
    })
    return () => { active = false }
  }, [client, metric, range, width, log])

  const zoom = useCallback((next: Range) => {
    setError('')
    setRange(prev => {
      const r = fittedRange(next, domain)
      return prev[0] === r[0] && prev[1] === r[1] ? prev : r
    })
  }, [domain])

  const schedule = useCallback(function schedule() {
    if (busy.current || raf.current || !queue.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      const input = queue.current
      queue.current = undefined
      if (!input) return
      busy.current = true
      void client.request('inspect', { step: input.step }).then(value => {
        if (input.generation !== generation.current) return
        // Do not show an older value if a newer pointer position is already queued.
        if (!queue.current || input.announce) setReading({ input, value })
        if (input.announce) setSpoken({ input, value })
      }).catch(() => {
        if (input.generation === generation.current) {
          setReading(undefined)
          setError('Raw inspection could not be loaded.')
        }
      }).finally(() => { busy.current = false; schedule() })
    })
  }, [client])

  const inspect = useCallback((step: number, announce = false) => {
    const snapshot = currentSnapshot.current
    if (!snapshot) return
    const visible = snapshot.range
    const target = Math.max(visible[0], Math.min(visible[1], Math.round(step)))
    if (!announce && lastInput.current?.step === target && lastInput.current.generation === generation.current) return
    cursorStep.current = target
    const input = { step: target, announce, generation: generation.current, snapshot }
    lastInput.current = input
    queue.current = input
    schedule()
  }, [schedule])

  useLayoutEffect(() => {
    currentSnapshot.current = snapshot
    return () => {
      currentSnapshot.current = undefined
      generation.current++
      queue.current = undefined
      if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0 }
    }
  }, [snapshot])

  useLayoutEffect(() => {
    const next = currentSnapshot.current
    if (!present || !next) return
    const instance = makePlot(plotHost.current!, {
      width: next.width, height, color: chartColors[metric], locale, log: displayedLog, range: next.range, frame: next.frame,
      onHover: inspect, onZoom: zoom,
    })
    plot.current = instance
    drawnSnapshot.current = next
    return () => { instance.destroy(); plot.current = undefined; drawnSnapshot.current = undefined }
  }, [present, displayedLog, locale, metric, zoom, inspect])

  useLayoutEffect(() => {
    if (!snapshot || drawnSnapshot.current === snapshot) return
    if (drawnSnapshot.current?.width !== snapshot.width) plot.current?.resize(snapshot.width, height)
    plot.current?.update(snapshot.frame, snapshot.range)
    drawnSnapshot.current = snapshot
  }, [snapshot])

  const activeRange = snapshot?.range ?? range
  const [a, b] = activeRange
  const activeReading = reading && reading.input.snapshot === snapshot ? reading.value : undefined
  const announced = spoken && spoken.input.snapshot === snapshot ? spoken.value : undefined
  const atFull = a === domain[0] && b === domain[1]
  const changeSpan = (factor: number) => {
    const middle = (a + b) / 2, span = Math.max(interval, (b - a) * factor / 2)
    zoom([middle - span, middle + span])
  }
  const peak = () => {
    if (!stats.max) return
    const radius = Math.max(interval * 2, Math.ceil((domain[1] - domain[0]) * .01))
    zoom([stats.max.step - radius, stats.max.step + radius])
  }
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const jump = interval * (event.shiftKey ? 10 : 1)
    const from = cursorStep.current ?? a
    const target = { ArrowLeft: from - jump, ArrowRight: from + jump, Home: a, End: b }[event.key]
    if (target === undefined) return
    event.preventDefault()
    inspect(target, true)
  }
  const fmt = (n: number) => countValue(n, locale)
  const value = (n: number) => metricValue(n, locale)
  const frame = snapshot?.frame
  const pending = !error && (!snapshot || snapshot.range !== range || snapshot.log !== log || snapshot.width !== width)
  return <section className="panel chart-card" aria-labelledby={`title-${metric}`}>
    <div className="chart-heading">
      <div><div className="chart-title"><span className="metric-dot" style={{ backgroundColor: chartColors[metric] }} /><h3 id={`title-${metric}`}>{title}</h3></div><p>{units}</p></div>
      <label className="scale-label"><span className="sr-only">{title} scale</span><select className="ui-select" value={log ? 'log' : 'linear'} onChange={e => { setError(''); setLog(e.target.value === 'log') }}><option value="linear">Linear</option><option value="log">Logarithmic</option></select></label>
    </div>
    <div className="chart-controls">
      <div className="chart-range numeric" data-testid={`range-${metric}`}>Steps {fmt(a)}–{fmt(b)}</div>
      <div className="chart-actions">
        <button className="icon-button" type="button" onClick={() => changeSpan(.5)} disabled={!present || b - a <= interval * 2} aria-label={`Zoom in on ${title}`} title="Zoom in"><Plus size={16} aria-hidden="true" /></button>
        <button className="icon-button" type="button" onClick={() => changeSpan(2)} disabled={!present || atFull} aria-label={`Zoom out on ${title}`} title="Zoom out"><Minus size={16} aria-hidden="true" /></button>
        <button className="button compact" type="button" onClick={peak} disabled={!present || !stats.max} aria-label={`Zoom to ${title} peak`}><Crosshair size={14} aria-hidden="true" /> Peak</button>
        <button className="button compact" type="button" onClick={() => zoom(domain)} disabled={!present || atFull} aria-label={`Reset ${title} zoom`}><Maximize2 size={14} aria-hidden="true" /> Reset</button>
      </div>
    </div>
    <div className="chart-surface" tabIndex={0} role="group" aria-label={`${title} plot`} aria-describedby={`inspect-help-${metric}`} onKeyDown={keys}>
      <div ref={plotHost} aria-hidden="true" className="plot-host" />
      {!frame?.extrema && <div className="chart-placeholder">{pending ? 'Preparing chart…' : error ? 'Chart unavailable' : displayedLog ? 'No positive measurements in view' : 'No finite measurements in view'}</div>}
    </div>
    <div className="chart-meta">
      <span>{frame ? frame.displayed < frame.eligible ? `Downsampled · ${fmt(frame.displayed)} of ${fmt(frame.eligible)} plottable values` : `Full resolution · ${fmt(frame.displayed)} values` : 'Waiting for observations'}</span>
      <span>{frame?.breaks ? `${fmt(frame.breaks)} ${frame.breaks === 1 ? 'break' : 'breaks'} in view` : 'X axis: training step'}</span>
    </div>
    {frame?.extrema && <p className="chart-extrema">Visible range: <span className="numeric">{value(frame.extrema[0])}</span> to <span className="numeric">{value(frame.extrema[1])}</span></p>}
    {frame?.omittedForLog ? <p className="chart-warning">{fmt(frame.omittedForLog)} zero or negative readings excluded on log scale. Inspect their raw values below or use Linear.</p> : null}
    {pending && <p role="status" className="chart-update">{present ? 'Updating chart; previous viewport is still shown.' : 'Loading chart data…'}</p>}
    {error && <div role="alert" className="chart-warning">{error} {present ? 'Previous viewport is still shown. ' : ''}<button className="button compact" onClick={onReload}>Reload run</button></div>}
    <div className="chart-inspector">
      <span className="inspector-label"><Crosshair size={14} aria-hidden="true" /> RAW INSPECTION</span>
      <output aria-live="off" data-testid={`reading-${metric}`}>{activeReading ? readingText(activeReading, metric, locale) : 'Hover or use the arrow keys'}</output>
      <span role="status" className="sr-only">{announced ? readingText(announced, metric, locale) : ''}</span>
      <form className="inspect-form" onSubmit={event => { event.preventDefault(); inspect(Number(stepInput), true) }}>
        <label><span className="sr-only">{title} step to inspect</span><input type="number" min={a} max={b} step={1} required disabled={!present} value={stepInput} onChange={event => setStepInput(event.target.value)} placeholder="Step" /></label>
        <button type="submit" className="button compact" disabled={!present || !stepInput}>Inspect</button>
      </form>
    </div>
    <p className="chart-hint" id={`inspect-help-${metric}`}><CircleHelp size={14} aria-hidden="true" /> {description} Drag to zoom; use ←/→, Shift+arrow, Home or End to inspect.</p>
  </section>
}
