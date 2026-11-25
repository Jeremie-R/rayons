import { useSyncExternalStore } from 'react'

// Light, dark, or following the system. The choice is kept on this device; index.html applies
// it before the first paint so the page never flashes the wrong colours.

export type ThemePreference = 'system' | 'light' | 'dark'
const KEY = 'rayons:theme'
const query = () => window.matchMedia('(prefers-color-scheme: dark)')

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

let preference = readPreference()
const listeners = new Set<() => void>()

const resolve = (): 'light' | 'dark' => (preference === 'system' ? (query().matches ? 'dark' : 'light') : preference)

function apply() {
  const resolved = resolve()
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#17151c' : '#ffffff')
  for (const listener of listeners) listener()
}

query().addEventListener('change', () => preference === 'system' && apply())
apply()

export function setThemePreference(next: ThemePreference) {
  preference = next
  try {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch {
    // Kept for this visit only.
  }
  apply()
}

let snapshot = { preference, resolved: resolve() }
const getSnapshot = () => {
  const resolved = resolve()
  if (snapshot.preference !== preference || snapshot.resolved !== resolved) snapshot = { preference, resolved }
  return snapshot
}

export function useTheme() {
  const value = useSyncExternalStore((onChange) => {
    listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
  }, getSnapshot)
  return { ...value, setPreference: setThemePreference }
}
