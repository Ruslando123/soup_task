import { generate, VERSION } from '../data/generate'
import { inspect, normalize } from '../data/normalize'
import { sample } from '../data/sample'
import type { Reply, Request } from '../data/protocol'
import type { Normalized } from '../data/types'

let run: Normalized | undefined

self.addEventListener('message', ({ data: { key, action, payload } }: MessageEvent<Request>) => {
  try {
    if (action === 'load') {
      run = normalize(generate(payload.id))
      self.postMessage({ key, result: { summary: run.summary, duplicates: run.duplicates, version: VERSION } } satisfies Reply)
      return
    }
    if (!run) throw new Error('Load a run before requesting observations.')
    if (action === 'inspect') {
      self.postMessage({ key, result: inspect(run, payload.step) } satisfies Reply)
      return
    }
    const result = sample(run, payload.metric, payload.range, payload.width, payload.log)
    const transfer = [result.x.buffer, result.isolated.buffer]
    if (result.y instanceof Float64Array) transfer.push(result.y.buffer)
    self.postMessage({ key, result } satisfies Reply, { transfer })
  } catch (error) {
    self.postMessage({ key, error: error instanceof Error ? error.message : 'The data could not be processed.' } satisfies Reply)
  }
})
