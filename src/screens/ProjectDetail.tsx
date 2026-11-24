import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import connectorDot from '../assets/event-connector.svg'
import { EventDialog, newDraft, type EventEditing } from '../calendar/EventDialog'
import { AddEventIcon, ArchiveIcon, AttachmentIcon, BackIcon, CloseIcon, EditIcon, InboxIcon, MailIcon, MoreIcon, PlusIcon, TrashIcon } from '../components/icons'
import { Menu, MenuItem, MenuSeparator, useFeedback } from '../components/overlays'
import { Button, EmptyState, ErrorNote, IconButton, Loading, TagChip } from '../components/ui'
import { invalidate, keys, useBackend, useQuery } from '../data/store'
import { formatBytes, formatDay, formatTime, parseDate } from '../lib/dates'
import { useAutosave, useIsMobile } from '../lib/hooks'
import type { CalendarEvent, Project, ProjectFile } from '../lib/types'
import { errorText } from '../mail/actions'
import { ThreadList } from '../mail/ThreadList'
import { ThreadView } from '../mail/ThreadView'

export function ProjectDetail({ projectId, threadId, onBack }: { projectId: string; threadId?: string; onBack: () => void }) {
  const backend = useBackend()
  const { data: project, error, reload } = useQuery(keys.project(projectId), () => backend.getProject(projectId))
  if (error && !project) return <ErrorNote error={error} onRetry={reload} />
  if (!project) return <Loading label="Loading project" />
  return <LoadedProject project={project} threadId={threadId} onBack={onBack} />
}

function LoadedProject({ project, threadId, onBack }: { project: Project; threadId?: string; onBack: () => void }) {
  const backend = useBackend()
  const notify = useFeedback()
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(project.name)
  const archived = project.status === 'archived'

  const rename = async () => {
    setRenaming(false)
    const next = name.trim()
    if (!next || next === project.name) return setName(project.name)
    try {
      await backend.updateProject(project.id, { name: next })
      invalidate(keys.projects)
    } catch (e) {
      notify(errorText(e), { tone: 'error' })
      setName(project.name)
    }
  }

  const toggleArchived = async () => {
    try {
      await backend.setProjectArchived(project.id, !archived)
      invalidate(keys.projects, keys.threads, 'thread:')
      notify(archived ? 'Project is active again' : 'Project archived, with its mail', {
        action: { label: 'Undo', run: () => void backend.setProjectArchived(project.id, archived).then(() => invalidate(keys.projects)) },
      })
    } catch (e) {
      notify(errorText(e), { tone: 'error' })
    }
  }

  const remove = async () => {
    if (!confirm(`Delete the project "${project.name}"? Its mail and events stay in Gmail and Google Calendar; only the project, its notes and uploaded files go.`)) return
    try {
      await backend.deleteProject(project.id)
      invalidate(keys.projects, keys.threads, keys.events)
      notify('Project deleted')
      navigate('/projects')
    } catch (e) {
      notify(errorText(e), { tone: 'error' })
    }
  }

  return (
    <article className="project" aria-label={project.name}>
      <header className="hero">
        <div className="hero__title">
          <IconButton icon={BackIcon} label="Back to projects" size={24} onClick={onBack} className="hero__back" />
          {renaming ? (
            <input
              className="hero__rename"
              autoFocus
              value={name}
              aria-label="Project name"
              onChange={(e) => setName(e.target.value)}
              onBlur={rename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  setName(project.name)
                  setRenaming(false)
                }
              }}
            />
          ) : (
            <h1 className="hero__heading" onDoubleClick={() => setRenaming(true)}>
              {project.name}
            </h1>
          )}
          <span className="hero__chips">
            {project.tags.map((tag) => (
              <TagChip key={tag} tag={tag} title="From the mail and events in this project" />
            ))}
          </span>
        </div>
        <div className="hero__actions">
          <IconButton icon={archived ? InboxIcon : ArchiveIcon} label={archived ? 'Make active again' : 'Archive project and its mail'} size={24} onClick={toggleArchived} />
          <Menu label="Project actions" trigger={(props) => <IconButton {...props} icon={MoreIcon} label="Project actions" size={24} />}>
            {(close) => (
              <>
                <MenuItem icon={EditIcon} onSelect={() => (close(), setRenaming(true))}>
                  Rename
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={TrashIcon} danger onSelect={() => (close(), void remove())}>
                  Delete project
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </header>

      <div className="project__scroll">
        {archived && (
          <div className="notice">
            <span>
              Archived {project.archivedAt ? formatDay(new Date(project.archivedAt)) : ''}.
              {project.unreadCount > 0 && <strong> {project.unreadCount} new mail since.</strong>}
            </span>
            <Button onClick={toggleArchived}>Make active</Button>
          </div>
        )}
        <EventsSection project={project} />
        <FilesSection project={project} />
        <NotesSection project={project} />
        <EmailsSection project={project} threadId={threadId} />
      </div>
    </article>
  )
}

function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`project-section ${className}`}>
      <h2 className="project-section__title">{title}</h2>
      {children}
    </section>
  )
}

function EventsSection({ project }: { project: Project }) {
  const backend = useBackend()
  const { data: events } = useQuery(keys.projectEvents(project.id), () => backend.listProjectEvents(project.id))
  const [editing, setEditing] = useState<EventEditing | null>(null)
  const strip = useRef<HTMLDivElement>(null)
  const now = Date.now()
  const firstUpcoming = events?.findIndex((event) => parseDate(event.end).getTime() > now) ?? -1

  // Start at the next event, with the past to the left.
  useEffect(() => {
    if (!strip.current || firstUpcoming <= 0) return
    const card = strip.current.querySelectorAll<HTMLElement>('.event-card')[firstUpcoming]
    strip.current.scrollLeft = card ? card.offsetLeft - strip.current.offsetLeft - 8 : 0
  }, [firstUpcoming])

  const add = () => {
    const at = new Date()
    at.setDate(at.getDate() + 1)
    at.setHours(10, 0, 0, 0)
    setEditing({ mode: 'create', draft: newDraft(at, { projectId: project.id }) })
  }

  return (
    <Section title="Events">
      <div className="event-strip" ref={strip}>
        {events?.length === 0 && <p className="muted event-strip__empty">No events yet.</p>}
        {events?.map((event, index) => (
          <div key={event.id} className="event-strip__item">
            {index > 0 && <img src={connectorDot} width={32} height={32} alt="" className="event-strip__connector" />}
            <EventCard event={event} past={index < firstUpcoming || firstUpcoming === -1} onOpen={() => setEditing({ mode: 'edit', event })} />
          </div>
        ))}
        <div className="event-strip__add">
          <IconButton icon={AddEventIcon} label="Add an event to this project" variant="round" onClick={add} />
        </div>
      </div>
      <EventDialog editing={editing} onClose={() => setEditing(null)} />
    </Section>
  )
}

function EventCard({ event, past, onOpen }: { event: CalendarEvent; past: boolean; onOpen: () => void }) {
  const start = parseDate(event.start)
  return (
    <button type="button" className={`event-card ${past ? 'is-past' : ''}`} data-tag={event.tag ?? 'none'} onClick={onOpen}>
      <span className="event-card__when">
        <span>{formatDay(start)}</span>
        <span>{event.allDay ? 'all day' : formatTime(start)}</span>
      </span>
      <span className="event-card__title">{event.title}</span>
      {event.location && <span className="event-card__where">{event.location}</span>}
    </button>
  )
}

function FilesSection({ project }: { project: Project }) {
  const backend = useBackend()
  const notify = useFeedback()
  const { data: files } = useQuery(keys.files(project.id), () => backend.listFiles(project.id))
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(0)

  const upload = async (list: FileList | File[]) => {
    const all = [...list]
    setUploading((n) => n + all.length)
    for (const file of all) {
      try {
        await backend.uploadFile(project.id, file)
      } catch (error) {
        notify(`${file.name}: ${errorText(error)}`, { tone: 'error' })
      } finally {
        setUploading((n) => n - 1)
      }
    }
    invalidate(keys.files(project.id), keys.projects)
  }

  const open = async (file: ProjectFile) => {
    try {
      const url = file.source === 'mail' && file.messageId && file.attachmentId ? await backend.attachmentUrl(file.messageId, file.attachmentId, file.name, file.mimeType) : await backend.fileUrl(file)
      window.open(url, '_blank', 'noopener')
    } catch (error) {
      notify(errorText(error), { tone: 'error' })
    }
  }

  const remove = async (file: ProjectFile) => {
    if (!confirm(`Delete ${file.name} from this project?`)) return
    try {
      await backend.deleteFile(file)
      invalidate(keys.files(project.id))
    } catch (error) {
      notify(errorText(error), { tone: 'error' })
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (event.dataTransfer.files.length) void upload(event.dataTransfer.files)
  }

  return (
    <Section title="Files" className={dragging ? 'is-dropping' : ''}>
      <div
        className="files"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {files?.map((file) => (
          <span key={file.id} className="file">
            <button type="button" className="file__open" onClick={() => open(file)} title={`${file.name} · ${formatBytes(file.size)}${file.source === 'mail' ? ' · from mail' : ''}`}>
              {file.source === 'mail' ? <MailIcon size={20} /> : <AttachmentIcon size={20} />}
              <span className="file__name">{file.name}</span>
            </button>
            {file.source === 'upload' && (
              <button type="button" className="file__remove" aria-label={`Delete ${file.name}`} title="Delete" onClick={() => remove(file)}>
                <CloseIcon size={14} />
              </button>
            )}
          </span>
        ))}
        {uploading > 0 && <span className="file file--pending">Uploading {uploading}…</span>}
        <IconButton icon={PlusIcon} label="Add files" variant="round" onClick={() => input.current?.click()} />
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {dragging && <p className="files__hint">Drop to add to {project.name}</p>}
    </Section>
  )
}

function NotesSection({ project }: { project: Project }) {
  const backend = useBackend()
  const [notes, setNotes] = useState(project.notes)
  const state = useAutosave(notes, async (value) => {
    await backend.updateProject(project.id, { notes: value })
    invalidate(keys.projects)
  })
  return (
    <Section title="Notes">
      <textarea
        className="notes"
        value={notes}
        placeholder="Anything worth remembering about this project…"
        aria-label="Notes"
        onChange={(e) => setNotes(e.target.value)}
        style={{ fieldSizing: 'content' } as CSSProperties}
      />
      <p className="save-state muted" aria-live="polite">
        {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Not saved. Check your connection.' : ' '}
      </p>
    </Section>
  )
}

function EmailsSection({ project, threadId }: { project: Project; threadId?: string }) {
  const backend = useBackend()
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const query = { box: 'inbox' as const, projectId: project.id }
  const { data: threads } = useQuery(`${keys.threads}${JSON.stringify(query)}`, () => backend.listThreads(query))
  const selected = threadId ?? (mobile ? undefined : threads?.[0]?.id)

  return (
    <Section title="Emails" className="project-section--emails">
      {threads?.length === 0 ? (
        <EmptyState title="No mail in this project yet" icon={MailIcon}>
          Open a conversation in your inbox and use “Add to project”.
        </EmptyState>
      ) : (
        <div className="mail-box">
          <div className="mail-box__list">
            {threads ? (
              <ThreadList threads={threads} variant="compact" selectedId={selected} onOpen={(t) => navigate(`/projects/${project.id}/mail/${t.id}`, { replace: !mobile })} />
            ) : (
              <Loading />
            )}
          </div>
          {!mobile && (
            <div className="mail-box__thread">
              {selected ? <ThreadView threadId={selected} embedded markRead={!!threadId} onGone={() => navigate(`/projects/${project.id}`, { replace: true })} /> : null}
            </div>
          )}
        </div>
      )}
    </Section>
  )
}
