import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { EventDialog, newDraft, type EventEditing } from '../calendar/EventDialog'
import {
  AddEventIcon,
  AddToProjectIcon,
  ArchiveIcon,
  AttachmentIcon,
  BackIcon,
  CalendarIcon,
  FolderIcon,
  InboxIcon,
  LinkIcon,
  MailIcon,
  MoreIcon,
  PlusIcon,
  ReplyIcon,
  SpamIcon,
  TrashIcon,
  UnsubscribeIcon,
} from '../components/icons'
import { Menu, MenuItem, MenuSeparator, useFeedback } from '../components/overlays'
import { ProjectPicker, TagPicker } from '../components/pickers'
import { Avatar, ErrorNote, IconButton, Loading, TagDot, tooltip } from '../components/ui'
import { keys, useBackend, useQuery } from '../data/store'
import { formatDay, formatListDate, formatTime, parseDate } from '../lib/dates'
import { guessDate } from '../lib/guessDate'
import { useIsMobile } from '../lib/hooks'
import { useShortcut } from '../lib/shortcuts'
import { tagLabel } from '../lib/tags'
import type { Attachment, CalendarEvent, Message, Thread } from '../lib/types'
import { errorText, useMailActions } from './actions'
import { ReplyComposer } from './Composer'
import { LinkEventDialog } from './LinkEventDialog'
import { MessageBody, splitQuoted } from './MessageBody'

interface ThreadViewProps {
  threadId: string
  onBack?: () => void
  /** Inside a project page: smaller header, no "part of project" strip, no shortcuts. */
  embedded?: boolean
  /** Called after the thread leaves the current list (archived, trashed, spam). */
  onGone?: () => void
  /** Mark as read on open. Off when the thread was picked for you rather than opened. */
  markRead?: boolean
}

export function ThreadView({ threadId, onBack, embedded, onGone, markRead = true }: ThreadViewProps) {
  const backend = useBackend()
  const { data: thread, error, reload } = useQuery(keys.thread(threadId), () => backend.getThread(threadId))

  if (error && !thread) return <ErrorNote error={error} onRetry={reload} />
  if (!thread || thread.id !== threadId) return <Loading label="Loading conversation" />
  return <LoadedThread key={thread.id} thread={thread} onBack={onBack} embedded={embedded} onGone={onGone} markRead={markRead} />
}

const stripPrefixes = (subject: string) => subject.replace(/^((re|fwd?|sv|vs|aw|tr|antw)\s*:\s*)+/i, '').trim()

function LoadedThread({ thread, onBack, embedded, onGone, markRead }: { thread: Thread } & Omit<ThreadViewProps, 'threadId'>) {
  const backend = useBackend()
  const actions = useMailActions()
  const mobile = useIsMobile()
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState<EventEditing | null>(null)
  const [linking, setLinking] = useState(false)
  const me = backend.account.email.toLowerCase()
  const article = useRef<HTMLElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const { data: events } = useQuery(keys.threadEvents(thread.id), () => backend.listThreadEvents(thread.id))

  // Newest first, as in the design. The newest message and any unread ones start open.
  const messages = [...thread.messages].reverse()
  const [expanded, setExpanded] = useState(() => new Set(messages.filter((_, i) => i === 0 || thread.unread).map((m) => m.id)))

  useEffect(() => {
    if (thread.unread && markRead) void actions.setRead(thread, true)
    // Only when a thread is opened, not when it changes afterwards.
  }, [thread.id])

  const leave = async (task: () => Promise<boolean>) => {
    if (await task()) onGone?.()
  }
  const archive = () => leave(() => actions.toggleArchived(thread))
  const trash = () => leave(() => actions.trash(thread))
  const spam = () => leave(() => actions.toggleSpam(thread))
  const reply = () => {
    setReplying(true)
    scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const openMenu = (name: string) => article.current?.querySelector<HTMLButtonElement>(`[data-menu="${name}"]`)?.click()

  // A new event, dated from the mail when it mentions a date.
  const eventFromMail = (anchor?: DOMRect) => {
    const latest = messages[0]
    const guess = guessDate(`${thread.subject}\n${latest ? splitQuoted(latest.text)[0] : ''}`)
    const at = guess?.start ?? (() => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)
      return tomorrow
    })()
    setEditing({
      mode: 'create',
      draft: newDraft(at, { title: stripPrefixes(thread.subject), threadId: thread.id, tag: thread.tag, projectId: thread.projectId }),
      anchor,
    })
  }

  const shortcuts = !embedded
  useShortcut('e', archive, shortcuts)
  useShortcut('#', trash, shortcuts)
  useShortcut('!', spam, shortcuts)
  useShortcut('r', reply, shortcuts)
  useShortcut('U', () => void actions.setRead(thread, false).then(() => onBack?.()), shortcuts)
  useShortcut('I', () => void actions.setRead(thread, true), shortcuts)
  useShortcut('l', () => openMenu('tag'), shortcuts)
  useShortcut('p', () => openMenu('project'), shortcuts)
  useShortcut('v', () => openMenu('calendar'), shortcuts)
  useShortcut('u', () => onBack?.(), shortcuts && !!onBack)
  useShortcut('Escape', () => onBack?.(), shortcuts && !!onBack)

  const tagTrigger = (
    <TagPicker
      value={thread.tag}
      onChange={(tag) => actions.setTag(thread, tag)}
      label="Tag this conversation"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          data-menu="tag"
          data-tag={thread.tag ?? 'none'}
          className={`tag tag--button ${thread.tag ? '' : 'tag--empty'}`}
          {...tooltip('Tag', shortcuts ? 'l' : undefined)}
        >
          {thread.tag ? tagLabel(thread.tag) : '+ tag'}
        </button>
      )}
    />
  )

  const projectButton = (
    <ProjectPicker
      value={thread.projectId}
      onChange={(projectId, project) => actions.setProject(thread, projectId, project)}
      trigger={(props) => (
        <IconButton {...props} data-menu="project" icon={AddToProjectIcon} label={thread.projectId ? 'Change project' : 'Add to project'} shortcut={shortcuts ? 'p' : undefined} size={24} />
      )}
    />
  )

  const calendarButton = (
    <Menu label="Add to calendar" trigger={(props) => <IconButton {...props} data-menu="calendar" icon={AddEventIcon} label="Add to calendar" shortcut={shortcuts ? 'v' : undefined} size={24} />}>
      {(close) => (
        <>
          <MenuItem
            icon={PlusIcon}
            onSelect={() => {
              close()
              eventFromMail(article.current?.querySelector('[data-menu="calendar"]')?.getBoundingClientRect())
            }}
          >
            New event from this mail
          </MenuItem>
          <MenuItem
            icon={LinkIcon}
            onSelect={() => {
              close()
              setLinking(true)
            }}
          >
            Link an existing event…
          </MenuItem>
        </>
      )}
    </Menu>
  )

  const archiveLabel = thread.archived ? 'Move to inbox' : 'Archive'
  // On phones and inside projects, the less common actions move into the ⋯ menu.
  const compact = mobile || embedded
  const secondary = (close: () => void) => (
    <>
      <MenuItem icon={MailIcon} onSelect={() => (actions.setRead(thread, false), close(), onBack?.())} hint={shortcuts ? '⇧U' : undefined}>
        Mark as unread
      </MenuItem>
      {compact && (
        <>
          <MenuItem icon={AddEventIcon} onSelect={() => (close(), eventFromMail())}>
            New event from this mail
          </MenuItem>
          <MenuItem icon={LinkIcon} onSelect={() => (close(), setLinking(true))}>
            Link an existing event…
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={TrashIcon} onSelect={() => (close(), void trash())}>
            Move to trash
          </MenuItem>
          <MenuItem icon={SpamIcon} onSelect={() => (close(), void spam())}>
            {thread.spam ? 'Not spam' : 'Report spam'}
          </MenuItem>
          {thread.canUnsubscribe && (
            <MenuItem icon={UnsubscribeIcon} onSelect={() => (close(), void actions.unsubscribe(thread))}>
              Unsubscribe
            </MenuItem>
          )}
        </>
      )}
      {embedded && (
        <>
          <MenuSeparator />
          <MenuItem icon={ArchiveIcon} onSelect={() => (close(), void archive())}>
            {archiveLabel}
          </MenuItem>
        </>
      )}
    </>
  )

  const linked = events ?? []
  const showRail = !embedded && linked.length > 0

  return (
    <article ref={article} className={`thread ${embedded ? 'thread--embedded' : ''}`} aria-label={thread.subject}>
      <header className="hero thread__hero">
        <div className="hero__title">
          {onBack && <IconButton icon={BackIcon} label="Back to the list" shortcut={shortcuts ? 'u' : undefined} size={24} onClick={onBack} className="hero__back" />}
          <h1 className="hero__heading" data-tooltip={thread.subject} data-tooltip-truncated="">
            {thread.subject}
          </h1>
          {!mobile && tagTrigger}
        </div>
        <div className="hero__actions" role="toolbar" aria-label="Conversation actions">
          {!embedded && projectButton}
          {!compact && calendarButton}
          {!embedded && <IconButton icon={thread.archived ? InboxIcon : ArchiveIcon} label={archiveLabel} shortcut={shortcuts ? 'e' : undefined} size={24} onClick={archive} />}
          {!compact && (
            <>
              <IconButton icon={TrashIcon} label="Move to trash" shortcut="#" size={24} onClick={trash} />
              <IconButton icon={SpamIcon} label={thread.spam ? 'Not spam' : 'Report spam'} shortcut="!" size={24} onClick={spam} />
              {thread.canUnsubscribe && <IconButton icon={UnsubscribeIcon} label="Unsubscribe" size={24} onClick={() => actions.unsubscribe(thread)} />}
            </>
          )}
          <Menu label="More actions" trigger={(props) => <IconButton {...props} icon={MoreIcon} label="More actions" size={24} />}>
            {secondary}
          </Menu>
        </div>
        {mobile && <div className="hero__tags">{tagTrigger}</div>}
      </header>

      <div className="thread__scroll" ref={scroller}>
        <div className={`thread__body ${showRail ? 'has-rail' : ''}`}>
          <div className="thread__main">
            {!embedded && thread.projectId && <ProjectStrip projectId={thread.projectId} threadId={thread.id} />}
            <div className="thread__messages">
              {replying && <ReplyComposer thread={thread} onDone={() => setReplying(false)} />}
              {messages.map((message, index) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  self={message.from.email.toLowerCase() === me}
                  open={expanded.has(message.id)}
                  divider={index > 0 || replying}
                  onToggle={() =>
                    setExpanded((set) => {
                      const next = new Set(set)
                      if (next.has(message.id)) next.delete(message.id)
                      else next.add(message.id)
                      return next
                    })
                  }
                />
              ))}
            </div>
          </div>
          {showRail && <CalendarRail events={linked} onOpen={(event, anchor) => setEditing({ mode: 'edit', event, anchor })} onAdd={eventFromMail} />}
        </div>
        {!replying && (
          <div className="thread__reply">
            <button type="button" className="pill-button" onClick={reply} {...tooltip('Reply', shortcuts ? 'r' : undefined)}>
              <ReplyIcon size={24} />
              Reply
            </button>
          </div>
        )}
      </div>

      <EventDialog editing={editing} onClose={() => setEditing(null)} />
      <LinkEventDialog open={linking} thread={thread} onClose={() => setLinking(false)} />
    </article>
  )
}

/** Events that belong with this conversation, with or without a project. */
function CalendarRail({ events, onOpen, onAdd }: { events: CalendarEvent[]; onOpen: (event: CalendarEvent, anchor: DOMRect) => void; onAdd: (anchor?: DOMRect) => void }) {
  const now = Date.now()
  return (
    <aside className="calendar-rail" aria-label="Calendar">
      <header className="calendar-rail__header">
        <span className="calendar-rail__title">
          <CalendarIcon size={16} />
          Calendar
        </span>
        <IconButton icon={PlusIcon} label="New event from this mail" size={16} onClick={(e) => onAdd(e.currentTarget.getBoundingClientRect())} />
      </header>
      <ul className="calendar-rail__list" role="list">
        {events.map((event) => {
          const start = parseDate(event.start)
          const past = parseDate(event.end).getTime() < now
          return (
            <li key={event.id}>
              <button type="button" className={`rail-event ${past ? 'is-past' : ''}`} onClick={(e) => onOpen(event, e.currentTarget.getBoundingClientRect())}>
                <span className="rail-event__when">
                  {event.tag && <TagDot tag={event.tag} />}
                  {formatDay(start)}
                  {!event.allDay && <span className="muted"> · {formatTime(start)}</span>}
                </span>
                <span className="rail-event__title">{event.title}</span>
                {event.location && <span className="rail-event__where muted">{event.location}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

function MessageItem({ message, self, open, divider, onToggle }: { message: Message; self: boolean; open: boolean; divider: boolean; onToggle: () => void }) {
  const date = parseDate(message.date)
  return (
    <section className={`message ${open ? 'is-open' : ''} ${divider ? 'has-divider' : ''}`}>
      <button type="button" className="message__header" onClick={onToggle} aria-expanded={open}>
        <Avatar person={message.from} self={self} />
        <span className="message__from">
          <span className="medium">{message.from.name || message.from.email}</span>
          {message.from.name && <span className="muted message__email">{message.from.email}</span>}
        </span>
        <time className="message__date medium" dateTime={message.date} {...tooltip(`${formatDay(date)} ${formatTime(date)}`)}>
          {open ? formatDay(date) : formatListDate(message.date)}
        </time>
      </button>
      {open ? (
        <div className="message__content">
          <MessageBody text={message.text} html={message.html} />
          {message.attachments.length > 0 && <AttachmentChips attachments={message.attachments} />}
        </div>
      ) : (
        <p className="message__snippet muted">{message.snippet}</p>
      )}
    </section>
  )
}

export function AttachmentChips({ attachments }: { attachments: Attachment[] }) {
  const backend = useBackend()
  const notify = useFeedback()
  const open = async (attachment: Attachment) => {
    try {
      const url = await backend.attachmentUrl(attachment.messageId, attachment.id, attachment.filename, attachment.mimeType)
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener'
      if (!attachment.mimeType.startsWith('image/') && attachment.mimeType !== 'application/pdf') link.download = attachment.filename
      link.click()
    } catch (error) {
      notify(errorText(error), { tone: 'error' })
    }
  }
  return (
    <div className="chips" aria-label="Attachments">
      {attachments.map((attachment) => (
        <button key={attachment.id} type="button" className="file-chip" onClick={() => open(attachment)}>
          <AttachmentIcon size={14} />
          {attachment.filename}
        </button>
      ))}
    </div>
  )
}

/** When a conversation belongs to a project: what else is in it, one tap away. */
function ProjectStrip({ projectId, threadId }: { projectId: string; threadId: string }) {
  const backend = useBackend()
  const { data: project } = useQuery(keys.project(projectId), () => backend.getProject(projectId))
  const { data: events } = useQuery(keys.projectEvents(projectId), () => backend.listProjectEvents(projectId))
  const next = useMemo(() => events?.find((event) => parseDate(event.end).getTime() > Date.now()), [events])
  if (!project) return null
  return (
    <Link to={`/projects/${project.id}/mail/${threadId}`} className="project-strip" data-tag={project.tags[0] ?? 'none'}>
      <FolderIcon size={16} />
      <span className="project-strip__text">
        <span className="medium">{project.name}</span>
        {next && (
          <span className="muted">
            {' '}
            · next: {next.title}, {next.allDay ? formatListDate(parseDate(next.start).toISOString()) : `${formatListDate(next.start)} ${formatTime(parseDate(next.start))}`}
          </span>
        )}
      </span>
      <span className="project-strip__open">Open project</span>
    </Link>
  )
}
