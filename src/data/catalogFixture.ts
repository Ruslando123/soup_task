import { generate } from './generate.ts'
import { inspect, normalize } from './normalize.ts'
import { sample } from './sample.ts'
import type { CatalogRun, RunSpec } from './types.ts'

export const PROJECTS = ['Foundation models', 'Instruction tuning', 'Embeddings', 'Alignment'] as const
const assignments: readonly (readonly string[])[] = [
  ['million', 'healthy', 'plateau', 'nan', 'spike'],
  ['diverging', 'oscillating', 'lr-change', 'zero-lr', 'noisy'],
  ['tiny', 'gradient', 'zero-loss', 'missing', 'empty'],
  ['duplicates', 'unsorted', 'mixed', 'pos-inf', 'neg-inf'],
]
const order = ['million', 'healthy', 'diverging', 'tiny', 'plateau', 'gradient', 'oscillating']
export function projectFor(id: string) {
  return PROJECTS[assignments.findIndex(group => group.includes(id))] ?? PROJECTS[0]
}

export function makeCatalogRow(spec: RunSpec): CatalogRun {
  const run = normalize(generate(spec.id))
  const { summary } = run
  const project = projectFor(spec.id)
  const rank = order.indexOf(spec.id)
  const target = spec.count === 1_000_000 ? 1_200_000 : spec.status === 'Completed' ? spec.count : 1_500
  const demoSpend = summary.count ? Math.round((rank < 0 ? 125 : [412.8, 379.1, 186.4, 89.6, 496.2, 54.6, 168][rank]!) * 100) / 100 : 0
  let lossPath = '', lossChange: number | null = null
  if (summary.domain) {
    const [start, end] = summary.domain
    const frame = sample(run, 'loss', summary.domain, 48)
    const latest = summary.stats.loss.latest?.value
    const first = inspect(run, start)
    if (first.kind === 'observed' && typeof first.values.loss === 'number' && first.values.loss !== 0 && latest !== undefined) {
      const change = (latest / first.values.loss - 1) * 100
      if (Number.isFinite(change)) lossChange = change
    }
    if (frame.extrema) {
      const [min, max] = frame.extrema
      let pen = false
      for (let i = 0; i < frame.x.length; i++) {
        const y = frame.y[i]!
        if (y === null) { pen = false; continue }
        const x = 1 + (frame.x[i]! - start) / (end - start || 1) * 108
        const height = max === min ? 16 : 29 - (y - min) / (max - min) * 26
        lossPath += `${pen ? 'L' : 'M'}${x.toFixed(2)},${height.toFixed(2)}`
        pen = true
      }
    }
  }
  return { ...spec, summary, project, target, demoSpend, rank: rank < 0 ? order.length + assignments.flat().indexOf(spec.id) : rank, lossPath, lossChange }
}
