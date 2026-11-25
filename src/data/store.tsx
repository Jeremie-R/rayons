import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Backend } from './backend'

// A small query cache. Screens read with `useQuery(key, fetcher)`; mutations call
// `invalidate(prefix…)` and every mounted query whose key starts with one of those
// prefixes fetches again, keeping its last data on screen meanwhile (no flicker).
//
// Signed in to Google, the cache is also kept on this device (localStorage), so lists show
// straight away on the next visit while fresh ones load ("stale while revalidate").

const BackendContext = createContext<Backend | null>(null)

export function BackendProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  // Before children render, so their first render already sees the saved lists.
  const hydrated = useRef<Backend | null>(null)
  if (hydrated.current !== backend) {
    hydrated.current = backend
    cache.clear()
    persistKey = backend.kind === 'live' ? `${PERSIST_PREFIX}${backend.account.email}` : null
    hydrate()
  }
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>
}

export function useBackend() {
  const backend = useContext(BackendContext)
  if (!backend) throw new Error('useBackend outside BackendProvider')
  return backend
}

const cache = new Map<string, unknown>()
const inFlight = new Map<string, Promise<unknown>>()
const listeners = new Set<(prefixes: string[]) => void>()

// Persistence -------------------------------------------------------------------------------------

const PERSIST_PREFIX = 'rayons:cache:'
let persistKey: string | null = null
let saveTimer: number | undefined
const MAX_THREADS = 25
const MAX_BYTES = 3_000_000

function hydrate() {
  if (!persistKey) return
  try {
    const raw = localStorage.getItem(persistKey)
    if (!raw) return
    for (const [key, value] of JSON.parse(raw) as [string, unknown][]) cache.set(key, value)
  } catch {
    // Unreadable: start empty.
  }
}

function scheduleSave() {
  if (!persistKey) return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(save, 1000)
}

function save() {
  if (!persistKey) return
  // Lists and the most recently opened conversations, newest last.
  const entries = [...cache.entries()]
  const threads = entries.filter(([key]) => key.startsWith('thread:') && !key.includes(':events')).slice(-MAX_THREADS)
  const rest = entries.filter(([key]) => !key.startsWith('thread:') && !key.includes(':files'))
  for (const set of [[...rest, ...threads], rest]) {
    const text = JSON.stringify(set)
    if (text.length > MAX_BYTES) continue
    try {
      localStorage.setItem(persistKey, text)
      return
    } catch {
      // Full: try again without conversations.
    }
  }
}

/** Forgets everything kept on this device (on sign-out). */
export function clearPersistedCache() {
  cache.clear()
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PERSIST_PREFIX)) localStorage.removeItem(key)
  } catch {
    // Nothing stored.
  }
}

function remember(key: string, value: unknown) {
  // Re-insert so the Map's order is "most recently used last".
  cache.delete(key)
  cache.set(key, value)
  scheduleSave()
}

// Queries -----------------------------------------------------------------------------------------

/** Fetches again every mounted query whose key starts with one of these prefixes. */
export function invalidate(...prefixes: string[]) {
  for (const listener of [...listeners]) listener(prefixes)
}

/** Changes cached data in place (an optimistic update) and shows it straight away. */
export function updateCached<T>(prefix: string, update: (data: T, key: string) => T) {
  for (const [key, value] of cache) {
    if (key.startsWith(prefix)) cache.set(key, update(value as T, key))
  }
  scheduleSave()
  for (const listener of [...listeners]) listener([`\u0000show:${prefix}`])
}

/** Loads something ahead of time (hovered rows, the next conversation), once. */
export function prefetch<T>(key: string, fetcher: () => Promise<T>) {
  if (cache.has(key) || inFlight.has(key)) return
  const promise = fetcher()
    .then((data) => remember(key, data))
    .catch(() => {})
    .finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
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
    // Share a request already on its way (a prefetch, say) instead of starting another.
    const pending = generation === 0 ? (inFlight.get(key) as Promise<unknown> | undefined) : undefined
    const request = (pending ? pending.then(() => (cache.has(key) ? (cache.get(key) as T) : fetcherRef.current())) : fetcherRef.current()) as Promise<T>
    request.then(
      (data) => {
        remember(key, data)
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
  threadEvents: (id: string) => `events:thread:${id}`,
  calendars: 'calendars',
  projects: 'projects',
  project: (id: string) => `projects:${id}`,
  projectEvents: (id: string) => `projects:${id}:events`,
  files: (id: string) => `projects:${id}:files`,
}
