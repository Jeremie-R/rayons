import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ComposeIcon, FilterIcon, InboxIcon, SearchIcon } from '../components/icons'
import { Menu, MenuItem } from '../components/overlays'
import { Button, EmptyState, ErrorNote, IconButton, Loading, TagChip } from '../components/ui'
import { keys, useBackend, useQuery } from '../data/store'
import { useIsMobile, useShortcut } from '../lib/hooks'
import { TAGS, type MailBox, type TagId, type ThreadQuery } from '../lib/types'
import { ComposeDialog } from '../mail/Composer'
import { inboxOrder, ThreadList } from '../mail/ThreadList'
import { ThreadView } from '../mail/ThreadView'

type Filter = 'unread' | 'attachments' | 'loose' | 'in-project'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'unread', label: 'Unread only' },
  { value: 'attachments', label: 'With attachments' },
  { value: 'in-project', label: 'In a project' },
  { value: 'loose', label: 'Not in a project' },
]
const TITLES: Record<MailBox, string> = { inbox: 'Inbox', archived: 'Archived', spam: 'Spam' }

export function InboxScreen() {
  const backend = useBackend()
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const { threadId } = useParams()
  const [params, setParams] = useSearchParams()
  const [composing, setComposing] = useState(false)

  const box = (['archived', 'spam'].includes(params.get('box') ?? '') ? params.get('box') : 'inbox') as MailBox
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
  const afterGone = () => {
    const index = threads.findIndex((t) => t.id === threadId)
    const next = threads[index + 1] ?? threads[index - 1]
    if (!mobile && next && next.id !== threadId) openThread(next.id)
    else navigate(listUrl)
  }

  useShortcut('c', () => setComposing(true))

  const unread = (data ?? []).filter((t) => t.unread).length
  const showList = !mobile || !threadId
  const showDetail = !mobile || !!threadId

  return (
    <div className="split">
      {showList && (
        <section className="list-pane" aria-label={TITLES[box]}>
          <header className="list-pane__header">
            <div className="list-pane__title">
              <h1>{TITLES[box]}</h1>
              <IconButton icon={ComposeIcon} label="New message (c)" variant="round" onClick={() => setComposing(true)} />
            </div>
            <div className="search">
              <SearchIcon size={16} />
              <input
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
            {error && !data ? (
              <ErrorNote error={error} onRetry={reload} />
            ) : !data ? (
              <Loading label="Loading mail" />
            ) : threads.length === 0 ? (
              <EmptyState title={search ? 'Nothing matches' : box === 'inbox' ? 'All clear' : `Nothing in ${TITLES[box].toLowerCase()}`} icon={InboxIcon}>
                {search ? 'Try other words, or another tag.' : box === 'inbox' && tag !== 'all' ? `No ${tag} mail in your inbox.` : null}
              </EmptyState>
            ) : (
              <ThreadList threads={threads} selectedId={threadId} onOpen={(t) => openThread(t.id)} projects={projects} />
            )}
            <div className="list-pane__footer">
              {box === 'inbox' ? (
                <>
                  <Button onClick={() => setParam('box', 'archived')}>show archived</Button>
                  <Button onClick={() => setParam('box', 'spam')}>inspect spam</Button>
                </>
              ) : (
                <Button onClick={() => setParam('box', null)}>back to inbox</Button>
              )}
            </div>
          </div>
        </section>
      )}

      {showDetail && (
        <section className="detail-pane" aria-label="Conversation">
          {threadId ? (
            <ThreadView threadId={threadId} onBack={() => navigate(listUrl)} onGone={afterGone} />
          ) : (
            <EmptyState title={unread ? `${unread} unread in ${tag === 'all' ? TITLES[box].toLowerCase() : tag}` : 'No conversation selected'} icon={InboxIcon}>
              Pick a conversation on the left. Shortcuts: <kbd>c</kbd> compose, <kbd>r</kbd> reply, <kbd>e</kbd> archive.
            </EmptyState>
          )}
        </section>
      )}

      <ComposeDialog open={composing} onClose={() => setComposing(false)} />
    </div>
  )
}
