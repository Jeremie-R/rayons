import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { CloseIcon, FolderIcon, LinkIcon, MailIcon, TrashIcon } from '../components/icons'
import { Dialog, useFeedback } from '../components/overlays'
import { Button, IconButton, TagChip } from '../components/ui'
import { invalidate, keys, useBackend, useQuery } from '../data/store'
import { addDays, dateKey, parseDate, toLocalIso } from '../lib/dates'
import { useIsMobile } from '../lib/hooks'
import { useShortcut } from '../lib/shortcuts'
import { TAGS, type CalendarEvent, type EventDraft, type Tag } from '../lib/types'
import { errorText } from '../mail/actions'

/** What the editor shows. `anchor` is the event or slot it opens next to (desktop). */
export type EventEditing = ({ mode: 'create'; draft: EventDraft } | { mode: 'edit'; event: CalendarEvent }) & { anchor?: DOMRect | null }

const pad = (n: number) => String(n).padStart(2, '0')
const timeOf = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

/** A new one-hour event starting at `at`, or a whole-day one. */
export function newDraft(
  at: Date,
  options: { allDay?: boolean; projectId?: string | null; tag?: Tag; threadId?: string | null; title?: string; description?: string } = {},
): EventDraft {
  const start = new Date(at)
  const common = {
    title: options.title ?? '',
    location: '',
    description: options.description ?? '',
    tag: options.tag ?? null,
    projectId: options.projectId ?? null,
    threadId: options.threadId ?? null,
  }
  if (options.allDay) return { ...common, start: dateKey(start), end: dateKey(addDays(start, 1)), allDay: true }
  const end = new Date(start.getTime() + 60 * 60_000)
  return { ...common, start: toLocalIso(start), end: toLocalIso(end), allDay: false }
}

interface Form {
  title: string
  allDay: boolean
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  location: string
  description: string
  tag: Tag
  projectId: string | null
  threadId: string | null
  calendarId: string
}

function toForm(event: EventDraft & { calendarId?: string }): Form {
  const start = parseDate(event.start)
  const end = parseDate(event.end)
  // All-day ends are exclusive in Google; the form shows the last day.
  const lastDay = event.allDay ? addDays(end, -1) : end
  return {
    title: event.title,
    allDay: event.allDay,
    startDate: dateKey(start),
    startTime: event.allDay ? '09:00' : timeOf(start),
    endDate: dateKey(lastDay < start ? start : lastDay),
    endTime: event.allDay ? '10:00' : timeOf(end),
    location: event.location,
    description: event.description,
    tag: event.tag,
    projectId: event.projectId,
    threadId: event.threadId ?? null,
    calendarId: event.calendarId ?? '',
  }
}

function fromForm(form: Form): EventDraft | string {
  if (!form.title.trim()) return 'Give the event a title.'
  const common = {
    title: form.title.trim(),
    location: form.location.trim(),
    description: form.description,
    tag: form.tag,
    projectId: form.projectId,
    threadId: form.threadId,
    ...(form.calendarId ? { calendarId: form.calendarId } : {}),
  }
  if (form.allDay) {
    if (form.endDate < form.startDate) return 'The event ends before it starts.'
    return { ...common, allDay: true, start: form.startDate, end: dateKey(addDays(parseDate(form.endDate), 1)) }
  }
  const start = parseDate(`${form.startDate}T${form.startTime}:00`)
  const end = parseDate(`${form.endDate}T${form.endTime}:00`)
  if (end <= start) return 'The event ends before it starts.'
  return { ...common, allDay: false, start: toLocalIso(start), end: toLocalIso(end) }
}

/**
 * The event editor. Desktop: a popover next to what was clicked, two columns, the rest of the
 * screen still visible and usable. Phone: a bottom sheet.
 */
export function EventDialog({ editing, onClose, onDirtyChange }: { editing: EventEditing | null; onClose: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const mobile = useIsMobile()
  if (!editing) return null
  const key = editing.mode === 'edit' ? editing.event.id : `new:${editing.draft.start}`
  const title = editing.mode === 'edit' ? 'Event' : 'New event'
  if (mobile) {
    return (
      <Dialog open onClose={onClose} title={title}>
        <EventForm key={key} editing={editing} onClose={onClose} onDirtyChange={onDirtyChange} />
      </Dialog>
    )
  }
  return (
    <EventPopover anchor={editing.anchor ?? null} title={title} onClose={onClose}>
      {(setDirty) => (
        <EventForm
          key={key}
          editing={editing}
          onClose={onClose}
          wide
          onDirtyChange={(dirty) => {
            setDirty(dirty)
            onDirtyChange?.(dirty)
          }}
        />
      )}
    </EventPopover>
  )
}

const POPOVER_WIDTH = 680
const GAP = 12
const EDGE = 12

function EventPopover({ anchor, title, onClose, children }: { anchor: DOMRect | null; title: string; onClose: () => void; children: (setDirty: (dirty: boolean) => void) => ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const dirty = useRef(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const place = () => {
      const el = panel.current
      if (!el) return
      const width = Math.min(POPOVER_WIDTH, window.innerWidth - EDGE * 2)
      const height = el.offsetHeight
      let left: number
      let top: number
      if (anchor) {
        // Beside the event: right if it fits, else left, else over it.
        if (anchor.right + GAP + width <= window.innerWidth - EDGE) left = anchor.right + GAP
        else if (anchor.left - GAP - width >= EDGE) left = anchor.left - GAP - width
        else left = (window.innerWidth - width) / 2
        top = anchor.top
      } else {
        left = (window.innerWidth - width) / 2
        top = window.innerHeight * 0.12
      }
      top = Math.max(EDGE, Math.min(top, window.innerHeight - height - EDGE))
      setPosition({ left: Math.round(left), top: Math.round(top) })
    }
    place()
    const observer = new ResizeObserver(place)
    if (panel.current) observer.observe(panel.current)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [anchor])

  useEffect(() => {
    // Straight into the title (a new event) or the first field.
    panel.current?.querySelector<HTMLElement>('.event-form input:not([type="checkbox"]), .event-form button')?.focus({ preventScroll: true })
    // A click elsewhere closes it, unless something was typed (then Cancel or Save).
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element
      if (panel.current?.contains(target) || target.closest?.('.menu, .tooltip')) return
      if (!dirty.current) onClose()
      else panel.current?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], 220)
    }
    document.addEventListener('pointerdown', onPointer, true)
    return () => document.removeEventListener('pointerdown', onPointer, true)
  }, [onClose])

  useShortcut('Escape', onClose)

  return createPortal(
    <div
      ref={panel}
      className="event-popover"
      role="dialog"
      aria-label={title}
      data-blocks-shortcuts=""
      style={{ left: position?.left ?? -9999, top: position?.top ?? -9999, width: Math.min(POPOVER_WIDTH, window.innerWidth - EDGE * 2) }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="event-popover__header">
        <h2 className="visually-hidden">{title}</h2>
        <IconButton icon={CloseIcon} label="Close" shortcut="Escape" size={20} onClick={onClose} />
      </header>
      {children((value) => (dirty.current = value))}
    </div>,
    document.body,
  )
}

function EventForm({ editing, onClose, wide, onDirtyChange }: { editing: EventEditing; onClose: () => void; wide?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const backend = useBackend()
  const notify = useFeedback()
  const original = editing.mode === 'edit' ? editing.event : null
  const [initial] = useState<Form>(() => toForm(editing.mode === 'edit' ? editing.event : editing.draft))
  const [form, setForm] = useState<Form>(initial)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { data: projects } = useQuery(keys.projects, () => backend.listProjects())
  const { data: calendars } = useQuery(keys.calendars, () => backend.listCalendars())
  const { data: thread } = useQuery(form.threadId ? keys.thread(form.threadId) : null, () => backend.getThread(form.threadId!))
  const readOnly = original ? !original.canEdit : false
  const set = <K extends keyof Form>(name: K, value: Form[K]) => setForm((f) => ({ ...f, [name]: value }))

  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])

  const refresh = () => invalidate(keys.events, keys.projects)

  const save = async () => {
    const draft = fromForm(form)
    if (typeof draft === 'string') {
      setProblem(draft)
      return
    }
    setBusy(true)
    try {
      if (original) {
        const { calendarId: _, ...patch } = draft
        await backend.updateEvent(original.id, readOnly ? { tag: draft.tag, projectId: draft.projectId, threadId: draft.threadId } : patch)
      } else {
        await backend.createEvent(draft)
      }
      refresh()
      notify(original ? 'Event saved' : 'Event added')
      onDirtyChange?.(false)
      onClose()
    } catch (error) {
      setProblem(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!original || !confirm(`Delete "${original.title}"? It will be removed from Google Calendar too.`)) return
    setBusy(true)
    try {
      await backend.deleteEvent(original.id)
      refresh()
      notify('Event deleted')
      onDirtyChange?.(false)
      onClose()
    } catch (error) {
      setProblem(errorText(error))
      setBusy(false)
    }
  }

  const project = projects?.find((p) => p.id === form.projectId)
  const projectOptions = (projects ?? []).filter((p) => p.status === 'active' || p.id === form.projectId)
  const writableCalendars = (calendars ?? []).filter((c) => c.canEdit)

  const main = (
    <div className="event-form__main">
      <label className="field">
        <span className="field__label visually-hidden">Title</span>
        <input className="field__input field__input--title" value={form.title} onChange={(e) => set('title', e.target.value)} readOnly={readOnly} placeholder="Add a title" autoFocus={!original} />
      </label>

      <div className="event-form__when">
        <div className="field-row">
          <label className="field">
            <span className="field__label">Starts</span>
            <input
              className="field__input"
              type="date"
              value={form.startDate}
              readOnly={readOnly}
              onChange={(e) => {
                const startDate = e.target.value
                if (!startDate) return
                // Keep the same length when the start moves.
                setForm((f) => {
                  const shift = parseDate(startDate).getTime() - parseDate(f.startDate).getTime()
                  return { ...f, startDate, endDate: dateKey(new Date(parseDate(f.endDate).getTime() + shift)) }
                })
              }}
            />
          </label>
          {!form.allDay && (
            <label className="field field--time">
              <span className="field__label visually-hidden">Start time</span>
              <input className="field__input" type="time" step={300} value={form.startTime} readOnly={readOnly} onChange={(e) => set('startTime', e.target.value)} />
            </label>
          )}
        </div>
        <div className="field-row">
          <label className="field">
            <span className="field__label">Ends</span>
            <input className="field__input" type="date" value={form.endDate} readOnly={readOnly} onChange={(e) => set('endDate', e.target.value)} />
          </label>
          {!form.allDay && (
            <label className="field field--time">
              <span className="field__label visually-hidden">End time</span>
              <input className="field__input" type="time" step={300} value={form.endTime} readOnly={readOnly} onChange={(e) => set('endTime', e.target.value)} />
            </label>
          )}
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={form.allDay} onChange={(e) => set('allDay', e.target.checked)} disabled={readOnly} />
          All day
        </label>
      </div>

      <label className="field">
        <span className="field__label">Where</span>
        <input className="field__input" value={form.location} onChange={(e) => set('location', e.target.value)} readOnly={readOnly} placeholder="Address or place" />
      </label>

      <label className="field">
        <span className="field__label">Notes</span>
        <textarea className="field__input field__textarea" rows={wide ? 4 : 3} value={form.description} onChange={(e) => set('description', e.target.value)} readOnly={readOnly} />
      </label>
    </div>
  )

  const side = (
    <div className="event-form__side">
      {project && (
        <Link to={`/projects/${project.id}`} className="project-card" data-tag={project.tags[0] ?? 'none'} onClick={onClose}>
          <FolderIcon size={20} />
          <span className="project-card__text">
            <span className="medium">{project.name}</span>
            {project.notes && <span className="project-card__notes muted">{project.notes}</span>}
          </span>
        </Link>
      )}

      <div className="field">
        <span className="field__label">Tag</span>
        <div className="chips" role="radiogroup" aria-label="Tag">
          {[...TAGS, null].map((tag) => (
            <TagChip key={tag ?? 'none'} tag={tag} active={form.tag === tag} onClick={() => set('tag', tag)} />
          ))}
        </div>
      </div>

      <label className="field">
        <span className="field__label">Project</span>
        <select className="field__input" value={form.projectId ?? ''} onChange={(e) => set('projectId', e.target.value || null)}>
          <option value="">No project</option>
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.status === 'archived' ? ' (archived)' : ''}
            </option>
          ))}
        </select>
      </label>

      {form.threadId && (
        <div className="field">
          <span className="field__label">From mail</span>
          <span className="linked-mail">
            <Link to={`/inbox/${form.threadId}`} className="linked-mail__link" onClick={onClose}>
              <MailIcon size={16} />
              <span className="linked-mail__subject">{thread?.subject ?? 'Conversation'}</span>
            </Link>
            <IconButton icon={CloseIcon} label="Unlink from this mail" size={16} onClick={() => set('threadId', null)} />
          </span>
        </div>
      )}

      {!original && writableCalendars.length > 1 && (
        <label className="field">
          <span className="field__label">Calendar</span>
          <select className="field__input" value={form.calendarId || writableCalendars.find((c) => c.primary)?.id || ''} onChange={(e) => set('calendarId', e.target.value)}>
            {writableCalendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {readOnly && <p className="muted note">You were invited to this event, so only its tag, project and mail link can change here.</p>}
    </div>
  )

  return (
    <form
      className={`form event-form ${wide ? 'event-form--wide' : ''}`}
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="event-form__columns">
        {main}
        {side}
      </div>
      {problem && (
        <p className="form__problem" role="alert">
          {problem}
        </p>
      )}
      <div className="form__actions">
        {original && !readOnly && (
          <Button variant="danger" icon={TrashIcon} onClick={remove} disabled={busy}>
            Delete
          </Button>
        )}
        {original?.link && (
          <a className="button button--ghost button--sm" href={original.link} target="_blank" rel="noopener noreferrer">
            <LinkIcon size={16} />
            Google Calendar
          </a>
        )}
        <span className="form__spacer" />
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="accent" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
