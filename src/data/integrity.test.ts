import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeCatalogRow } from './catalogFixture'
import { generate, RUNS, VERSION } from './generate'
import { countValue, metricValue } from './format'
import { inspect, normalize } from './normalize'
import { sample } from './sample'
import { METRICS, type Range, type RawRun } from './types'

function rows(steps: number[], loss: number[], interval = 1): RawRun {
  const values = Float64Array.from(loss)
  return { steps: Float64Array.from(steps), values: { loss: values, lr: values, grad_norm: values }, interval }
}

describe('snapshot and normalization', () => {
  it('matches all 20 shipped catalog summaries and generates a deterministic million-point fixture', () => {
    const catalog = JSON.parse(readFileSync(new URL('../../public/catalog.json', import.meta.url), 'utf8'))
    expect(RUNS).toHaveLength(20)
    expect(new Set(RUNS.map(r => r.id)).size).toBe(20)
    expect(catalog).toEqual({ version: VERSION, runs: RUNS.map(makeCatalogRow) })
    const a = generate('million'), b = generate('million')
    expect(a.steps.length).toBe(1_000_000)
    for (const metric of METRICS) expect(Buffer.from(a.values[metric].buffer).equals(Buffer.from(b.values[metric].buffer))).toBe(true)
    expect(a.values.loss.reduce((count, value) => count + Number(value === 1000), 0)).toBe(1)
    expect(a.values.loss[500_122]).toBe(1000)
    expect(generate('empty').steps).toHaveLength(0)
  })

  it('sorts chronologically and retains the final source row, with conflicting evidence', () => {
    const result = normalize(rows([4, 2, 1, 2, 3, 2], [4, 42, 1, 7, 3, 0]))
    expect([...result.steps]).toEqual([1, 2, 3, 4])
    expect([...result.values.loss]).toEqual([1, 0, 3, 4])
    expect(result.summary.quality).toMatchObject({ duplicates: 2, conflicting: 2, unsorted: 3, missingSteps: 0 })
    expect(result.duplicates.map(row => [row.step, row.discardedRow, row.retainedRow, row.discarded.loss, row.retained.loss])).toEqual([
      [2, 2, 6, 42, 0], [2, 4, 6, 7, 0],
    ])
    expect(result.summary.stats.loss.max).toEqual({ step: 4, value: 4 })
  })

  it('keeps NaN, both infinities, explicit null and zero semantically distinct', () => {
    const raw = rows([1, 2, 3, 4, 5, 6, 7], [3, NaN, Infinity, -Infinity, NaN, 0, NaN])
    raw.missing = { loss: Uint8Array.from([0, 0, 0, 0, 1, 0, 0]) }
    const run = normalize(raw)
    expect(run.summary.stats.loss).toEqual({ min: { step: 6, value: 0 }, max: { step: 1, value: 3 }, latest: { step: 6, value: 0 }, zeros: 1, negative: 0 })
    expect(run.summary.quality.invalid.loss).toEqual({ missing: 1, NaN: 2, '+Infinity': 1, '−Infinity': 1 })
    expect([2, 3, 4, 5, 6].map(step => {
      const reading = inspect(run, step)
      return reading.kind === 'observed' ? reading.values.loss : reading.kind
    })).toEqual(['NaN', '+Infinity', '−Infinity', 'missing', 0])
    const frame = sample(run, 'loss', [1, 7], 200)
    expect([...frame.x]).toEqual([1, 2, 6, 7])
    expect(frame.y).toEqual([3, null, 0, null])
    expect([...frame.isolated]).toEqual([1, 3, 6, 0])
    expect(frame.extrema).toEqual([0, 3])
  })

  it('identifies gaps against the expected interval and distinguishes extra off-grid rows', () => {
    const run = normalize(rows([10, 20, 21, 32, 50, 60], [6, 5, 4, 3, 2, 1], 10))
    expect(run.summary.quality).toMatchObject({ gaps: 2, missingSteps: 2, offGrid: 2 })
    expect(inspect(run, 30)).toEqual({ kind: 'gap', requested: 30, after: 21, before: 32 })
    expect(inspect(run, 14)).toMatchObject({ kind: 'observed', step: 10, requested: 14 })
    expect(inspect(run, 32)).toMatchObject({ kind: 'observed', step: 32, values: { loss: 3 } })
    const frame = sample(run, 'loss', [10, 60], 1)
    expect([...frame.x]).toEqual([10, 21, 30, 32, 40, 50, 60])
    expect(frame.y).toEqual([6, 4, null, 3, null, 2, 1])
    expect(sample(run, 'loss', [23, 30], 100)).toMatchObject({ sourceCount: 0, extrema: null, breaks: 1 })
  })

  it('reports unavailable extrema for empty or all-invalid data and rejects broken contracts', () => {
    const empty = normalize(generate('empty'))
    const invalid = normalize(rows([1], [Infinity]))
    expect(empty.summary.domain).toBeNull()
    expect(inspect(empty, 1)).toEqual({ kind: 'empty' })
    expect(invalid.summary.stats.loss).toMatchObject({ latest: null, min: null, max: null })
    expect(() => normalize(rows([NaN], [1]))).toThrow(/step/)
    expect(() => normalize(rows([1], [1], 0))).toThrow(/interval/)
  })
})

describe('viewport sampling', () => {
  const million = normalize(generate('million'))

  it.each<[number, Range]>([
    [72, [1, 1_000_000]], [1070, [1, 1_000_000]], [280, [470_001, 530_008]], [722, [499_995, 500_400]], [32, [500_123, 500_123]],
  ])('preserves the exact million-point spike at width %s and viewport %j', (width, range) => {
    const frame = sample(million, 'loss', range, width)
    const peak = frame.x.indexOf(500_123)
    expect(peak).toBeGreaterThanOrEqual(0)
    expect(frame.y[peak]).toBe(1000)
    expect(frame.extrema?.[1]).toBe(1000)
    expect(frame.displayed).toBeLessThanOrEqual(Math.min(frame.sourceCount, width * 2 + 2))
  })

  it('recomputes buckets after pan, zoom and resize and preserves every visible bucket min/max for all three metrics', () => {
    for (const [range, width] of [[[1000, 970_020], 49], [[430_000, 472_421], 211], [[499_010, 510_000], 199]] as const) {
      for (const metric of METRICS) {
        const frame = sample(million, metric, range, width)
        const points = new Set(frame.y)
        const lows = Array<number>(width).fill(Infinity), highs = Array<number>(width).fill(-Infinity)
        for (let step = range[0]; step <= range[1]; step++) {
          const bucket = Math.min(width - 1, Math.floor((step - range[0]) * width / (range[1] - range[0])))
          const y = million.values[metric][step - 1]!
          lows[bucket] = Math.min(lows[bucket]!, y)
          highs[bucket] = Math.max(highs[bucket]!, y)
        }
        expect(lows.every(y => points.has(y))).toBe(true)
        expect(highs.every(y => points.has(y))).toBe(true)
        expect(frame.extrema).toEqual([Math.min(...lows), Math.max(...highs)])
        expect(frame.x.every((x, i) => x >= range[0] && x <= range[1] && (!i || x > frame.x[i - 1]!))).toBe(true)
        expect(frame.x[0]).toBe(range[0])
        expect(frame.x.at(-1)).toBe(range[1])
      }
    }
  })

  it('excludes nonpositive values from log data without substitution or a connecting line', () => {
    const run = normalize(rows([1, 2, 3, 4, 5, 6], [4, 0, 2, -1, NaN, 1e-18]))
    const linear = sample(run, 'loss', [1, 6], 100)
    const log = sample(run, 'loss', [1, 6], 1, true)
    expect(linear.y).toEqual([4, 0, 2, -1, null, 1e-18])
    expect(log.y).toEqual([4, null, 2, null, 1e-18])
    expect(log).toMatchObject({ displayed: 3, eligible: 3, omittedForLog: 2, breaks: 2, extrema: [1e-18, 4] })
    expect(inspect(run, 2)).toMatchObject({ kind: 'observed', values: { loss: 0 } })
    expect(sample(run, 'loss', [2, 2], 200, true)).toMatchObject({ extrema: null, omittedForLog: 1 })
  })
})

describe('presentation formatting', () => {
  it('formats exact readings and ticks consistently without turning tiny values into zero', () => {
    expect(metricValue(1.234567892345678e-17)).toBe('1.234567892345678E-17')
    expect(metricValue(1.234567892345678e-17, 'de-DE')).toBe('1,234567892345678E-17')
    expect(metricValue(1.234567892345678e-17, 'de-DE', false)).toBe('1,23457E-17')
    expect(countValue(500_123, 'en-US')).toBe('500,123')
    expect(countValue(500_123, 'de-DE')).toBe('500.123')
    expect(countValue(500_123, 'fr-FR')).toBe('500\u202f123')
    expect(metricValue(0, 'de-DE')).toBe('0')
    expect(metricValue(Infinity)).toBe('—')
  })
})
