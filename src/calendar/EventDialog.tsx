import { useState } from 'react'
import { Link } from 'react-router'
import { FolderIcon, LinkIcon, TrashIcon } from '../components/icons'
import { Dialog, useFeedback } from '../components/overlays'
import { Button, TagChip } from '../components/ui'
import { invalidate, keys, useBackend, useQuery } from '../data/store'
import { addDays, dateKey, parseDate, toLocalIso } from '../lib/dates'
import { TAGS, type CalendarEvent, type EventDraft, type Tag } from '../lib/types'
import { errorText } from '../mail/actions'

export type EventEditing = { mode: 'create'; draft: EventDraft } | { mode: 'edit'; event: CalendarEvent }

const pad = (n: number) => String(n).padStart(2, '0')
const timeOf = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

/** A new one-hour event starting at `at`, or a whole-day one. */
export function newDraft(at: Date, options: { allDay?: boolean; projectId?: string | null; tag?: Tag } = {}): EventDraft {
  const start = new Date(at)
  if (options.allDay) {
    return { title: '', start: dateKey(start), end: dateKey(addDays(start, 1)), allDay: true, location: '', description: '', tag: options.tag ?? null, projectId: options.projectId ?? null }
  }
  const end = new Date(start.getTime() + 60 * 60_000)
  return { title: '', start: toLocalIso(start), end: toLocalIso(end), allDay: false, location: '', description: '', tag: options.tag ?? null, projectId: options.projectId ?? null }
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
}

function toForm(event: EventDraft): Form {
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
  }
}

function fromForm(form: Form): EventDraft | string {
  if (!form.title.trim()) return 'Give the event a title.'
  if (form.allDay) {
    if (form.endDate < form.startDate) return 'The event ends before it starts.'
    return { ...common(form), allDay: true, start: form.startDate, end: dateKey(addDays(parseDate(form.endDate), 1)) }
  }
  const start = parseDate(`${form.startDate}T${form.startTime}:00`)
  const end = parseDate(`${form.endDate}T${form.endTime}:00`)
  if (end <= start) return 'The event ends before it starts.'
  return { ...common(form), allDay: false, start: toLocalIso(start), end: toLocalIso(end) }
}

const common = (form: Form) => ({
  title: form.title.trim(),
  location: form.location.trim(),
  description: form.description,
  tag: form.tag,
  projectId: form.projectId,
})

export function EventDialog({ editing, onClose }: { editing: EventEditing | null; onClose: () => void }) {
  return (
    <Dialog open={!!editing} onClose={onClose} title={editing?.mode === 'edit' ? 'Event' : 'New event'}>
      {editing && <EventForm key={editing.mode === 'edit' ? editing.event.id : 'new'} editing={editing} onClose={onClose} />}
    </Dialog>
  )
}

function EventForm({ editing, onClose }: { editing: EventEditing; onClose: () => void }) {
  const backend = useBackend()
  const notify = useFeedback()
  const original = editing.mode === 'edit' ? editing.event : null
  const [form, setForm] = useState<Form>(() => toForm(editing.mode === 'edit' ? editing.event : editing.draft))
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { data: projects } = useQuery(keys.projects, () => backend.listProjects())
  const readOnly = original ? !original.canEdit : false
  const set = <K extends keyof Form>(name: K, value: Form[K]) => setForm((f) => ({ ...f, [name]: value }))

  const refresh = () => invalidate(keys.events, keys.projects)

  const save = async () => {
    const draft = fromForm(form)
    if (typeof draft === 'string') {
      setProblem(draft)
      return
    }
    setBusy(true)
    try {
      if (original) await backend.updateEvent(original.id, readOnly ? { tag: draft.tag, projectId: draft.projectId } : draft)
      else await backend.createEvent(draft)
      refresh()
      notify(original ? 'Event saved' : 'Event added')
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
      onClose()
    } catch (error) {
      setProblem(errorText(error))
      setBusy(false)
    }
  }

  const project = projects?.find((p) => p.id === form.projectId)
  const projectOptions = (projects ?? []).filter((p) => p.status === 'active' || p.id === form.projectId)

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      {project && (
        <Link to={`/projects/${project.id}`} className="project-card" data-tag={project.tags[0] ?? 'none'} onClick={onClose}>
          <FolderIcon size={20} />
          <span className="project-card__text">
            <span className="medium">{project.name}</span>
            {project.notes && <span className="project-card__notes muted">{project.notes}</span>}
          </span>
        </Link>
      )}

      <label className="field">
        <span className="field__label">Title</span>
        <input className="field__input field__input--title" value={form.title} onChange={(e) => set('title', e.target.value)} autoFocus={!original} readOnly={readOnly} placeholder="What's happening?" />
      </label>

      <label className="checkbox">
        <input type="checkbox" checked={form.allDay} onChange={(e) => set('allDay', e.target.checked)} disabled={readOnly} />
        All day
      </label>

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

      <label className="field">
        <span className="field__label">Where</span>
        <input className="field__input" value={form.location} onChange={(e) => set('location', e.target.value)} readOnly={readOnly} placeholder="Address or place" />
      </label>

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

      <label className="field">
        <span className="field__label">Notes</span>
        <textarea className="field__input field__textarea" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} readOnly={readOnly} />
      </label>

      {readOnly && <p className="muted note">You were invited to this event, so only its tag and project can change here.</p>}
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
