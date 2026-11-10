import { generate } from '../src/data/generate.ts'
import { inspect, lowerBound, normalize } from '../src/data/normalize.ts'
import { METRICS, type ChartFrame, type Range } from '../src/data/types.ts'

/** Full resolution reference, deliberately restricted to the continuous, finite benchmark fixture. */
export function baseline() {
  const run = normalize(generate('million'))
  return {
    async load() { return run.summary.domain! },
    async frames(range: Range, _width: number): Promise<ChartFrame[]> {
      const lo = lowerBound(run.steps, range[0]), hi = lowerBound(run.steps, range[1], true)
      return METRICS.map(metric => {
        let min = Infinity, max = -Infinity
        const y = run.values[metric].subarray(lo, hi)
        for (const value of y) { if (value < min) min = value; if (value > max) max = value }
        return {
          x: run.steps.subarray(lo, hi), y, isolated: new Float64Array(),
          sourceCount: hi - lo, eligible: hi - lo, displayed: hi - lo, omittedForLog: 0, breaks: 0,
          extrema: [min, max],
        }
      })
    },
    async inspect(step: number) { return inspect(run, step) },
    close() {},
  }
}
