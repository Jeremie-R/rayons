import { useRef, type PointerEvent, type ReactNode } from 'react'
import { ArchiveIcon } from '../components/icons'

// Swipe a row left to archive it (touch only). The row follows the finger, an "Archive" strip
// shows behind it, and letting go past a third of the width archives; otherwise it springs
// back. Vertical scrolling stays with the browser (touch-action: pan-y).

const THRESHOLD = 0.33

export function SwipeRow({ children, onSwipe, label = 'Archive' }: { children: ReactNode; onSwipe: () => void; label?: string }) {
  const row = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ x: number; y: number; dx: number; axis: 'x' | 'y' | null; id: number } | null>(null)
  const swallowClick = useRef(false)

  const move = (dx: number, animate: boolean) => {
    const el = row.current
    if (!el) return
    el.style.transition = animate ? 'transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1)' : 'none'
    el.style.transform = dx ? `translateX(${dx}px)` : ''
    el.parentElement?.style.setProperty('--swipe-progress', String(Math.min(1, -dx / (el.offsetWidth * THRESHOLD))))
  }

  const down = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return
    gesture.current = { x: event.clientX, y: event.clientY, dx: 0, axis: null, id: event.pointerId }
  }

  const drag = (event: PointerEvent) => {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    const dx = event.clientX - g.x
    const dy = event.clientY - g.y
    if (!g.axis) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        g.axis = 'x'
        try {
          row.current?.setPointerCapture(event.pointerId)
        } catch {
          // Not capturable: the drag still works.
        }
      } else if (Math.abs(dy) > 10) g.axis = 'y'
    }
    if (g.axis !== 'x') return
    g.dx = Math.min(0, dx)
    move(g.dx, false)
  }

  const up = () => {
    const g = gesture.current
    gesture.current = null
    if (!g || g.axis !== 'x') return
    swallowClick.current = true
    const width = row.current?.offsetWidth ?? 1
    if (-g.dx > width * THRESHOLD) {
      move(-width, true)
      window.setTimeout(onSwipe, 200)
    } else move(0, true)
  }

  return (
    <div className="swipe-row">
      <div className="swipe-row__behind" aria-hidden="true">
        <ArchiveIcon size={20} />
        <span>{label}</span>
      </div>
      <div
        ref={row}
        className="swipe-row__front"
        onPointerDown={down}
        onPointerMove={drag}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(event) => {
          // The tap that ends a swipe shouldn't open the conversation.
          if (swallowClick.current) {
            swallowClick.current = false
            event.preventDefault()
            event.stopPropagation()
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
