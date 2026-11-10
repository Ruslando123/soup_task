import { ArrowDown, ArrowRight, ArrowUp, Flag, Grid2X2, Search, ShieldCheck, Terminal, X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '../../app/navigation'
import { Dialog } from '../../components/Dialog'
import { Empty, Failure, Loading } from '../../components/ui'
import { countValue, metricValue } from '../../data/format'
import type { Catalog, CatalogRun, RunStatus } from '../../data/types'
import { DEFAULT_SORT, loadCatalog, STATUSES, visibleRuns, type QualityFilter, type Sort, type SortKey } from './catalog'

type Load = { kind: 'loading' } | { kind: 'ready'; data: Catalog } | { kind: 'error'; message: string }
type Props = {
  locale: string; project: string; quality: QualityFilter; compareOpen: boolean
  closeCompare: () => void; showCompare: () => void; clearScope: () => void; showSampleCsv: () => void
}
const sorts: [string, SortKey, boolean][] = [
  ['Fixture order', 'rank', true], ['Run name', 'name', true], ['Lowest loss', 'loss', true],
  ['Highest loss', 'loss', false], ['Highest spend', 'spend', false], ['Most steps', 'steps', false], ['Most events', 'quality', false],
]
const columns: [string, SortKey, string?][] = [
  ['Run name', 'name'], ['Status', 'status'], ['Loss', 'loss', 'Latest loss'],
  ['Progress', 'steps', 'Progress (steps)'], ['Spend', 'spend'], ['Events', 'quality'],
]
const number = (n: number, locale: string) => countValue(n, locale)
const cash = (n: number, locale: string) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(n)
const signedPercent = (n: number, locale: string) => new Intl.NumberFormat(locale, {
  style: 'percent', maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: 'exceptZero',
}).format(n / 100)
const compactStep = (n: number, locale: string) => n >= 1_000_000
  ? new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 1_000_000) + 'M'
  : number(n, locale)

function Sparkline({ run }: { run: CatalogRun }) {
  return run.lossPath
    ? <svg className={`run-spark ${run.id === 'diverging' ? 'rising' : run.id === 'million' || run.summary.anomalyCount ? 'warn' : ''}`} viewBox="0 0 110 32" role="img" aria-label="Loss history with a separate scale for this run">
        <path d={run.lossPath} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    : <span className="muted" aria-label="No loss history">—</span>
}

export function RunList({ locale, project, quality, compareOpen, closeCompare, showCompare, clearScope, showSampleCsv }: Props) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [retry, setRetry] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<RunStatus | 'all'>('all')
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [selection, setSelection] = useState<string[]>([])
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    void loadCatalog(controller.signal).then(data => {
      if (!controller.signal.aborted) setLoad({ kind: 'ready', data })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoad({ kind: 'error', message: error instanceof Error ? error.message : 'Unknown error.' })
    })
    return () => controller.abort()
  }, [retry])
  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]') && search.current) {
        event.preventDefault()
        search.current.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  const runs = load.kind === 'ready' ? load.data.runs : undefined
  const shown = useMemo(() => runs ? visibleRuns(runs, query, status, quality, project, sort, locale) : [], [runs, query, status, quality, project, sort, locale])
  const selected = runs?.filter(run => selection.includes(run.id)) ?? []
  const clear = () => { setQuery(''); setStatus('all'); clearScope() }
  const fmt = (value: number) => countValue(value, locale)
  const sortKey = `${sort.key}:${sort.asc}`
  const sortHeader = (label: string, key: SortKey, ariaLabel?: string) => {
    const Icon = sort.asc ? ArrowUp : ArrowDown
    return <th scope="col" className={`catalog-col-${key}`} aria-sort={sort.key === key ? (sort.asc ? 'ascending' : 'descending') : undefined}>
      <button type="button" aria-label={ariaLabel} onClick={() => setSort(s => ({ key, asc: s.key === key ? !s.asc : key === 'name' || key === 'status' }))}>
        {label}{sort.key === key ? <Icon size={10} aria-hidden="true" /> : key === 'name' && sort.key === 'rank' ? <ArrowDown size={10} aria-hidden="true" /> : null}
      </button>
    </th>
  }
  return <section className="run-workspace" aria-labelledby="runs-heading">
    <div className="workspace-heading">
      <div>
        <div className="workspace-kicker">AI TRAINING DEMO</div>
        <div className="workspace-title"><h1 id="runs-heading" tabIndex={-1}>Training runs</h1>{runs && <span className="heading-count" title={`${fmt(runs.length)} runs`}>{fmt(runs.length)}</span>}</div>
        <p>These runs use simulated data. Open a run to see how its training error (loss) changes, or select two to four runs to compare.</p>
      </div>
      <Link className="button workspace-primary" href="/runs/million">Open demo run <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
    {load.kind === 'loading' && <div className="catalog-surface"><Loading>Loading training runs…</Loading></div>}
    {load.kind === 'error' && <div className="catalog-surface"><Failure title="Couldn’t load training runs" retry={() => { setLoad({ kind: 'loading' }); setRetry(n => n + 1) }}>{load.message}</Failure></div>}
    {runs && <>
      <div className="workspace-summary" aria-label="Dataset summary">
        <div><i className="workspace-live" aria-hidden="true" /><strong>{fmt(runs.filter(run => run.status === 'Running').length)}</strong> active runs</div>
        <div><i className="workspace-live warn" aria-hidden="true" /><strong>{fmt(runs.filter(run => run.summary.anomalyCount).length)}</strong> with data warnings</div>
        <div><span className="numeric">{cash(runs.reduce((sum, run) => sum + run.demoSpend, 0), locale)}</span> simulated compute spend</div>
        <span className="workspace-summary-note">Fixed synthetic dataset · {load.kind === 'ready' && load.data.version}</span>
      </div>
      <div className="workspace-tools">
        <label className="workspace-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search runs</span>
          <input ref={search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search runs, IDs, or projects…" />
          <kbd aria-hidden="true">⌘ K</kbd>
        </label>
        <label><span className="sr-only">Filter by status</span><select className="ui-select" value={status} onChange={e => setStatus(e.target.value as typeof status)}>
          <option value="all">All statuses</option>{STATUSES.map(s => <option key={s}>{s}</option>)}
        </select></label>
        <label className="sort-control"><span className="sr-only">Sort runs</span><select className="ui-select" value={sortKey} onChange={e => {
          const match = sorts.find(([, key, asc]) => `${key}:${asc}` === e.target.value)
          if (match) setSort({ key: match[1], asc: match[2] })
        }}>
          {sorts.map(([label, key, asc]) => <option key={`${key}:${asc}`} value={`${key}:${asc}`}>{label}</option>)}
          {!sorts.some(([, key, asc]) => key === sort.key && asc === sort.asc) && <option value={sortKey}>By {sort.key}</option>}
        </select></label>
        <button type="button" className="button workspace-compare" onClick={showCompare}><Grid2X2 size={15} aria-hidden="true" />Compare{selection.length ? ` (${selection.length})` : ''}</button>
      </div>
      {(project || quality !== 'all') && <div className="catalog-scope">
        {project && <span>{project}</span>}{quality !== 'all' && <span>{quality === 'flagged' ? 'With warnings' : 'No warnings'}</span>}
        <button type="button" className="workspace-icon" aria-label="Clear filters" title="Clear filters" onClick={clear}><X size={14} aria-hidden="true" /></button>
      </div>}
      <div className="catalog-surface">
        {shown.length ? <div className="catalog-scroll" role="region" tabIndex={0} aria-label="Training runs table">
          <table className="catalog-table">
            <thead><tr><th scope="col" className="catalog-select"><span className="sr-only">Select for comparison</span></th>
              {columns.slice(0, 3).map(([label, key, ariaLabel]) => <Fragment key={key}>{sortHeader(label, key, ariaLabel)}</Fragment>)}
              <th scope="col" className="catalog-history">Loss history</th>
              {columns.slice(3).map(([label, key, ariaLabel]) => <Fragment key={key}>{sortHeader(label, key, ariaLabel)}</Fragment>)}
              <th scope="col" className="catalog-open"><span className="sr-only">Open run</span></th>
            </tr></thead>
            <tbody>{shown.map(run => {
              const latest = run.summary.stats.loss.latest
              const selected = selection.includes(run.id)
              const name = run.name
              return <tr key={run.id}>
                <td className="catalog-select"><input type="checkbox" aria-label={`Compare ${name}`} checked={selected} disabled={!selected && selection.length >= 4} onChange={e => setSelection(values => e.target.checked ? [...values, run.id] : values.filter(id => id !== run.id))} /></td>
                <th scope="row" className="catalog-col-name"><Link className="catalog-name" href={`/runs/${run.id}`} title={run.scenario}>{name}</Link>
                  <small>{run.project} <span className="numeric">· {run.id}</span></small>
                </th>
                <td className="catalog-col-status"><span className={`catalog-status ${run.status.toLowerCase()}`}><i aria-hidden="true" />{run.status}</span></td>
                <td className="catalog-col-loss numeric">
                  {latest ? <span title={metricValue(latest.value, locale)}>{metricValue(latest.value, locale, false)}</span> : <span className="muted" aria-label="No loss">—</span>}
                  {run.lossChange !== null && <small className={run.lossChange > 0 ? 'loss-up' : 'loss-down'} title="Change from the first valid recorded step">{signedPercent(run.lossChange, locale)}</small>}
                </td>
                <td className="catalog-history"><Sparkline run={run} /></td>
                <td className="catalog-col-steps">
                  <span className="numeric" title={`${fmt(run.summary.count)} observed steps of a simulated ${fmt(run.target)}-step plan`}>{compactStep(run.summary.count, locale)} <span className="muted">/ {compactStep(run.target, locale)}</span></span>
                  <div className="catalog-progress" aria-hidden="true"><i style={{ width: `${Math.min(100, run.summary.count / run.target * 100)}%` }} /></div>
                </td>
                <td className="catalog-col-spend numeric" title="Simulated compute spend">{cash(run.demoSpend, locale)}</td>
                <td className="catalog-col-quality">{run.summary.anomalyCount ? <span className="catalog-issues" title="Data quality warnings"><Flag size={13} aria-hidden="true" />{fmt(run.summary.anomalyCount)}<span className="sr-only"> data quality flags</span></span> : <span className="muted" aria-label="No data quality flags">—</span>}</td>
                <td className="catalog-open"><Link href={`/runs/${run.id}`} className="workspace-icon" aria-label={`Open ${name}`}><ArrowRight size={16} aria-hidden="true" /></Link></td>
              </tr>
            })}</tbody>
          </table>
        </div> : <Empty title="No matching runs" action={<button className="button" onClick={clear}>Reset filters</button>}>Try a different search or clear your filters.</Empty>}
      </div>
      <div className="catalog-footer"><span role="status">{fmt(shown.length)} of {fmt(runs.length)} runs <span className="muted">· demo snapshot</span></span><span><ShieldCheck size={14} aria-hidden="true" />Extrema preserved · inspect raw values</span></div>
      <div className="workspace-callout">
        <span className="workspace-callout-icon"><Terminal size={26} aria-hidden="true" /></span>
        <div><h2>Example training data</h2><p>See how a training step and its measurements are recorded.</p></div>
        <button type="button" className="button" onClick={showSampleCsv}>View sample CSV <ArrowRight size={16} aria-hidden="true" /></button>
      </div>
    </>}
    {compareOpen && <Dialog title="Compare runs" close={closeCompare}>
      {selected.length < 2 ? <p>Select two to four runs with the checkboxes in the catalog.</p> : <>
        <p>Exact summaries from retained observations. Each loss history uses its own vertical scale.</p>
        <div className="workspace-compare-grid">{selected.map(run => <article key={run.id}>
          <h3><Link href={`/runs/${run.id}`} onClick={closeCompare}>{run.name} <ArrowRight size={13} aria-hidden="true" /></Link></h3>
          <Sparkline run={run} />
          <dl>{(['latest', 'min', 'max'] as const).map((stat, i) => <div key={stat}><dt>{['Latest loss', 'Min loss', 'Max loss'][i]}</dt><dd className="numeric">{run.summary.stats.loss[stat] ? metricValue(run.summary.stats.loss[stat].value, locale) : '—'}</dd></div>)}
            <div><dt>Observed steps</dt><dd className="numeric">{fmt(run.summary.count)}</dd></div></dl>
        </article>)}</div>
      </>}
    </Dialog>}
  </section>
}
