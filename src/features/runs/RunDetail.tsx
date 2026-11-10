import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, FlaskConical, Info, Radio } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from '../../app/navigation'
import { Empty, Failure, Loading, StatusBadge } from '../../components/ui'
import { countValue, metricValue } from '../../data/format'
import { RUNS, VERSION } from '../../data/generate'
import type { Results } from '../../data/protocol'
import { createRunClient, type RunClient } from '../../data/runClient'
import { METRICS, type Point, type Reading, type RunSpec } from '../../data/types'
import { MetricChart } from './MetricChart'

type Data = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; result: Results['load']; client: RunClient }
const metricNames = { loss: 'Loss', lr: 'Learning rate', grad_norm: 'Gradient norm' }

function SourceNotes({ data, run, locale }: { data: Results['load']; run: RunSpec; locale: string }) {
  const { summary, duplicates } = data
  const { quality, count, anomalyCount } = summary
  const n = (v: number) => countValue(v, locale)
  const formatReading = (value: Reading) => typeof value === 'number' ? metricValue(value, locale) : value
  const invalid = METRICS.flatMap(metric => Object.entries(quality.invalid[metric]).filter(([, count]) => count > 0).map(([kind, count]) => ({
    key: `${metric}-${kind}`, name: `${metricNames[metric]} · ${kind}`, value: n(count),
  })))
  const issues = [
    ...invalid,
    ...(quality.missingSteps ? [{ key: 'gaps', name: 'Missing expected samples', value: `${n(quality.missingSteps)} in ${n(quality.gaps)} ranges` }] : []),
    ...(quality.duplicates ? [{ key: 'dup', name: 'Discarded duplicate rows', value: n(quality.duplicates) }] : []),
    ...(quality.conflicting ? [{ key: 'conflicts', name: 'Conflicting duplicates¹', value: n(quality.conflicting) }] : []),
    ...(quality.unsorted ? [{ key: 'sort', name: 'Source order reversals', value: n(quality.unsorted) }] : []),
    ...(quality.offGrid ? [{ key: 'grid', name: 'Off-grid observations', value: n(quality.offGrid) }] : []),
  ]
  return <aside className="evidence" aria-label="Run evidence">
    <section className="panel evidence-panel">
      <h2><Radio size={17} aria-hidden="true" /> Scenario</h2>
      <h3>{run.scenario}</h3><p>{run.description}</p>
      <div className="evidence-note"><Info size={16} aria-hidden="true" /><p>Compare loss shape, learning rate, and gradients before making a stop or continue decision. This monitor makes no recommendation.</p></div>
    </section>
    <section className="panel evidence-panel">
      <h2>{anomalyCount ? <AlertTriangle className="text-warn" size={17} aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />} Data quality</h2>
      {issues.length ? <dl className="issue-list">{issues.map(issue => <div key={issue.key}><dt>{issue.name}</dt><dd>{issue.value}</dd></div>)}</dl>
        : <p>{count ? 'No data integrity flags in the retained observations.' : 'No observations are available to check.'}</p>}
      {quality.conflicting > 0 && <p>¹ Included in the duplicate count. The last source row at each step is retained.</p>}
      {duplicates.length > 0 && <details className="duplicate-details"><summary>Inspect discarded values</summary>
        {duplicates.map(d => <div key={d.discardedRow}><p>Step {n(d.step)} · row {n(d.discardedRow)} → row {n(d.retainedRow)}</p>
          <dl className="issue-list">{METRICS.map(m => <div key={m}><dt>{metricNames[m]}</dt><dd>{formatReading(d.discarded[m])} → {formatReading(d.retained[m])}</dd></div>)}</dl></div>)}</details>}
    </section>
    <section className="panel evidence-panel">
      <h2><FlaskConical size={17} aria-hidden="true" /> Source contract</h2>
      <dl className="issue-list"><div><dt>Version</dt><dd>{data.version}</dd></div>
        <div><dt>Source rows</dt><dd>{n(summary.sourceCount)}</dd></div>
        <div><dt>Expected interval</dt><dd>{n(run.interval)} {run.interval === 1 ? 'step' : 'steps'}</dd></div></dl>
      <p>Fixed synthetic data with no timestamps. Counts refer to observations; step gaps are measured against the expected interval.</p>
    </section>
  </aside>
}

export function RunDetail({ run, locale }: { run: RunSpec; locale: string }) {
  const [data, setData] = useState<Data>({ kind: 'loading' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    let client: RunClient | undefined
    const fail = (error: unknown) => { if (active) setData({ kind: 'error', message: error instanceof Error ? error.message : 'Unknown error.' }) }
    try {
      client = createRunClient()
      const session = client
      void session.request('load', { id: run.id }).then(result => {
        if (!active) return
        if (result.version !== VERSION) throw new Error('This run is from a different dataset version. Reload to get the current snapshot.')
        setData({ kind: 'ready', result, client: session })
      }).catch(fail)
    } catch (error) { fail(error) }
    return () => { active = false; client?.close() }
  }, [run.id, retry])
  const index = RUNS.indexOf(run)
  const prev = RUNS[index - 1], next = RUNS[index + 1]
  const n = (value: number) => countValue(value, locale)
  const reload = () => { setData({ kind: 'loading' }); setRetry(i => i + 1) }
  return <>
    <div className="detail-nav">
      <Link className="back-link" href="/#runs"><ArrowLeft size={16} aria-hidden="true" /> All training runs</Link>
      <div className="neighbor-nav">
        {prev && <Link href={`/runs/${prev.id}`} className="icon-button" title={`Previous: ${prev.name}`} aria-label={`Previous run: ${prev.name}`}><ChevronLeft size={17} aria-hidden="true" /></Link>}
        <span className="numeric">{n(index + 1)} / {n(RUNS.length)}</span>
        {next && <Link href={`/runs/${next.id}`} className="icon-button" title={`Next: ${next.name}`} aria-label={`Next run: ${next.name}`}><ChevronRight size={17} aria-hidden="true" /></Link>}
      </div>
    </div>
    <div className="page-intro detail-intro">
      <div className="eyebrow"><span className="accent-dot" /> RUN DETAIL <span className="eyebrow-divider">/</span> <span className="run-id">{run.id}</span></div>
      <div className="intro-row"><div><h1 tabIndex={-1}>{run.name}</h1><p>{run.scenario} · fixed synthetic snapshot</p></div><StatusBadge status={run.status} /></div>
    </div>
    {data.kind === 'loading' && <div className="panel"><Loading>Loading observations for {run.name}…</Loading></div>}
    {data.kind === 'error' && <div className="panel"><Failure title="Couldn’t load run" retry={reload}>{data.message}</Failure></div>}
    {data.kind === 'ready' && (() => {
      const { summary } = data.result
      const { stats, domain, anomalyCount } = summary
      const card = (label: string, point: Point | null) => <div className="panel metric-card"><div className="stat-label">{label}</div>
        <strong className="numeric" title={point ? metricValue(point.value, locale) : undefined}>{point ? metricValue(point.value, locale, false) : '—'}</strong>
        <small>{point ? `Step ${n(point.step)}` : 'No valid reading'}</small></div>
      return <>
        <div className="detail-stats" aria-label="Run summary">
          <div className="panel metric-card"><div className="stat-label">Total steps</div><strong className="numeric">{n(summary.count)}</strong><small>Distinct observations</small></div>
          {card('Latest valid loss', stats.loss.latest)}{card('Minimum loss', stats.loss.min)}{card('Maximum loss', stats.loss.max)}
          <div className="panel metric-card"><div className="stat-label">Data anomalies</div><strong className={`numeric ${anomalyCount ? 'text-warn' : ''}`}>{n(anomalyCount)}</strong><small>{summary.count ? 'Integrity flags' : 'No data to check'}</small></div>
        </div>
        <div className="detail-grid">
          <div className="signals">
            <div className="section-heading"><div><h2>Training signals</h2><p>Independent viewports · raw measurements · no smoothing</p></div></div>
            {domain ? METRICS.map(metric => <MetricChart key={metric} client={data.client} metric={metric} domain={domain} stats={stats[metric]} interval={run.interval} locale={locale} onReload={reload} />)
              : <div className="panel"><Empty title="No observations yet" action={<Link className="button" href="/#runs">Explore other runs <ArrowRight size={15} aria-hidden="true" /></Link>}>This queued fixture has no points to plot or inspect.</Empty></div>}
          </div>
          <SourceNotes data={data.result} run={run} locale={locale} />
        </div>
      </>
    })()}
  </>
}
