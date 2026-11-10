import { RUNS, VERSION } from '../../data/generate'
import type { Catalog, CatalogRun, RunStatus } from '../../data/types'

export const STATUSES = ['Running', 'Completed', 'Failed', 'Queued'] as const
export type SortKey = 'rank' | 'name' | 'status' | 'loss' | 'steps' | 'spend' | 'quality'
export type Sort = { key: SortKey; asc: boolean }
export type QualityFilter = 'all' | 'flagged' | 'clean'
export const DEFAULT_SORT: Sort = { key: 'rank', asc: true }

export async function loadCatalog(signal: AbortSignal): Promise<Catalog> {
  const response = await fetch(`${import.meta.env.BASE_URL}catalog.json`, { signal, cache: 'no-cache' })
  if (!response.ok) throw new Error(`The dataset could not be loaded (HTTP ${response.status}).`)
  const payload: Catalog = await response.json()
  if (payload?.version !== VERSION || !Array.isArray(payload.runs) || payload.runs.length !== RUNS.length ||
    RUNS.some((run, i) => {
      const row = payload.runs[i]
      return row?.id !== run.id || !Number.isFinite(row.summary?.anomalyCount) || !row.summary?.stats?.loss ||
        typeof row.project !== 'string' || typeof row.lossPath !== 'string' ||
        !Number.isFinite(row.rank) || !Number.isFinite(row.target) || !Number.isFinite(row.demoSpend)
    })) throw new Error('The catalog is incomplete or comes from a different dataset version.')
  return payload
}

export function visibleRuns(runs: CatalogRun[], query: string, status: RunStatus | 'all', quality: QualityFilter, project: string, sort: Sort, locale: string) {
  const search = query.trim().toLocaleLowerCase(locale)
  const collator = new Intl.Collator(locale, { sensitivity: 'base' })
  return runs.filter(run =>
    (!search || [run.name, run.scenario, run.id, run.project].some(s => s.toLocaleLowerCase(locale).includes(search))) &&
    (status === 'all' || run.status === status) &&
    (!project || run.project === project) &&
    (quality === 'all' || Boolean(run.summary.anomalyCount) === (quality === 'flagged')),
  ).sort((a, b) => {
    let comparison: number
    if (sort.key === 'loss') {
      const x = a.summary.stats.loss.latest?.value, y = b.summary.stats.loss.latest?.value
      if (x === undefined || y === undefined) return Number(x === undefined) - Number(y === undefined) || collator.compare(a.name, b.name)
      comparison = x - y
    } else if (sort.key === 'name' || sort.key === 'status') {
      comparison = collator.compare(a[sort.key], b[sort.key])
    } else if (sort.key === 'steps') {
      comparison = a.summary.count - b.summary.count
    } else if (sort.key === 'quality') {
      comparison = a.summary.anomalyCount - b.summary.anomalyCount
    } else {
      comparison = sort.key === 'rank' ? a.rank - b.rank : a.demoSpend - b.demoSpend
    }
    return (sort.asc ? comparison : -comparison) || collator.compare(a.name, b.name)
  })
}
