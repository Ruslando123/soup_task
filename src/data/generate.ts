import type { RawRun, RunSpec } from './types.ts'

export const SEED = 0x50a1d
export const VERSION = 'synthetic-v1'
const definitions: [string, string, string, RunSpec['status'], string][] = [
  ['healthy', 'Atlas / baseline', 'Healthy convergence', 'Running', 'Loss declines with a small amount of noise. Use this run to compare the shape of less stable signals.'],
  ['diverging', 'Atlas / divergence', 'Diverging loss', 'Running', 'Loss grows after a short initial decline. Check the learning rate and gradient before drawing a conclusion.'],
  ['oscillating', 'Atlas / oscillation', 'Oscillating loss', 'Running', 'Loss repeatedly rises and falls. Zoom into a cycle to inspect the amplitude.'],
  ['plateau', 'Boreal / plateau', 'Loss plateau', 'Completed', 'Loss declines early, then levels out. The flat tail remains visible without smoothing.'],
  ['spike', 'Boreal / loss spike', 'Sudden loss spike', 'Running', 'A single abrupt loss spike interrupts an otherwise declining signal.'],
  ['nan', 'Boreal / NaN', 'NaN measurements', 'Failed', 'A burst of NaN loss values breaks the line. Hover inside the interruption to inspect the raw measurement state.'],
  ['pos-inf', 'Cinder / +Infinity', 'Positive Infinity', 'Failed', 'Positive Infinity appears in the loss and gradient streams. Finite extrema exclude these invalid readings.'],
  ['neg-inf', 'Cinder / −Infinity', 'Negative Infinity', 'Failed', 'Negative Infinity appears in the loss stream. It is treated as invalid and kept distinct from positive Infinity.'],
  ['duplicates', 'Cinder / duplicate steps', 'Duplicate steps', 'Completed', 'Multiple rows share one step. The last source row wins; the discarded values remain available for review.'],
  ['unsorted', 'Delta / out of order', 'Unsorted steps', 'Completed', 'Some source rows arrive out of step order. The chart follows the normalized step order.'],
  ['missing', 'Delta / missing range', 'Missing step ranges', 'Running', 'This run records every tenth step. Two missing intervals are visible against that sampling contract.'],
  ['zero-lr', 'Delta / zero rate', 'Zero learning rate', 'Completed', 'Learning rate reaches a real zero. Linear scale displays it; log scale reports it as omitted.'],
  ['zero-loss', 'Ember / zero loss', 'Zero loss', 'Completed', 'Several loss observations are exactly zero. They remain distinct from missing measurements.'],
  ['gradient', 'Ember / gradient surge', 'Extreme gradient norms', 'Running', 'A large but finite gradient outlier appears. Compare the exact readings across all three metrics.'],
  ['tiny', 'Ember / small signal', 'Very small values', 'Completed', 'Loss and learning rate are far below one. Scientific notation preserves their order of magnitude.'],
  ['noisy', 'Fjord / noisy signal', 'Noisy training', 'Running', 'Loss has substantial step-to-step noise. No smoothing is applied.'],
  ['lr-change', 'Fjord / rate shift', 'Abrupt rate changes', 'Running', 'Learning rate changes abruptly twice. Compare the loss response on the same step ranges.'],
  ['mixed', 'Fjord / corrupted batch', 'Mixed data problems', 'Failed', 'Missing observations, explicit missing values, infinities, and conflicting duplicate rows occur together.'],
  ['empty', 'Grove / queued', 'Empty run', 'Queued', 'This fixture contains no observations. There is no latest loss or visible range.'],
  ['million', 'Grove / million-step', '1M-point stress test', 'Completed', 'Exactly one million observations with a single extreme loss spike near the midpoint. Zoom to check that the peak remains visible.'],
]
export const RUNS: RunSpec[] = definitions.map(([id, name, scenario, status, description]) => ({
  id, name, scenario, status, description,
  count: id === 'million' ? 1_000_000 : id === 'empty' ? 0 : 1_200,
  interval: id === 'missing' ? 10 : 1,
}))

function random(seed: number) {
  let state = seed | 0
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    return (state >>> 0) / 4_294_967_296
  }
}

export function generate(id: string): RawRun {
  const index = RUNS.findIndex(run => run.id === id)
  const spec = RUNS[index]
  if (!spec) throw new Error('Unknown training run.')
  const { count, interval } = spec
  const next = random(SEED ^ Math.imul(index + 1, 0x9e3779b9))
  const steps = new Float64Array(count)
  const loss = new Float64Array(count), lr = new Float64Array(count), grad_norm = new Float64Array(count)
  const mask = id === 'mixed' ? new Uint8Array(count) : undefined
  for (let i = 0; i < count; i++) {
    const t = i / count
    const noise = next() - .5
    const base = 2.5 * Math.exp(-6 * t) + .06 + noise * (.018 + .12 * (1 - t))
    let l = base, r = .0003 * (1 - .85 * t), g = .31 + base * .62 + next() * .13
    let step = (i + 1) * interval
    switch (id) {
      case 'diverging': l = .45 + .7 * Math.exp(-12 * t) + 22 * Math.pow(t, 5) + noise * .25; break
      case 'oscillating': l = 1.1 + .64 * Math.sin(t * 72) + .21 * Math.sin(t * 182) + noise * .19; break
      case 'plateau': l = .82 + 2.6 * Math.exp(-30 * t) + noise * .033; break
      case 'spike': if (i === 631) l = 35; break
      case 'nan': if (i >= 453 && i < 499) l = NaN; break
      case 'pos-inf': if (i === 595) { l = Infinity; g = Infinity }; break
      case 'neg-inf': if (i >= 592 && i < 609) l = -Infinity; break
      case 'duplicates': if (i === 502) { step--; l = 12 }; break
      case 'unsorted': if (i === 190 || i === 660) step = i === 190 ? 661 : 191; break
      case 'missing': if (i >= 300) step += 700; if (i >= 705) step += 1400; break
      case 'zero-lr': if (t >= .6) r = 0; break
      case 'zero-loss': if (t > .67 && t < .77) l = 0; break
      case 'gradient': if (i === 720) g = 850_000; break
      case 'tiny': l *= 1e-14; r *= 1e-12; g *= 1e-10; break
      case 'noisy': l = Math.max(.005, base + noise * 1.2); break
      case 'lr-change': r = t < .38 ? .00045 : t < .72 ? .0012 : .00006; break
      case 'mixed':
        if (i >= 512) step += 47
        if (i === 749) step--
        if (i === 410) l = -Infinity
        if (i >= 645 && i < 670 && mask) { l = NaN; mask[i] = 1 }
        if (i === 934) g = NaN
        break
      case 'million': if (i === 500_122) l = 1_000; break
    }
    steps[i] = step; loss[i] = l; lr[i] = r; grad_norm[i] = g
  }
  return { steps, values: { loss, lr, grad_norm }, interval, ...(mask ? { missing: { loss: mask } } : {}) }
}
