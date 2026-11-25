import { AsyncLocalStorage } from 'node:async_hooks'

// Server-Timing for each api/ request, so the browser's network panel shows where time went:
// auth (checking the sign-in), account (loading the Google connection), total.

const store = new AsyncLocalStorage<[string, number][]>()

export function withTiming<T>(run: () => Promise<T>) {
  return store.run([], run)
}

export async function timed<T>(name: string, work: Promise<T>): Promise<T> {
  const start = performance.now()
  try {
    return await work
  } finally {
    store.getStore()?.push([name, performance.now() - start])
  }
}

export function timingHeader(total: number) {
  const marks = store.getStore() ?? []
  return [...marks, ['total', total] as [string, number]].map(([name, ms]) => `${name};dur=${ms.toFixed(0)}`).join(', ')
}
