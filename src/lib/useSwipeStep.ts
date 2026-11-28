import { useEffect, useRef, useState } from 'react'

// Swipe sideways to move to the next or previous period (touch only). The page follows the
// finger; let go far enough and it slides out, the period changes, and the new one slides in
// from the other side, like pushing a sheet of paper. Vertical scrolling and two-finger pinches
// are left alone.

const EASE = 'transform 0.22s cubic-bezier(0.2, 0.7, 0.2, 1)'

export function useSwipeStep<T extends HTMLElement>(onStep: (direction: 1 | -1) => void, enabled: boolean) {
  const [el, ref] = useState<T | null>(null)
  const stepRef = useRef(onStep)
  stepRef.current = onStep

  useEffect(() => {
    if (!el || !enabled) return
    let start: { x: number; y: number; id: number } | null = null
    let axis: 'x' | 'y' | null = null
    let dx = 0
    let fingers = 0
    let swallowUntil = 0

    const place = (x: number, animate: boolean) => {
      el.style.transition = animate ? EASE : 'none'
      el.style.transform = x ? `translateX(${x}px)` : ''
    }

    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      fingers += 1
      if (fingers > 1) {
        // A pinch: let the grid have it.
        if (axis === 'x') place(0, true)
        start = null
        return
      }
      start = { x: event.clientX, y: event.clientY, id: event.pointerId }
      axis = null
      dx = 0
    }

    const move = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return
      const mx = event.clientX - start.x
      const my = event.clientY - start.y
      if (!axis) {
        if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.2) axis = 'x'
        else if (Math.abs(my) > 10) {
          axis = 'y'
          start = null
          return
        } else return
      }
      dx = mx
      place(dx, false)
    }

    const end = (event: PointerEvent) => {
      if (event.pointerType === 'touch') fingers = Math.max(0, fingers - 1)
      if (!start || event.pointerId !== start.id) return
      const sideways = axis === 'x'
      start = null
      axis = null
      if (!sideways) return
      // The tap that ends a swipe must not open or create anything.
      swallowUntil = Date.now() + 400
      const width = el.clientWidth || 1
      const direction = dx < -width * 0.2 ? 1 : dx > width * 0.2 ? -1 : 0
      if (!direction) {
        place(0, true)
        return
      }
      place(direction === 1 ? -width : width, true)
      window.setTimeout(() => {
        stepRef.current(direction)
        place(direction === 1 ? width : -width, false)
        requestAnimationFrame(() => requestAnimationFrame(() => place(0, true)))
      }, 220)
    }

    const cancel = (event: PointerEvent) => {
      if (event.pointerType === 'touch') fingers = Math.max(0, fingers - 1)
      if (start && axis === 'x') place(0, true)
      start = null
      axis = null
    }

    const click = (event: MouseEvent) => {
      if (Date.now() < swallowUntil) {
        event.stopPropagation()
        event.preventDefault()
      }
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', cancel)
    el.addEventListener('click', click, true)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', end)
      el.removeEventListener('pointercancel', cancel)
      el.removeEventListener('click', click, true)
      el.style.transform = ''
      el.style.transition = ''
    }
  }, [el, enabled])

  return ref
}
