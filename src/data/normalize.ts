import { METRICS, type Duplicate, type Inspection, type Metric, type MetricStats, type Normalized, type Quality, type RawRun, type Readings } from './types.ts'

const emptyCounts = () => ({ missing: 0, NaN: 0, '+Infinity': 0, '−Infinity': 0 })
export function reading(raw: RawRun, metric: Metric, i: number) {
  const value = raw.values[metric][i]!
  if (raw.missing?.[metric]?.[i]) return 'missing'
  if (value === Infinity) return '+Infinity'
  if (value === -Infinity) return '−Infinity'
  if (Number.isNaN(value)) return 'NaN'
  return value
}
const readings = (raw: RawRun, i: number): Readings => ({
  loss: reading(raw, 'loss', i), lr: reading(raw, 'lr', i), grad_norm: reading(raw, 'grad_norm', i),
})

export function lowerBound(steps: Float64Array, value: number, strict = false) {
  let a = 0, b = steps.length
  while (a < b) {
    const mid = a + ((b - a) >>> 1)
    const x = steps[mid]!
    if (x < value || (strict && x === value)) a = mid + 1
    else b = mid
  }
  return a
}

/** Expected lattice is anchored at the first retained step. Count slots strictly between observations. */
export function missingBetween(a: number, b: number, origin: number, interval: number) {
  return Math.max(0, Math.ceil((b - origin) / interval) - Math.floor((a - origin) / interval) - 1)
}

export function normalize(raw: RawRun): Normalized {
  const n = raw.steps.length
  if (!Number.isSafeInteger(raw.interval) || raw.interval <= 0 || METRICS.some(m =>
    raw.values[m].length !== n || (raw.missing?.[m] && raw.missing[m].length !== n))) {
    throw new Error('The source columns or sampling interval are invalid.')
  }
  const quality: Quality = {
    invalid: { loss: emptyCounts(), lr: emptyCounts(), grad_norm: emptyCounts() },
    duplicates: 0, conflicting: 0, unsorted: 0, missingSteps: 0, gaps: 0, offGrid: 0,
  }
  let reorder = false
  for (let i = 0; i < n; i++) {
    const step = raw.steps[i]!
    if (!Number.isSafeInteger(step) || step < 0) throw new Error('A step is not a nonnegative safe integer.')
    if (i && step <= raw.steps[i - 1]!) {
      reorder = true
      if (step < raw.steps[i - 1]!) quality.unsorted++
    }
  }
  let clean = raw
  const duplicates: Duplicate[] = []
  if (reorder) {
    const order = Uint32Array.from(raw.steps, (_, i) => i)
    order.sort((a, b) => raw.steps[a]! - raw.steps[b]! || a - b)
    const retained: number[] = []
    for (let i = 0; i < n;) {
      let j = i + 1
      const step = raw.steps[order[i]!]!
      while (j < n && raw.steps[order[j]!] === step) j++
      const winner = order[j - 1]!
      retained.push(winner)
      for (; i < j - 1; i++) {
        const loser = order[i]!
        quality.duplicates++
        const a = readings(raw, loser), b = readings(raw, winner)
        if (METRICS.some(m => !Object.is(a[m], b[m]))) {
          quality.conflicting++
          duplicates.push({ step, discardedRow: loser + 1, retainedRow: winner + 1, discarded: a, retained: b })
        }
      }
      i = j
    }
    const copy = (column: Float64Array) => Float64Array.from(retained, i => column[i]!)
    const missing: RawRun['missing'] = {}
    for (const m of METRICS) {
      const mask = raw.missing?.[m]
      if (mask) missing[m] = Uint8Array.from(retained, i => mask[i]!)
    }
    clean = { steps: copy(raw.steps), values: { loss: copy(raw.values.loss), lr: copy(raw.values.lr), grad_norm: copy(raw.values.grad_norm) }, interval: raw.interval, missing }
  }
  const { steps, interval } = clean
  const count = steps.length, origin = steps[0] ?? 0
  for (let i = 0; i < count; i++) {
    const x = steps[i]!
    if ((x - origin) % interval) quality.offGrid++
    if (i && x - steps[i - 1]! > interval) {
      const missing = missingBetween(steps[i - 1]!, x, origin, interval)
      if (missing) { quality.gaps++; quality.missingSteps += missing }
    } else if (i && quality.offGrid) {
      const missing = missingBetween(steps[i - 1]!, x, origin, interval)
      if (missing) { quality.gaps++; quality.missingSteps += missing }
    }
  }
  const stat = (m: Metric): MetricStats => {
    let low = Infinity, high = -Infinity, firstMin = -1, firstMax = -1, last = -1, zeros = 0, negative = 0
    const col = clean.values[m], mask = clean.missing?.[m], invalid = quality.invalid[m]
    for (let i = 0; i < count; i++) {
      const y = col[i]!
      if (mask?.[i]) { invalid.missing++; continue }
      if (!Number.isFinite(y)) {
        if (y === Infinity) invalid['+Infinity']++
        else if (y === -Infinity) invalid['−Infinity']++
        else invalid.NaN++
        continue
      }
      if (y < low) { low = y; firstMin = i }
      if (y > high) { high = y; firstMax = i }
      if (y === 0) zeros++
      if (y < 0) negative++
      last = i
    }
    const point = (i: number) => i < 0 ? null : { step: steps[i]!, value: col[i]! }
    return { latest: point(last), min: point(firstMin), max: point(firstMax), zeros, negative }
  }
  const stats = { loss: stat('loss'), lr: stat('lr'), grad_norm: stat('grad_norm') }
  const invalidTotal = METRICS.reduce((total, m) => total + Object.values(quality.invalid[m]).reduce((a, b) => a + b, 0), 0)
  return { ...clean, duplicates, summary: {
    sourceCount: n, count, domain: count ? [origin, steps[count - 1]!] : null, stats, quality,
    anomalyCount: invalidTotal + quality.duplicates + quality.unsorted + quality.missingSteps + quality.offGrid,
  } }
}

export function inspect(run: Normalized, requested: number): Inspection {
  const { steps, interval } = run
  if (!steps.length || !Number.isFinite(requested)) return { kind: 'empty' }
  // Inspection is of an integer step. It never leaps across a known missing range.
  const at = Math.round(requested)
  const right = lowerBound(steps, at), before = steps[right - 1], after = steps[right]
  if (before !== undefined && after !== undefined && after !== at && missingBetween(before, after, steps[0]!, interval)) {
    return { kind: 'gap', requested: at, after: before, before: after }
  }
  const i = before !== undefined && (after === undefined || at - before <= after - at) ? right - 1 : right
  return { kind: 'observed', requested: at, step: steps[i]!, values: readings(run, i) }
}
