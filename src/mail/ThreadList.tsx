import { AttachmentIcon, FolderIcon } from '../components/icons'
import { TagDot } from '../components/ui'
import { formatListDate } from '../lib/dates'
import type { Project, ThreadSummary } from '../lib/types'

interface ThreadListProps {
  threads: ThreadSummary[]
  selectedId?: string
  onOpen: (thread: ThreadSummary) => void
  /** `full` is the inbox list. `compact` is the narrower list inside a project. */
  variant?: 'full' | 'compact'
  projects?: Project[]
  /** Called when the pointer rests on a row, to load it ahead of a click. */
  onHover?: (thread: ThreadSummary) => void
  /** Sent mail: show who it went to rather than who wrote last. */
  showRecipients?: boolean
}

export function ThreadList({ threads, selectedId, onOpen, variant = 'full', projects, onHover, showRecipients }: ThreadListProps) {
  let hoverTimer: number | undefined
  const projectName = (id: string | null) => (id ? projects?.find((p) => p.id === id)?.name : undefined)
  return (
    <ul className={`thread-list thread-list--${variant}`} role="list">
      {threads.map((thread) => {
        const project = variant === 'full' ? projectName(thread.projectId) : undefined
        return (
          <li key={thread.id}>
            <button
              type="button"
              className={`thread-row ${thread.unread ? 'is-unread' : ''} ${thread.id === selectedId ? 'is-selected' : ''}`}
              aria-current={thread.id === selectedId ? 'true' : undefined}
              onClick={() => onOpen(thread)}
              onPointerEnter={onHover ? () => (hoverTimer = window.setTimeout(() => onHover(thread), 120)) : undefined}
              onPointerLeave={onHover ? () => window.clearTimeout(hoverTimer) : undefined}
            >
              <span className="thread-row__top">
                <span className="thread-row__from">
                  {showRecipients ? `To: ${(thread.to ?? []).map((p) => p.name || p.email).join(', ') || '(no one)'}` : thread.from.name || thread.from.email}
                  {thread.messageCount > 1 && <span className="thread-row__count">{thread.messageCount}</span>}
                </span>
                {thread.tag && <TagDot tag={thread.tag} />}
                <span className="thread-row__date">{formatListDate(thread.date)}</span>
              </span>
              {variant === 'full' ? (
                <span className="thread-row__text">
                  <span className="thread-row__subject">{thread.subject}</span>
                  {thread.snippet && <> — {thread.snippet}</>}
                </span>
              ) : (
                <span className="thread-row__text thread-row__text--single">{thread.subject}</span>
              )}
              {(project || (variant === 'full' && thread.hasAttachments)) && (
                <span className="thread-row__meta">
                  {project && (
                    <span className="thread-row__project">
                      <FolderIcon size={12} />
                      {project}
                    </span>
                  )}
                  {variant === 'full' && thread.hasAttachments && (
                    <span className="thread-row__clip" aria-label="Has attachments" role="img">
                      <AttachmentIcon size={12} />
                    </span>
                  )}
                </span>
              )}
              {thread.unread && <span className="visually-hidden">Unread</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Unread first, then read, each newest first: the order the inbox reads in. Threads read during
 * this visit (`readNow`) keep their place, so a row doesn't jump away when you open it.
 */
export function inboxOrder(threads: ThreadSummary[], readNow: ReadonlySet<string> = new Set()) {
  const first = (t: ThreadSummary) => t.unread || readNow.has(t.id)
  return [...threads.filter(first), ...threads.filter((t) => !first(t))]
}
