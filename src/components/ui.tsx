import { useEffect, useState, type ButtonHTMLAttributes, type ComponentType, type ReactNode, type SVGProps } from 'react'
import { TAGS, type Person, type Tag, type TagId } from '../lib/types'
import { pictureFor } from '../lib/avatars'
import { tagLabel } from '../lib/tags'

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>

/** Props that give any element the app's tooltip (see Tooltips.tsx). */
export const tooltip = (label: string, shortcut?: string) => ({
  'data-tooltip': label,
  ...(shortcut ? { 'data-keys': shortcut, 'aria-keyshortcuts': shortcut.replace(' ', '+') } : {}),
})

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconComponent
  /** Read by screen readers and shown as a tooltip. */
  label: string
  /** Shown as key caps in the tooltip, e.g. 'e', 'U', 'g i'. */
  shortcut?: string
  /** `round`: the 40px lavender button from the design. `plain`: just the icon. */
  variant?: 'plain' | 'round'
  size?: 16 | 20 | 24
  active?: boolean
}

export function IconButton({ icon: Icon, label, shortcut, variant = 'plain', size = 16, active, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      {...tooltip(label, shortcut)}
      className={`icon-button icon-button--${variant} ${active ? 'is-active' : ''} ${className}`}
      {...rest}
    >
      <Icon size={size} />
    </button>
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'outline' | 'accent' | 'solid' | 'ghost' | 'danger'
  icon?: IconComponent
  size?: 'sm' | 'md' | 'lg'
  /** Adds a tooltip naming the keyboard shortcut. */
  shortcut?: string
  hint?: string
}

export function Button({ variant = 'outline', icon: Icon, size = 'sm', className = '', children, shortcut, hint, ...rest }: ButtonProps) {
  const tip = hint ?? (shortcut && typeof children === 'string' ? children : undefined)
  return (
    <button type="button" className={`button button--${variant} button--${size} ${className}`} {...(tip ? tooltip(tip, shortcut) : {})} {...rest}>
      {Icon && <Icon size={size === 'lg' ? 24 : 16} />}
      {children}
    </button>
  )
}

interface TagChipProps {
  tag: Tag
  /** Filled with the tag colour (a selected filter). */
  active?: boolean
  onClick?: () => void
  label?: string
  className?: string
  title?: string
}

export function TagChip({ tag, active, onClick, label, className = '', title }: TagChipProps) {
  const text = label ?? tagLabel(tag)
  const props = { 'data-tag': tag ?? 'none', className: `tag ${active ? 'is-active' : ''} ${onClick ? 'tag--button' : ''} ${className}` }
  if (!onClick) return <span {...props}>{text}</span>
  return (
    <button type="button" {...props} onClick={onClick} aria-pressed={active} {...(title ? tooltip(title) : {})}>
      {text}
    </button>
  )
}

export function TagDot({ tag, title }: { tag: Tag; title?: string }) {
  return <span className="tag-dot" data-tag={tag ?? 'none'} role="img" aria-label={title ?? `Tag: ${tagLabel(tag)}`} />
}

export function TagDots({ tags }: { tags: TagId[] }) {
  if (tags.length === 0) return null
  return (
    <span className="tag-dots" role="img" aria-label={`Tags: ${tags.map(tagLabel).join(', ')}`}>
      {TAGS.filter((t) => tags.includes(t)).map((tag) => (
        <span key={tag} className="tag-dot" data-tag={tag} />
      ))}
    </span>
  )
}

/** A photo or company logo when there is one (see lib/avatars), over the first letter. */
export function Avatar({ person, self, photo }: { person: Person; self?: boolean; photo?: string | null }) {
  const letter = (person.name || person.email).trim().charAt(0).toUpperCase() || '?'
  const src = photo ?? (self ? null : pictureFor(person.email))
  const [shown, setShown] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <span className={`avatar ${self ? 'avatar--self' : ''} ${src && shown === src ? 'has-picture' : ''}`} aria-hidden="true">
      {letter}
      {src && failed !== src && <img src={src} alt="" className={src.startsWith('/api/logo') ? 'is-logo' : ''} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={() => setShown(src)} onError={() => setFailed(src)} />}
    </span>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={`segmented__item ${option.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ title, children, icon: Icon }: { title: string; children?: ReactNode; icon?: IconComponent }) {
  return (
    <div className="empty">
      {Icon && (
        <span className="empty__icon">
          <Icon size={24} />
        </span>
      )}
      <p className="medium">{title}</p>
      {children && <div className="muted">{children}</div>}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />
}

/** Shows the spinner only when loading takes more than a moment, to avoid flashes. */
export function Loading({ label }: { label?: string }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 250)
    return () => clearTimeout(timer)
  }, [])
  return <div className="loading">{visible && <Spinner label={label} />}</div>
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div className="error-note" role="alert">
      <p>{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
