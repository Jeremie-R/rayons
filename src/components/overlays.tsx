import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useIsMobile } from '../lib/hooks'
import { CloseIcon } from './icons'
import type { IconComponent } from './ui'

// ---------------------------------------------------------------------------------------------
// Menu: a button that opens a list of actions. A popover on desktop, a bottom sheet on phones.

interface MenuProps {
  /** Renders the trigger. Spread the props onto a button. */
  trigger: (props: { ref: (el: HTMLButtonElement | null) => void; onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode
  children: (close: () => void) => ReactNode
  label: string
  align?: 'start' | 'end'
}

export function Menu({ trigger, children, label, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const close = useCallback(() => {
    setOpen(false)
    anchor.current?.focus()
  }, [])
  return (
    <>
      {trigger({
        ref: (el) => {
          anchor.current = el
        },
        onClick: () => setOpen((value) => !value),
        'aria-expanded': open,
        'aria-haspopup': 'menu',
      })}
      {open && (
        <Popover anchor={anchor.current} onClose={close} label={label} align={align}>
          {children(close)}
        </Popover>
      )}
    </>
  )
}

const ITEMS = '[role="menuitem"], [role="menuitemradio"], [role="option"]'

/**
 * A panel anchored under a button (above when there is more room there). A bottom sheet on
 * phones. Used by Menu and by the pickers in fields.tsx.
 */
export function Popover({
  anchor,
  onClose,
  label,
  align = 'start',
  role = 'menu',
  className = '',
  matchWidth = false,
  initialFocus,
  children,
}: {
  anchor: HTMLElement | null
  onClose: () => void
  label: string
  align?: 'start' | 'end'
  role?: 'menu' | 'listbox' | 'dialog'
  className?: string
  /** At least as wide as the button that opened it. */
  matchWidth?: boolean
  /** Where focus goes first (a selector inside the panel). */
  initialFocus?: string
  children: ReactNode
}) {
  const mobile = useIsMobile()
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number; minWidth?: number } | null>(null)

  useLayoutEffect(() => {
    if (mobile || !anchor || !panel.current) return
    // Up or down is decided once, so a list that shrinks while you search stays put.
    let openUp: boolean | null = null
    const place = () => {
      if (!panel.current) return
      const rect = anchor.getBoundingClientRect()
      const minWidth = matchWidth ? rect.width : undefined
      const width = Math.max(panel.current.offsetWidth, minWidth ?? 0)
      const height = panel.current.scrollHeight
      const below = window.innerHeight - rect.bottom - 12
      const above = rect.top - 12
      openUp ??= height > below && above > below
      const maxHeight = Math.max(160, openUp ? above : below)
      const top = openUp ? Math.max(8, rect.top - 6 - Math.min(height, maxHeight)) : rect.bottom + 6
      const left = Math.min(Math.max(8, align === 'end' ? rect.right - width : rect.left), window.innerWidth - width - 8)
      setPosition((current) =>
        current && current.top === top && current.left === left && current.maxHeight === maxHeight && current.minWidth === minWidth ? current : { top, left, maxHeight, minWidth },
      )
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(panel.current)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [anchor, mobile, align, matchWidth])

  useEffect(() => {
    const first = (initialFocus && panel.current?.querySelector<HTMLElement>(initialFocus)) || panel.current?.querySelector<HTMLElement>(`${ITEMS}, input, button`)
    first?.focus({ preventScroll: true })
    first?.scrollIntoView?.({ block: 'center' })
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !anchor?.contains(target)) onClose()
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [anchor, onClose])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      event.preventDefault()
      onClose()
      return
    }
    if (role === 'dialog' || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
    const items = [...(panel.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])]
    if (items.length === 0) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length
    items[next].focus()
  }

  const content = (
    <div
      ref={panel}
      role={role}
      aria-label={label}
      className={`menu ${mobile ? 'menu--sheet' : ''} ${className}`}
      style={mobile ? undefined : { top: position?.top ?? -9999, left: position?.left ?? -9999, maxHeight: position?.maxHeight, minWidth: position?.minWidth }}
      onKeyDown={onKeyDown}
    >
      {mobile && <p className="menu__title">{label}</p>}
      {children}
    </div>
  )

  // Inside a modal dialog, only the dialog can be used: the panel has to live in it.
  const host = anchor?.closest('dialog[open]') ?? document.body
  return createPortal(
    mobile ? (
      <div className="sheet-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
        {content}
      </div>
    ) : (
      content
    ),
    host,
  )
}

export function MenuItem({
  icon: Icon,
  children,
  onSelect,
  checked,
  danger,
  hint,
}: {
  icon?: IconComponent
  children: ReactNode
  onSelect: () => void
  checked?: boolean
  danger?: boolean
  hint?: ReactNode
}) {
  return (
    <button type="button" role={checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={checked} className={`menu__item ${danger ? 'is-danger' : ''} ${checked ? 'is-checked' : ''}`} onClick={onSelect}>
      {Icon && <Icon size={16} />}
      <span className="menu__label">{children}</span>
      {hint && <span className="menu__hint">{hint}</span>}
    </button>
  )
}

export const MenuSeparator = () => <hr className="menu__separator" />
export const MenuHeading = ({ children }: { children: ReactNode }) => <p className="menu__heading">{children}</p>

// ---------------------------------------------------------------------------------------------
// Dialog: a native <dialog>, centred on desktop and a bottom sheet on phones.

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog--wide' : ''}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onPointerDown={(event) => {
        // A press on the backdrop (the dialog element itself, outside its content) closes it.
        if (event.target === ref.current) onClose()
      }}
    >
      {open && (
        <div className="dialog__inner">
          <header className="dialog__header">
            <h2>{title}</h2>
            <button type="button" className="icon-button icon-button--plain" aria-label="Close" title="Close" onClick={onClose}>
              <CloseIcon size={20} />
            </button>
          </header>
          <div className="dialog__body">{children}</div>
          {footer && <footer className="dialog__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}

// ---------------------------------------------------------------------------------------------
// Feedback: short messages at the bottom of the screen, with an optional Undo.

interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void }
  tone: 'info' | 'error'
}

const FeedbackContext = createContext<(message: string, options?: { action?: Toast['action']; tone?: Toast['tone'] }) => void>(() => {})

export const useFeedback = () => useContext(FeedbackContext)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), [])
  const notify = useCallback(
    (message: string, options: { action?: Toast['action']; tone?: Toast['tone'] } = {}) => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-2), { id, message, action: options.action, tone: options.tone ?? 'info' }])
      setTimeout(() => dismiss(id), options.action ? 6000 : 3500)
    },
    [dismiss],
  )
  return (
    <FeedbackContext.Provider value={notify}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  toast.action!.run()
                  dismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  )
}
