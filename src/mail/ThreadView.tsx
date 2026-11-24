import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  AddToProjectIcon,
  ArchiveIcon,
  AttachmentIcon,
  BackIcon,
  FolderIcon,
  InboxIcon,
  MailIcon,
  MoreIcon,
  ReplyIcon,
  SpamIcon,
  TrashIcon,
  UnsubscribeIcon,
} from '../components/icons'
import { Menu, MenuItem, MenuSeparator, useFeedback } from '../components/overlays'
import { ProjectPicker, TagPicker } from '../components/pickers'
import { Avatar, ErrorNote, IconButton, Loading } from '../components/ui'
import { keys, useBackend, useQuery } from '../data/store'
import { formatDay, formatListDate, formatTime, parseDate } from '../lib/dates'
import { useIsMobile, useShortcut } from '../lib/hooks'
import { tagLabel } from '../lib/tags'
import type { Attachment, Message, Thread } from '../lib/types'
import { errorText, useMailActions } from './actions'
import { ReplyComposer } from './Composer'
import { MessageBody } from './MessageBody'

interface ThreadViewProps {
  threadId: string
  onBack?: () => void
  /** Inside a project page: smaller header, and no "part of project" strip. */
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

function LoadedThread({ thread, onBack, embedded, onGone, markRead }: { thread: Thread } & Omit<ThreadViewProps, 'threadId'>) {
  const backend = useBackend()
  const actions = useMailActions()
  const mobile = useIsMobile()
  const [replying, setReplying] = useState(false)
  const me = backend.account.email.toLowerCase()
  const scroller = useRef<HTMLDivElement>(null)

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

  useShortcut('e', archive, !embedded)
  useShortcut('#', trash, !embedded)
  useShortcut('r', reply, !embedded)
  useShortcut('u', () => void actions.setRead(thread, false), !embedded)
  useShortcut('Escape', () => onBack?.(), !embedded && !!onBack)

  const tagTrigger = (
    <TagPicker
      value={thread.tag}
      onChange={(tag) => actions.setTag(thread, tag)}
      label="Tag this conversation"
      trigger={(props) => (
        <button type="button" {...props} data-tag={thread.tag ?? 'none'} className={`tag tag--button ${thread.tag ? '' : 'tag--empty'}`} title="Change tag">
          {thread.tag ? tagLabel(thread.tag) : '+ tag'}
        </button>
      )}
    />
  )

  const projectButton = (
    <ProjectPicker
      value={thread.projectId}
      onChange={(projectId, project) => actions.setProject(thread, projectId, project)}
      trigger={(props) => <IconButton {...props} icon={AddToProjectIcon} label={thread.projectId ? 'Change project' : 'Add to project'} size={24} />}
    />
  )

  const archiveLabel = thread.archived ? 'Move to inbox' : 'Archive'
  const secondary = (close: () => void) => (
    <>
      <MenuItem icon={MailIcon} onSelect={() => (actions.setRead(thread, false), close(), onBack?.())}>
        Mark as unread
      </MenuItem>
      {(mobile || embedded) && (
        <>
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

  return (
    <article className={`thread ${embedded ? 'thread--embedded' : ''}`} aria-label={thread.subject}>
      <header className="hero thread__hero">
        <div className="hero__title">
          {onBack && <IconButton icon={BackIcon} label="Back" size={24} onClick={onBack} className="hero__back" />}
          <h1 className="hero__heading">{thread.subject}</h1>
          {!mobile && tagTrigger}
        </div>
        <div className="hero__actions" role="toolbar" aria-label="Conversation actions">
          {!embedded && projectButton}
          {!embedded && <IconButton icon={thread.archived ? InboxIcon : ArchiveIcon} label={`${archiveLabel} (e)`} size={24} onClick={archive} />}
          {!embedded && !mobile && (
            <>
              <IconButton icon={TrashIcon} label="Move to trash (#)" size={24} onClick={trash} />
              <IconButton icon={SpamIcon} label={thread.spam ? 'Not spam' : 'Report spam'} size={24} onClick={spam} />
              <IconButton
                icon={UnsubscribeIcon}
                label={thread.canUnsubscribe ? 'Unsubscribe' : 'No unsubscribe link in this mail'}
                size={24}
                onClick={() => actions.unsubscribe(thread)}
                disabled={!thread.canUnsubscribe}
              />
            </>
          )}
          <Menu label="More actions" trigger={(props) => <IconButton {...props} icon={MoreIcon} label="More actions" size={24} />}>
            {secondary}
          </Menu>
        </div>
        {mobile && <div className="hero__tags">{tagTrigger}</div>}
      </header>

      <div className="thread__scroll" ref={scroller}>
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
        {!replying && (
          <div className="thread__reply">
            <button type="button" className="pill-button" onClick={reply} title="Reply (r)">
              <ReplyIcon size={24} />
              Reply
            </button>
          </div>
        )}
      </div>
    </article>
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
        <time className="message__date medium" dateTime={message.date} title={`${formatDay(date)} ${formatTime(date)}`}>
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
  if (!project) return null
  const now = Date.now()
  const next = events?.find((event) => parseDate(event.end).getTime() > now)
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
