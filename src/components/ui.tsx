import { AlertTriangle, ArrowUpRight, Database, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import type { RunStatus } from '../data/types'

export function StatusBadge({ status }: { status: RunStatus }) {
  return <span className={`status status-${status.toLowerCase()}`}><i aria-hidden="true" />{status}</span>
}
export function Loading({ children }: { children: ReactNode }) {
  return <div className="state" role="status"><LoaderCircle className="state-icon" aria-hidden="true" size={25} /><p>{children}</p></div>
}
export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="state"><Database className="state-icon" aria-hidden="true" size={25} /><h2>{title}</h2><p>{children}</p>{action}</div>
}
export function Failure({ title, children, retry }: { title: string; children: ReactNode; retry?: () => void }) {
  return <div className="state" role="alert"><AlertTriangle className="state-icon text-warn" aria-hidden="true" size={25} /><h2>{title}</h2><p>{children}</p>
    {retry && <button className="button" type="button" onClick={retry}>Try again <ArrowUpRight size={14} aria-hidden="true" /></button>}</div>
}
