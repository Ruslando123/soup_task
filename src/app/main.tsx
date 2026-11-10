import { ArrowUpRight, Bell, BookOpen, ChevronDown, ChevronRight, Layers3, MoreHorizontal, Plus, Settings } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Link, Navigation } from './navigation'
import { Dialog } from '../components/Dialog'
import { Empty } from '../components/ui'
import { RunList } from '../features/runs/RunList'
import { RunDetail } from '../features/runs/RunDetail'
import type { QualityFilter } from '../features/runs/catalog'
import { PROJECTS, projectFor } from '../data/catalogFixture'
import { RUNS, SEED, VERSION } from '../data/generate'
import './styles.css'
import './workspace.css'

const listUrl = '/#runs'
const locationKey = () => location.pathname + location.hash
const activeRuns = RUNS.filter(run => run.status === 'Running').length
type Popup = 'compare' | 'sampleCsv' | 'workspace' | 'projects' | 'docs' | 'settings' | 'notices'

function App() {
  const [path, setPath] = useState(locationKey)
  const [locale, setLocale] = useState(() => navigator.language || 'en-US')
  const [moved, setMoved] = useState(false)
  const [project, setProject] = useState('')
  const [quality, setQuality] = useState<QualityFilter>('all')
  const [popup, setPopup] = useState<Popup | null>(null)
  const [pathname, hash] = path.split('#')
  const list = (pathname === '/' || pathname === '/runs' || pathname === '/runs/') && !hash?.startsWith('run/')
  const run = RUNS.find(r => pathname === `/runs/${r.id}` || pathname === `/runs/${r.id}/` || (pathname === '/' && hash === `run/${r.id}`))
  const navigate = useCallback((next: string) => {
    if (locationKey() === next) return
    history.pushState(null, '', next)
    setMoved(true)
    setPath(next)
  }, [])
  useEffect(() => {
    const pop = () => { setMoved(true); setPath(locationKey()); setPopup(null) }
    window.addEventListener('popstate', pop)
    window.addEventListener('hashchange', pop)
    return () => {
      window.removeEventListener('popstate', pop)
      window.removeEventListener('hashchange', pop)
    }
  }, [])
  useEffect(() => {
    document.title = (run ? run.name : list ? 'Training runs' : 'Run not found') + ' — Soup'
    if (!moved) return
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, 0)
      document.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [path, moved, list, run])

  const close = () => setPopup(null)
  const chooseProject = (value: string) => { setProject(value); navigate(listUrl); close() }
  const goToFlags = () => { setQuality('flagged'); setProject(''); navigate(listUrl); close() }
  const clearProject = () => setProject('')
  const snapshot = <p>This workspace contains {RUNS.length} reproducible synthetic runs. No live telemetry or infrastructure is connected.</p>
  return <Navigation.Provider value={navigate}>
    <a className="skip-link" href="#content" onClick={event => {
      event.preventDefault()
      const content = document.getElementById('content')
      content?.focus({ preventScroll: true })
      content?.scrollIntoView()
    }}>Skip to main content</a>
    <aside className="workspace-sidebar">
      <Link className="workspace-brand" href={listUrl} aria-label="Soup home" onClick={clearProject}><img src="/mark.svg" alt="" width="34" height="34" /><span>Soup</span></Link>
      <button className="workspace-org" type="button" onClick={() => setPopup('workspace')}>
        <span className="workspace-org-avatar" aria-hidden="true">M</span><span>Meridian AI<small>Demo workspace</small></span><ChevronDown size={14} aria-hidden="true" />
      </button>
      <div className="workspace-nav-label">WORKSPACE</div>
      <nav aria-label="Workspace">
        <Link href={listUrl} className="workspace-nav-item" onClick={clearProject} aria-current={list ? 'page' : undefined}><Layers3 size={18} aria-hidden="true" /><span>Training runs</span><span className="workspace-nav-count" aria-hidden="true">{RUNS.length}</span></Link>
      </nav>
      <div className="workspace-nav-label workspace-project-label">PROJECTS<button type="button" className="workspace-icon" aria-label="Browse projects" onClick={() => setPopup('projects')}><Plus size={14} aria-hidden="true" /></button></div>
      <nav className="workspace-projects" aria-label="Filter by project">{PROJECTS.map((name, i) => <button type="button" key={name} className={`workspace-project ${list && project === name ? 'selected' : ''}`} aria-pressed={list && project === name} onClick={() => chooseProject(list && project === name ? '' : name)}>
        <i className={`project-dot project-${i}`} aria-hidden="true" />{name}{i === 0 && <span>{RUNS.filter(r => projectFor(r.id) === name).length}</span>}
      </button>)}</nav>
      <div className="workspace-sidebar-bottom">
        <div className="workspace-compute">
          <div><i className="workspace-live" aria-hidden="true" /> Simulated compute <span className="numeric">{Math.round(activeRuns / RUNS.length * 100)}%</span></div>
          <div className="workspace-meter" aria-hidden="true"><i style={{ width: `${activeRuns / RUNS.length * 100}%` }} /></div>
          <small>{activeRuns} active runs · fixed snapshot</small>
        </div>
        <button type="button" className="workspace-nav-item" onClick={() => setPopup('docs')}><BookOpen size={17} aria-hidden="true" />Documentation<ArrowUpRight className="workspace-nav-end" size={13} aria-hidden="true" /></button>
        <button type="button" className="workspace-nav-item" onClick={() => setPopup('settings')}><Settings size={17} aria-hidden="true" />Workspace settings</button>
        <div className="workspace-user">
          <span className="workspace-avatar" aria-hidden="true">JL</span><span>Jamie Lee<small>Demo profile</small></span>
          <button type="button" className="workspace-icon" aria-label="About this demo profile" onClick={() => setPopup('workspace')}><MoreHorizontal size={14} aria-hidden="true" /></button>
        </div>
      </div>
    </aside>
    <div className="workspace-main">
      <header className="workspace-topbar">
        <nav className="workspace-breadcrumb" aria-label="Breadcrumb">
          <span>Workspace</span><ChevronRight size={12} aria-hidden="true" /><Link href={listUrl} aria-current={list ? 'page' : undefined} onClick={clearProject}>Training runs</Link>
          {run && <><ChevronRight className="workspace-run-crumb" size={12} aria-hidden="true" /><span className="numeric workspace-run-crumb">{run.id}</span></>}
        </nav>
        <div className="workspace-top-tools">
          <span className="workspace-environment"><i className="workspace-live" aria-hidden="true" /> Static snapshot</span>
          <span className="workspace-top-divider" aria-hidden="true" />
          <button type="button" className="workspace-icon" aria-label="Snapshot notices" onClick={() => setPopup('notices')}><Bell size={16} aria-hidden="true" /><i className="workspace-notice" aria-hidden="true" /></button>
          <button type="button" className="workspace-avatar mini" aria-label="JL — Open workspace settings" onClick={() => setPopup('settings')}>JL</button>
        </div>
      </header>
      <main id="content" className="content" tabIndex={-1}>
        {list ? <RunList locale={locale} project={project} quality={quality} compareOpen={popup === 'compare'} closeCompare={close} showCompare={() => setPopup('compare')}
          clearScope={() => { clearProject(); setQuality('all') }} showSampleCsv={() => setPopup('sampleCsv')} /> : run ? <RunDetail key={run.id} run={run} locale={locale} /> :
          <><h1 tabIndex={-1}>Run not found</h1><Empty title="That run isn’t in this dataset" action={<Link className="button" href={listUrl}>Back to training runs</Link>}>Check the address or choose a run from the catalog.</Empty></>}
        <footer className="footer"><span>Soup / Training intelligence</span><span>Synthetic evidence only · {VERSION}</span></footer>
      </main>
    </div>
    {popup === 'workspace' && <Dialog title="Meridian AI · Demo workspace" close={close}>{snapshot}<p className="numeric">{VERSION} · seed {SEED.toString(16)}</p></Dialog>}
    {popup === 'sampleCsv' && <Dialog title="Sample training CSV" close={close}><p>Each row records a step number, loss, learning rate, and gradient norm.</p><pre>{'step,loss,lr,grad_norm\n1,2.58,0.0003,1.94'}</pre></Dialog>}
    {popup === 'projects' && <Dialog title="Projects" close={close}><div className="dialog-projects">{PROJECTS.map(name => <button type="button" className="button" key={name} onClick={() => chooseProject(name)}>{name}</button>)}</div></Dialog>}
    {popup === 'docs' && <Dialog title="Reading the monitor" close={close}>{snapshot}
      <p>Press <kbd>⌘/Ctrl K</kbd> to find a run. The small loss charts keep bucket extrema and explicit breaks; open a run to zoom and read exact source values. Displayed spend is simulated.</p>
      <Link href="/runs/million" className="button" onClick={close}>Open stress test <ArrowUpRight size={14} aria-hidden="true" /></Link></Dialog>}
    {popup === 'notices' && <Dialog title="Snapshot notices" close={close}>{snapshot}<p>Runs with invalid values or missing expected steps are marked in the Events column.</p>
      <button type="button" className="button" onClick={goToFlags}>Show runs with warnings</button></Dialog>}
    {popup === 'settings' && <Dialog title="Workspace settings" close={close}>
      <label className="settings-row">Number format locale<select className="ui-select" value={locale} onChange={e => setLocale(e.target.value)}>
        {!['en-US', 'de-DE', 'fr-FR'].includes(locale) && <option value={locale}>{locale}</option>}
        <option value="en-US">en-US</option><option value="de-DE">de-DE</option><option value="fr-FR">fr-FR</option>
      </select></label>
      <label className="settings-row">Filter by data quality<select className="ui-select" value={quality} onChange={e => setQuality(e.target.value as QualityFilter)}>
        <option value="all">All data quality</option><option value="flagged">With warnings</option><option value="clean">No warnings</option>
      </select></label>
      <button className="button" type="button" onClick={close}>Done</button>
    </Dialog>}
  </Navigation.Provider>
}

createRoot(document.getElementById('root')!).render(<App />)
