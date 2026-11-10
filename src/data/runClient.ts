import type { Action, Payloads, Reply, Results } from './protocol'

export function createRunClient() {
  const worker = new Worker(new URL('../workers/run.worker.ts', import.meta.url), { type: 'module' })
  let key = 0, failure: Error | undefined
  const pending = new Map<number, { resolve: (result: Results[Action]) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  const fail = (error: Error) => {
    failure = error
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error) }
    pending.clear()
    worker.terminate()
  }
  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    const item = pending.get(data.key)
    if (!item) return
    pending.delete(data.key)
    clearTimeout(item.timer)
    if ('error' in data) item.reject(new Error(data.error))
    else item.resolve(data.result)
  }
  worker.onerror = () => fail(new Error('The training data worker could not start or stopped responding.'))
  worker.onmessageerror = () => fail(new Error('The training data worker sent an unreadable response.'))
  function request<K extends Action>(action: K, payload: Payloads[K]): Promise<Results[K]> {
    if (failure) return Promise.reject(failure)
    const next = ++key
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail(new Error('The training data worker timed out. Reopen the run to retry.')), 15_000)
      pending.set(next, { resolve: result => resolve(result as Results[K]), reject, timer })
      try { worker.postMessage({ key: next, action, payload }) }
      catch (error) { clearTimeout(timer); pending.delete(next); reject(error) }
    })
  }
  return {
    request,
    close() { fail(new DOMException('The run was closed.', 'AbortError')) },
  }
}
export type RunClient = ReturnType<typeof createRunClient>
