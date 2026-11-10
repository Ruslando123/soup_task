import { lowerBound, missingBetween } from './normalize.ts'
import type { ChartFrame, Metric, Normalized, Range } from './types.ts'

/**
 * Bucket by visible x-coordinate (one bucket per CSS pixel). Keep both extrema
 * per continuous fragment, then the outer endpoints of each fragment. A null
 * at the first unavailable position keeps the next fragment disconnected.
 */
export function sample(run: Normalized, metric: Metric, range: Range, width: number, log = false): ChartFrame {
  const { steps, interval } = run
  const col = run.values[metric], mask = run.missing?.[metric]
  const lo = lowerBound(steps, range[0]), hi = lowerBound(steps, range[1], true)
  const sourceCount = hi - lo
  const buckets = Math.min(4096, Math.max(1, Math.floor(width) || 1))
  const direct = sourceCount <= buckets * 2
  const factor = buckets / (range[1] - range[0] || 1)
  const origin = steps[0] ?? 0
  const hasMissing = run.summary.quality.gaps > 0
  const xs: number[] = [], ys: (number | null)[] = [], isolated: number[] = []
  let eligible = 0, displayed = 0, breaks = 0, omittedForLog = 0, min = Infinity, max = -Infinity
  let low = -1, high = -1, bucket = -1, start = -1, end = -1, broken = false
  function push(i: number) {
    const x = steps[i]!
    if (xs.at(-1) === x) return
    xs.push(x); ys.push(col[i]!); displayed++
  }
  function flush() {
    if (low < 0) return
    if (low <= high) { push(low); push(high) } else { push(high); push(low) }
    low = high = -1
  }
  function close() {
    flush()
    if (end >= 0) {
      push(end)
      if (start === end) isolated.push(steps[end]!, col[end]!)
    }
    start = end = -1
  }
  function gap(x: number) {
    close()
    if (!broken) { xs.push(x); ys.push(null); breaks++; broken = true }
  }
  function insideKnownGap(index: number, boundary: number) {
    const before = steps[index - 1], after = steps[index]
    return before !== undefined && after !== undefined && before < boundary && boundary < after &&
      missingBetween(before, after, origin, interval) > 0
  }
  if (hasMissing && insideKnownGap(lo, range[0])) gap(range[0])
  for (let i = lo; i < hi; i++) {
    const x = steps[i]!, y = col[i]!
    if (hasMissing && i > lo) {
      const prev = steps[i - 1]!
      if (missingBetween(prev, x, origin, interval)) gap(origin + (Math.floor((prev - origin) / interval) + 1) * interval)
    }
    if (!Number.isFinite(y) || mask?.[i]) { gap(x); continue }
    if (log && y <= 0) { omittedForLog++; gap(x); continue }
    eligible++
    if (y < min) min = y
    if (y > max) max = y
    if (start < 0) { start = i; push(i) }
    end = i
    broken = false
    if (direct) { push(i); continue }
    const b = Math.min(buckets - 1, Math.floor((x - range[0]) * factor))
    if (b !== bucket) { flush(); bucket = b }
    if (low < 0 || y < col[low]!) low = i
    if (high < 0 || y > col[high]!) high = i
  }
  if (hasMissing && insideKnownGap(hi, range[1])) gap(range[1])
  close()
  return {
    x: Float64Array.from(xs),
    y: breaks ? ys : Float64Array.from(ys as number[]),
    isolated: Float64Array.from(isolated),
    sourceCount, eligible, displayed, omittedForLog, breaks, extrema: displayed ? [min, max] : null,
  }
}
