import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Backend } from './backend'

// A small query cache. Screens read with `useQuery(key, fetcher)`; mutations call
// `invalidate(prefix…)` and every mounted query whose key starts with one of those
// prefixes fetches again, keeping its last data on screen meanwhile (no flicker).

const BackendContext = createContext<Backend | null>(null)

export function BackendProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  useEffect(() => () => cache.clear(), [backend])
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>
}

export function useBackend() {
  const backend = useContext(BackendContext)
  if (!backend) throw new Error('useBackend outside BackendProvider')
  return backend
}

const cache = new Map<string, unknown>()
const listeners = new Set<(prefixes: string[]) => void>()

/** Fetches again every mounted query whose key starts with one of these prefixes. */
export function invalidate(...prefixes: string[]) {
  for (const listener of [...listeners]) listener(prefixes)
}

/** Changes cached data in place (an optimistic update) and shows it straight away. */
export function updateCached<T>(prefix: string, update: (data: T) => T) {
  for (const [key, value] of cache) {
    if (key.startsWith(prefix)) cache.set(key, update(value as T))
  }
  for (const listener of [...listeners]) listener([`\u0000show:${prefix}`])
}

interface QueryState<T> {
  key: string | null
  data: T | undefined
  error: unknown
  loading: boolean
}

export function useQuery<T>(key: string | null, fetcher: () => Promise<T>) {
  const [state, setState] = useState<QueryState<T>>(() => ({
    key,
    data: key ? (cache.get(key) as T | undefined) : undefined,
    error: null,
    loading: key !== null,
  }))
  const [generation, setGeneration] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    if (key === null) {
      setState({ key, data: undefined, error: null, loading: false })
      return
    }
    let cancelled = false
    setState((previous) => ({
      key,
      data: previous.key === key ? previous.data : (cache.get(key) as T | undefined),
      error: null,
      loading: true,
    }))
    fetcherRef.current().then(
      (data) => {
        cache.set(key, data)
        if (!cancelled) setState({ key, data, error: null, loading: false })
      },
      (error: unknown) => {
        console.error(`Could not load ${key}`, error)
        if (!cancelled) setState((previous) => ({ ...previous, key, error, loading: false }))
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, generation])

  useEffect(() => {
    if (key === null) return
    const listener = (prefixes: string[]) => {
      for (const prefix of prefixes) {
        if (prefix.startsWith('\u0000show:')) {
          if (key.startsWith(prefix.slice(6)) && cache.has(key)) {
            setState((previous) => ({ ...previous, data: cache.get(key) as T }))
          }
        } else if (key.startsWith(prefix)) {
          setGeneration((n) => n + 1)
          return
        }
      }
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [key])

  const data = state.key === key ? state.data : key ? (cache.get(key) as T | undefined) : undefined
  return { data, error: state.error, loading: state.loading, reload: () => setGeneration((n) => n + 1) }
}

/** Cache keys, in one place so mutations invalidate the right things. */
export const keys = {
  threads: 'threads:',
  thread: (id: string) => `thread:${id}`,
  events: 'events:',
  calendars: 'calendars',
  projects: 'projects',
  project: (id: string) => `projects:${id}`,
  projectEvents: (id: string) => `projects:${id}:events`,
  files: (id: string) => `projects:${id}:files`,
}
