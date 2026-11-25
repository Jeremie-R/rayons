import { useCallback, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { tooltip } from './ui'

// The border between a list and what's open beside it can be dragged. The width is
// remembered on this device. Double-click puts it back; arrow keys move it too.

const KEY = 'rayons:list-width'
const DEFAULT = 352
const MIN = 260

const max = () => Math.max(MIN, Math.min(720, window.innerWidth * 0.55))
const clamp = (width: number) => Math.round(Math.max(MIN, Math.min(max(), width)))

export function useListWidth() {
  const [width, setWidthState] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(KEY))
      return saved ? clamp(saved) : DEFAULT
    } catch {
      return DEFAULT
    }
  })
  const setWidth = useCallback((next: number) => {
    const value = clamp(next)
    setWidthState(value)
    try {
      localStorage.setItem(KEY, String(value))
    } catch {
      // Remembered for this visit only.
    }
  }, [])
  return [width, setWidth] as const
}

export function ResizeHandle({ width, onChange }: { width: number; onChange: (width: number) => void }) {
  const [dragging, setDragging] = useState(false)

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    setDragging(true)
    document.body.classList.add('is-resizing')
    const move = (e: globalThis.PointerEvent) => onChange(startWidth + e.clientX - startX)
    const end = () => {
      setDragging(false)
      document.body.classList.remove('is-resizing')
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') onChange(width - 24)
    else if (event.key === 'ArrowRight') onChange(width + 24)
    else return
    event.preventDefault()
  }

  return (
    <div
      className={`resize-handle ${dragging ? 'is-dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the list"
      aria-valuenow={width}
      aria-valuemin={MIN}
      aria-valuemax={Math.round(max())}
      tabIndex={0}
      onPointerDown={start}
      onDoubleClick={() => onChange(DEFAULT)}
      onKeyDown={onKeyDown}
      {...(dragging ? {} : tooltip('Drag to resize · double-click to reset'))}
    />
  )
}
