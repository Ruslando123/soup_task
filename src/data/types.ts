export const METRICS = ['loss', 'lr', 'grad_norm'] as const
export type Metric = (typeof METRICS)[number]
export type RunStatus = 'Running' | 'Completed' | 'Failed' | 'Queued'
export type Columns = Record<Metric, Float64Array>
export type Range = readonly [number, number]
export type InvalidReason = 'missing' | 'NaN' | '+Infinity' | '−Infinity'
export type RunSpec = {
  id: string; name: string; scenario: string; description: string
  status: RunStatus; count: number; interval: number
}
export type RawRun = {
  steps: Float64Array; values: Columns; interval: number
  missing?: Partial<Record<Metric, Uint8Array>>
}
export type Point = { step: number; value: number }
export type MetricStats = { latest: Point | null; min: Point | null; max: Point | null; zeros: number; negative: number }
export type Quality = {
  invalid: Record<Metric, Record<InvalidReason, number>>
  duplicates: number; conflicting: number; unsorted: number; missingSteps: number; gaps: number; offGrid: number
}
export type Duplicate = { step: number; discardedRow: number; retainedRow: number; discarded: Readings; retained: Readings }
export type Reading = number | InvalidReason
export type Readings = Record<Metric, Reading>
export type RunSummary = {
  sourceCount: number; count: number; domain: Range | null; stats: Record<Metric, MetricStats>
  quality: Quality; anomalyCount: number
}
export type Normalized = RawRun & { summary: RunSummary; duplicates: Duplicate[] }
export type CatalogRun = RunSpec & {
  summary: RunSummary; project: string; target: number; demoSpend: number; rank: number; lossPath: string; lossChange: number | null
}
export type Catalog = { version: string; runs: CatalogRun[] }
export type Inspection =
  | { kind: 'observed'; requested: number; step: number; values: Readings }
  | { kind: 'gap'; requested: number; after: number; before: number }
  | { kind: 'empty' }
export type ChartFrame = {
  x: Float64Array; y: Float64Array | (number | null)[]
  isolated: Float64Array
  sourceCount: number; eligible: number; displayed: number; omittedForLog: number; breaks: number
  extrema: Range | null
}
