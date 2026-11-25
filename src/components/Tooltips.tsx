import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { keyCaps } from '../lib/shortcuts'

// One tooltip for the whole app, in the style of yalqen: a small pill with the label and,
// when there is one, the keyboard shortcut as key caps. Any element can ask for one with
// data-tooltip="Archive" and data-keys="e". Elements marked data-tooltip-truncated only get
// it when their text is cut off. Hovering waits half a second; once one has shown, the next
// shows straight away. Not on touch screens.

const DELAY_MS = 500
const WARM_MS = 300
const GAP = 6
const EDGE = 8

interface Tip {
  text: string
  keys: string[]
  anchor: DOMRect
}

function tipFor(element: HTMLElement): Tip | null {
  const text = element.dataset.tooltip?.trim()
  if (!text) return null
  if (element.hasAttribute('data-tooltip-truncated') && element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight + 1) {
    return null
  }
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return { text, keys: element.dataset.keys ? keyCaps(element.dataset.keys) : [], anchor: rect }
}

export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    let target: HTMLElement | null = null
    let timer: number | undefined
    let shown = false
    let lastHidden = 0

    const show = () => {
      if (!target?.isConnected) return
      const next = tipFor(target)
      if (!next) return
      shown = true
      setTip(next)
    }
    const release = () => {
      window.clearTimeout(timer)
      target = null
      if (shown) {
        shown = false
        lastHidden = Date.now()
        setTip(null)
      }
    }
    const begin = (element: HTMLElement, immediate: boolean) => {
      if (element === target) return
      release()
      target = element
      if (immediate || Date.now() - lastHidden < WARM_MS) show()
      else timer = window.setTimeout(show, DELAY_MS)
    }
    const over = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const element = (event.target as Element | null)?.closest?.<HTMLElement>('[data-tooltip]')
      if (element) begin(element, false)
    }
    const out = (event: PointerEvent) => {
      if (!target) return
      const next = event.relatedTarget as Node | null
      if (next && target.contains(next)) return
      release()
    }
    // Keyboard users get the tooltip on focus too.
    const focus = (event: FocusEvent) => {
      const element = (event.target as Element | null)?.closest?.<HTMLElement>('[data-tooltip]')
      if (element && (event.target as HTMLElement).matches(':focus-visible')) begin(element, false)
    }
    const dismiss = () => {
      if (!target) return
      release()
      lastHidden = 0
    }
    document.addEventListener('pointerover', over, true)
    document.addEventListener('pointerout', out, true)
    document.addEventListener('focusin', focus, true)
    document.addEventListener('focusout', dismiss, true)
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('keydown', dismiss, true)
    document.addEventListener('scroll', dismiss, true)
    window.addEventListener('blur', dismiss)
    return () => {
      release()
      document.removeEventListener('pointerover', over, true)
      document.removeEventListener('pointerout', out, true)
      document.removeEventListener('focusin', focus, true)
      document.removeEventListener('focusout', dismiss, true)
      document.removeEventListener('pointerdown', dismiss, true)
      document.removeEventListener('keydown', dismiss, true)
      document.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('blur', dismiss)
    }
  }, [])

  // Centred under the element, or above it when there's no room below.
  useLayoutEffect(() => {
    if (!tip || !box.current) {
      setPosition(null)
      return
    }
    const { width, height } = box.current.getBoundingClientRect()
    const centred = tip.anchor.x + tip.anchor.width / 2 - width / 2
    const x = Math.max(EDGE, Math.min(centred, window.innerWidth - width - EDGE))
    const below = tip.anchor.bottom + GAP
    const y = below + height <= window.innerHeight - EDGE ? below : tip.anchor.top - GAP - height
    setPosition({ x: Math.round(x), y: Math.round(Math.max(EDGE, y)) })
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={box}
      className={`tooltip ${position ? 'is-on' : ''} ${tip.keys.length ? 'has-keys' : ''}`}
      style={{ left: position?.x ?? -9999, top: position?.y ?? -9999 }}
      aria-hidden="true"
    >
      <span className="tooltip__text">{tip.text}</span>
      {tip.keys.length > 0 && (
        <span className="tooltip__keys">
          {tip.keys.map((cap, index) => (
            <kbd key={index}>{cap}</kbd>
          ))}
        </span>
      )}
    </div>,
    document.body,
  )
}
