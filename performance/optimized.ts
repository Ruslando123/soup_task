import { createRunClient } from '../src/data/runClient.ts'
import { METRICS, type Range } from '../src/data/types.ts'

export function optimized() {
  const client = createRunClient()
  return {
    async load() { return (await client.request('load', { id: 'million' })).summary.domain! },
    frames(range: Range, width: number) {
      return Promise.all(METRICS.map(metric => client.request('sample', { metric, range, width, log: false })))
    },
    inspect(step: number) { return client.request('inspect', { step }) },
    close() { client.close() },
  }
}
