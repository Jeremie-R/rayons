import { useMemo, useState } from 'react'
import { CheckIcon, SearchIcon } from '../components/icons'
import { Dialog, useFeedback } from '../components/overlays'
import { EmptyState, Loading, TagDot } from '../components/ui'
import { invalidate, keys, useBackend, useQuery } from '../data/store'
import { addDays, dateKey, formatDay, formatTime, parseDate, startOfDay } from '../lib/dates'
import type { CalendarEvent, Thread } from '../lib/types'
import { errorText } from './actions'

/** Pick events (two weeks back, three months ahead) that belong with a conversation. */
export function LinkEventDialog({ open, thread, onClose }: { open: boolean; thread: Thread; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Link events to this mail">
      {open && <Picker thread={thread} />}
    </Dialog>
  )
}

function Picker({ thread }: { thread: Thread }) {
  const backend = useBackend()
  const notify = useFeedback()
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const today = startOfDay(new Date())
  const from = dateKey(addDays(today, -14))
  const to = dateKey(addDays(today, 90))
  const { data: events } = useQuery(`${keys.events}${from}:${to}`, () => backend.listEvents(from, to))

  const list = useMemo(() => {
    const words = search.trim().toLowerCase()
    return (events ?? []).filter((event) => !words || `${event.title} ${event.location}`.toLowerCase().includes(words))
  }, [events, search])

  const toggle = async (event: CalendarEvent) => {
    const linked = event.threadId === thread.id
    setBusy(event.id)
    try {
      await backend.updateEvent(event.id, { threadId: linked ? null : thread.id })
      invalidate(keys.events, keys.projects)
      notify(linked ? `Unlinked ${event.title}` : `Linked ${event.title}`)
    } catch (error) {
      notify(errorText(error), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="link-events">
      <div className="search">
        <SearchIcon size={16} />
        <input className="search__input" autoFocus placeholder="search events" aria-label="Search events" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {!events ? (
        <Loading label="Loading events" />
      ) : list.length === 0 ? (
        <EmptyState title="No events found" />
      ) : (
        <ul className="link-events__list" role="list">
          {list.map((event) => {
            const start = parseDate(event.start)
            const linked = event.threadId === thread.id
            const elsewhere = !!event.threadId && !linked
            return (
              <li key={event.id}>
                <button type="button" className={`link-events__item ${linked ? 'is-linked' : ''}`} onClick={() => toggle(event)} disabled={busy === event.id} aria-pressed={linked}>
                  <span className="link-events__when">
                    {formatDay(start)}
                    {!event.allDay && <span className="muted"> · {formatTime(start)}</span>}
                  </span>
                  <span className="link-events__title">
                    {event.tag && <TagDot tag={event.tag} />}
                    {event.title}
                    {elsewhere && <span className="muted link-events__note"> · linked to another mail</span>}
                  </span>
                  {linked && <CheckIcon size={16} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
