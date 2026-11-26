import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ComposeIcon, FilterIcon, InboxIcon, SearchIcon } from '../components/icons'
import { Menu, MenuItem } from '../components/overlays'
import { Illustration } from '../components/Illustration'
import { Button, EmptyState, ErrorNote, IconButton, Loading, TagChip } from '../components/ui'
import { ResizeHandle, useListWidth } from '../components/ResizeHandle'
import { keys, prefetch, useBackend, useQuery } from '../data/store'
import { useIsMobile } from '../lib/hooks'
import { useShortcut } from '../lib/shortcuts'
import { TAGS, type MailBox, type TagId, type ThreadQuery } from '../lib/types'
import { useCompose } from '../mail/Composer'
import { useMailActions } from '../mail/actions'
import { inboxOrder, ThreadList } from '../mail/ThreadList'
import { ThreadView } from '../mail/ThreadView'

type Filter = 'unread' | 'attachments' | 'loose' | 'in-project'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'unread', label: 'Unread only' },
  { value: 'attachments', label: 'With attachments' },
  { value: 'in-project', label: 'In a project' },
  { value: 'loose', label: 'Not in a project' },
]
const TITLES: Record<MailBox, string> = { inbox: 'Inbox', archived: 'Archived', spam: 'Spam', sent: 'Sent' }

export function InboxScreen() {
  const backend = useBackend()
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const { threadId } = useParams()
  const [params, setParams] = useSearchParams()
  const compose = useCompose()

  const box = (['archived', 'spam', 'sent'].includes(params.get('box') ?? '') ? params.get('box') : 'inbox') as MailBox
  const tag = (TAGS as readonly string[]).includes(params.get('tag') ?? '') ? (params.get('tag') as TagId) : 'all'
  const filter = params.get('filter') as Filter | null
  const search = params.get('q') ?? ''
  const [searchDraft, setSearchDraft] = useState(search)

  useEffect(() => {
    if (searchDraft === search) return
    const timer = setTimeout(() => setParam('q', searchDraft.trim() || null), 300)
    return () => clearTimeout(timer)
  }, [searchDraft])

  const query: ThreadQuery = { box, tag, search }
  const { data, error, reload } = useQuery(`${keys.threads}${JSON.stringify(query)}`, () => backend.listThreads(query))
  const { data: projects } = useQuery(keys.projects, () => backend.listProjects())

  // Unread threads opened during this visit keep their place in the list (see inboxOrder).
  const readNow = useRef(new Set<string>())
  const listKey = `${box}:${tag}:${filter}:${search}`
  const lastListKey = useRef(listKey)
  if (lastListKey.current !== listKey) {
    lastListKey.current = listKey
    readNow.current = new Set()
  }
  const opened = data?.find((t) => t.id === threadId)
  if (opened?.unread) readNow.current.add(opened.id)

  const threads = useMemo(() => {
    let list = data ?? []
    if (filter === 'unread') list = list.filter((t) => t.unread)
    if (filter === 'attachments') list = list.filter((t) => t.hasAttachments)
    if (filter === 'loose') list = list.filter((t) => !t.projectId)
    if (filter === 'in-project') list = list.filter((t) => t.projectId)
    return box === 'inbox' ? inboxOrder(list, readNow.current) : list
  }, [data, filter, box])

  function setParam(name: string, value: string | null) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === null) next.delete(name)
        else next.set(name, value)
        return next
      },
      { replace: true },
    )
  }

  const listUrl = `/inbox${params.size ? `?${params}` : ''}`
  const openThread = (id: string) => navigate(`/inbox/${id}${params.size ? `?${params}` : ''}`)
  // The list as it was while the open conversation was in it (archiving removes it at once).
  const listWithOpen = useRef<typeof threads>([])
  if (threadId && threads.some((t) => t.id === threadId)) listWithOpen.current = threads
  const afterGone = () => {
    const list = listWithOpen.current
    const index = list.findIndex((t) => t.id === threadId)
    const next = list[index + 1] ?? list[index - 1]
    if (!mobile && next && next.id !== threadId) openThread(next.id)
    else navigate(listUrl)
  }

  const [listWidth, setListWidth] = useListWidth()
  const actions = useMailActions()
  const searchInput = useRef<HTMLInputElement>(null)
  const load = (id: string) => prefetch(keys.thread(id), () => backend.getThread(id))

  // Gmail's keys: j/k move through conversations, / searches, c composes.
  const step = (direction: 1 | -1) => {
    if (threads.length === 0) return
    const index = threads.findIndex((t) => t.id === threadId)
    const next = threads[index < 0 ? 0 : Math.max(0, Math.min(threads.length - 1, index + direction))]
    if (next && next.id !== threadId) openThread(next.id)
  }
  useShortcut('c', () => compose.open())
  useShortcut('j', () => step(1))
  useShortcut('k', () => step(-1))
  useShortcut('/', () => searchInput.current?.focus())

  // The conversations either side of the open one load in the background.
  useEffect(() => {
    if (!threadId) return
    const index = threads.findIndex((t) => t.id === threadId)
    for (const neighbour of [threads[index + 1], threads[index - 1]]) if (neighbour) load(neighbour.id)
  }, [threadId, threads])

  const unread = (data ?? []).filter((t) => t.unread).length
  const showList = !mobile || !threadId
  const showDetail = !mobile || !!threadId

  return (
    <div className="split" style={{ '--list': `${listWidth}px` } as CSSProperties}>
      {showList && (
        <section className="list-pane" aria-label={TITLES[box]}>
          <header className="list-pane__header">
            <div className="list-pane__title">
              <h1>{TITLES[box]}</h1>
              <IconButton icon={ComposeIcon} label="New message" shortcut="c" variant="round" onClick={() => compose.open()} />
            </div>
            <div className="search">
              <SearchIcon size={16} />
              <input
                ref={searchInput}
                data-tooltip="Search mail"
                data-keys="/"
                type="search"
                className="search__input"
                placeholder="search"
                aria-label="Search mail"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
              />
              <span className="search__divider" />
              <Menu
                label="Filter"
                trigger={(props) => <IconButton {...props} icon={FilterIcon} label="Filter" active={!!filter} className="search__filter" />}
              >
                {(close) => (
                  <>
                    {FILTERS.map((option) => (
                      <MenuItem
                        key={option.value}
                        checked={filter === option.value}
                        onSelect={() => {
                          setParam('filter', filter === option.value ? null : option.value)
                          close()
                        }}
                      >
                        {option.label}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Menu>
            </div>
            <div className="tag-bar" role="group" aria-label="Show tag">
              <button type="button" className={`tag tag--all tag--button ${tag === 'all' ? 'is-active' : ''}`} aria-pressed={tag === 'all'} onClick={() => setParam('tag', null)}>
                all
              </button>
              {TAGS.map((t) => (
                <TagChip key={t} tag={t} active={tag === t} onClick={() => setParam('tag', tag === t ? null : t)} />
              ))}
            </div>
          </header>

          <div className="list-pane__body">
            {!!error && !!data && (
              <div className="stale-note" role="status">
                <span>Couldn’t refresh: {error instanceof Error ? error.message : 'something went wrong'}</span>
                <button type="button" onClick={reload}>
                  Retry
                </button>
              </div>
            )}
            {error && !data ? (
              <ErrorNote error={error} onRetry={reload} />
            ) : !data ? (
              <Loading label="Loading mail" />
            ) : threads.length === 0 ? (
              <EmptyState title={search ? 'Nothing matches' : box === 'inbox' ? 'All clear' : `Nothing in ${TITLES[box].toLowerCase()}`} icon={InboxIcon} art={!search && box === 'inbox' ? 'clear' : undefined}>
                {search ? 'Try other words, or another tag.' : box === 'inbox' && tag !== 'all' ? `No ${tag} mail in your inbox.` : null}
              </EmptyState>
            ) : (
              <ThreadList threads={threads} selectedId={threadId} onOpen={(t) => openThread(t.id)} projects={projects}
                onHover={(t) => load(t.id)}
                showRecipients={box === 'sent'}
                onSwipe={box === 'spam' ? undefined : (t) => void actions.toggleArchived(t).then((ok) => ok && t.id === threadId && navigate(listUrl))}
                onArchive={box === 'spam' || box === 'sent' ? undefined : (t) => void actions.toggleArchived(t).then((ok) => ok && t.id === threadId && navigate(listUrl))}
              />
            )}
            <div className="list-pane__footer">
              {box === 'inbox' ? (
                <>
                  <Button onClick={() => setParam('box', 'archived')}>show archived</Button>
                  <Button onClick={() => setParam('box', 'sent')}>sent</Button>
                  <Button onClick={() => setParam('box', 'spam')}>inspect spam</Button>
                </>
              ) : (
                <Button onClick={() => setParam('box', null)}>back to inbox</Button>
              )}
            </div>
            <Illustration kind="sidebar" className="list-art" />
          </div>
        </section>
      )}

      {showList && showDetail && <ResizeHandle width={listWidth} onChange={setListWidth} />}

      {showDetail && (
        <section className="detail-pane" aria-label="Conversation">
          {threadId ? (
            <ThreadView threadId={threadId} onBack={() => navigate(listUrl)} onGone={afterGone} />
          ) : (
            <EmptyState title={unread ? `${unread} unread in ${tag === 'all' ? TITLES[box].toLowerCase() : tag}` : 'No conversation selected'} icon={InboxIcon} art="inbox">
              Pick a conversation on the left, or press <kbd>j</kbd>. <kbd>?</kbd> shows every shortcut.
            </EmptyState>
          )}
        </section>
      )}

    </div>
  )
}
