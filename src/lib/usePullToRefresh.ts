import { useEffect, useRef, useState } from 'react'

// Pull down from the top of a scrolling list (touch only) to refresh it. `onRefresh` returns a
// promise; the spinner stays until it settles (and at least half a second, so it doesn't flash).

const THRESHOLD = 64
const MAX = 96

export function usePullToRefresh<T extends HTMLElement>(onRefresh: () => Promise<unknown>) {
  // A callback ref: the list can come and go (on phones it hides while a conversation is open).
  const [el, ref] = useState<T | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const refreshRef = useRef(onRefresh)
  refreshRef.current = onRefresh


  useEffect(() => {
    if (!el) return
    let start: { x: number; y: number } | null = null
    let pulling = false
    let distance = 0

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || el.scrollTop > 0) return
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY }
      pulling = false
      distance = 0
    }
    const onMove = (event: TouchEvent) => {
      if (!start) return
      const dy = event.touches[0].clientY - start.y
      const dx = event.touches[0].clientX - start.x
      if (!pulling) {
        // Only a downward pull from the very top; sideways is a swipe on a row.
        if (dy > 8 && dy > Math.abs(dx) * 1.5 && el.scrollTop <= 0) pulling = true
        else if (Math.abs(dx) > 8 || dy < 0) {
          start = null
          return
        } else return
      }
      event.preventDefault()
      // Resistance: the list follows the finger less and less.
      distance = Math.min(MAX, Math.max(0, (dy - 8) * 0.5))
      setPull(distance)
    }
    const onEnd = () => {
      if (pulling && distance >= THRESHOLD) {
        setRefreshing(true)
        const minimum = new Promise((resolve) => setTimeout(resolve, 500))
        void Promise.allSettled([refreshRef.current(), minimum]).then(() => setRefreshing(false))
      }
      start = null
      pulling = false
      distance = 0
      setPull(0)
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [el])

  /** Height of the space shown above the list. */
  const shown = refreshing ? 52 : pull
  const ready = pull >= THRESHOLD
  return { ref, shown, ready, refreshing, progress: Math.min(1, pull / THRESHOLD) }
}
