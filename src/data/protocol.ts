import type { ChartFrame, Duplicate, Inspection, Metric, Range, RunSummary } from './types'

export type Payloads = {
  load: { id: string }
  sample: { metric: Metric; range: Range; width: number; log: boolean }
  inspect: { step: number }
}
export type Results = {
  load: { summary: RunSummary; duplicates: Duplicate[]; version: string }
  sample: ChartFrame
  inspect: Inspection
}
export type Action = keyof Payloads
export type Request = { [K in Action]: { key: number; action: K; payload: Payloads[K] } }[Action]
export type Reply = { key: number; result: Results[Action] } | { key: number; error: string }
