import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

const MOBILE_QUERY = '(max-width: 719px)'

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

/** Phone layout: one pane at a time and a tab bar. */
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY)

/**
 * Saves `value` shortly after the last change, and straight away when the component goes
 * away or the page is hidden. Returns the save state for a small "Saved" hint.
 */
export function useAutosave<T>(value: T, save: (value: T) => Promise<void>, delay = 800) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const latest = useRef(value)
  const saved = useRef(value)
  const saveRef = useRef(save)
  saveRef.current = save

  const flush = useCallback(async () => {
    if (Object.is(latest.current, saved.current)) return
    const next = latest.current
    setState('saving')
    try {
      await saveRef.current(next)
      saved.current = next
      setState('saved')
    } catch (error) {
      console.error('Autosave failed', error)
      setState('error')
    }
  }, [])

  useEffect(() => {
    latest.current = value
    if (Object.is(value, saved.current)) return
    const timer = setTimeout(flush, delay)
    return () => clearTimeout(timer)
  }, [value, delay, flush])

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void flush()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      void flush()
    }
  }, [flush])

  return state
}

export { useShortcut } from './shortcuts'
