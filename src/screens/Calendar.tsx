import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { EventDialog, newDraft, type EventEditing } from '../calendar/EventDialog'
import { MonthGrid, Schedule, TimeGrid, YearGrid } from '../calendar/views'
import { AddEventIcon, CloseIcon, FilterIcon, NextIcon, PrevIcon, SearchIcon, SettingsIcon } from '../components/icons'
import { Menu, MenuHeading, MenuItem, MenuSeparator } from '../components/overlays'
import { ErrorNote, IconButton, Segmented, TagDot } from '../components/ui'
import { keys, useBackend, useQuery } from '../data/store'
import { addDays, addMonths, dateKey, formatDay, formatMonth, formatMonthYear, parseDate, startOfDay, startOfMonth, startOfWeek } from '../lib/dates'
import { useIsMobile, useShortcut } from '../lib/hooks'
import { TAG_INFO } from '../lib/tags'
import { TAGS, type TagId } from '../lib/types'

type View = 'schedule' | 'day' | 'week' | 'month' | 'year'
const DESKTOP_VIEWS: View[] = ['schedule', 'day', 'week', 'month', 'year']
const MOBILE_VIEWS: View[] = ['schedule', 'day', 'month']
const HIDDEN_CALENDARS_KEY = 'rayons:hidden-calendars'

function readHidden(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_CALENDARS_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function CalendarScreen() {
  const backend = useBackend()
  const mobile = useIsMobile()
  const [params, setParams] = useSearchParams()
  const views = mobile ? MOBILE_VIEWS : DESKTOP_VIEWS
  const requested = params.get('view') as View | null
  const view: View = requested && views.includes(requested) ? requested : mobile ? 'day' : 'week'
  const cursor = params.get('date') ? parseDate(params.get('date')!) : startOfDay(new Date())
  const [scheduleDays, setScheduleDays] = useState(30)
  const [editing, setEditing] = useState<EventEditing | null>(null)
  const [tagFilter, setTagFilter] = useState<Set<TagId | 'none'>>(new Set())
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')
  const [hidden, setHidden] = useState<string[]>(readHidden)

  const go = (next: { view?: View; date?: Date }) =>
    setParams(
      (current) => {
        const p = new URLSearchParams(current)
        if (next.view) p.set('view', next.view)
        if (next.date) p.set('date', dateKey(next.date))
        return p
      },
      { replace: true },
    )

  const range = useMemo(() => {
    switch (view) {
      case 'day':
        return { from: cursor, to: addDays(cursor, 1), days: [cursor] }
      case 'week': {
        const from = startOfWeek(cursor)
        return { from, to: addDays(from, 7), days: Array.from({ length: 7 }, (_, i) => addDays(from, i)) }
      }
      case 'month': {
        const from = startOfWeek(startOfMonth(cursor))
        return { from, to: addDays(from, 42), days: [] }
      }
      case 'year':
        return { from: new Date(cursor.getFullYear(), 0, 1), to: new Date(cursor.getFullYear() + 1, 0, 1), days: [] }
      default:
        return { from: cursor, to: addDays(cursor, scheduleDays), days: [] }
    }
  }, [view, dateKey(cursor), scheduleDays])

  const from = dateKey(range.from)
  const to = dateKey(range.to)
  const { data, error, reload } = useQuery(`${keys.events}${from}:${to}`, () => backend.listEvents(from, to))
  const { data: calendars } = useQuery(keys.calendars, () => backend.listCalendars())
  const { data: projects } = useQuery(keys.projects, () => backend.listProjects())

  const events = useMemo(() => {
    const words = search.trim().toLowerCase()
    return (data ?? []).filter(
      (event) =>
        !hidden.includes(event.calendarId) &&
        (tagFilter.size === 0 || tagFilter.has(event.tag ?? 'none')) &&
        (!words || `${event.title} ${event.location} ${event.description}`.toLowerCase().includes(words)),
    )
  }, [data, hidden, tagFilter, search])

  const step = (direction: 1 | -1) => {
    if (view === 'day') go({ date: addDays(cursor, direction) })
    else if (view === 'week') go({ date: addDays(cursor, 7 * direction) })
    else if (view === 'month') go({ date: addMonths(cursor, direction) })
    else if (view === 'year') go({ date: new Date(cursor.getFullYear() + direction, 0, 1) })
    else go({ date: addDays(cursor, 30 * direction) })
  }
  const today = () => go({ date: startOfDay(new Date()) })
  const openDay = (day: Date) => go({ view: 'day', date: day })
  const create = (at: Date, allDay?: boolean) => setEditing({ mode: 'create', draft: newDraft(at, { allDay }) })

  useShortcut('t', today)
  useShortcut('ArrowLeft', () => step(-1))
  useShortcut('ArrowRight', () => step(1))
  useShortcut('n', () => {
    const at = new Date()
    at.setMinutes(0, 0, 0)
    at.setHours(at.getHours() + 1)
    create(at)
  })

  const label = (() => {
    if (view === 'day') return formatDay(cursor)
    if (view === 'week') {
      const start = startOfWeek(cursor)
      const end = addDays(start, 6)
      return start.getMonth() === end.getMonth()
        ? `${formatMonthYear(start).split(' ')[0]} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`
        : `${formatDay(start).replace(/, \d{4}$/, '')} – ${formatDay(end)}`
    }
    if (view === 'month') return formatMonthYear(cursor)
    if (view === 'year') return String(cursor.getFullYear())
    return `From ${formatDay(cursor)}`
  })()

  const now = new Date()
  const createNow = () => {
    const at = new Date(cursor)
    at.setHours(Math.max(9, new Date().getHours() + 1), 0, 0, 0)
    create(at)
  }
  const addButton = <IconButton icon={AddEventIcon} label="New event (n)" variant="round" onClick={createNow} />
  const toggleTag = (tag: TagId | 'none') =>
    setTagFilter((set) => {
      const next = new Set(set)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })

  return (
    <div className="calendar">
      <header className="calendar__header">
        <div className="calendar__title">
          <h1>Calendar</h1>
          <button type="button" className="today-badge" onClick={today} title="Go to today (t)" aria-label="Go to today">
            <span className="today-badge__month">{formatMonth(now)}</span>
            <span className="today-badge__day">{now.getDate()}</span>
          </button>
          <div className="calendar__nav">
            <IconButton icon={PrevIcon} label="Previous" size={20} onClick={() => step(-1)} />
            <IconButton icon={NextIcon} label="Next" size={20} onClick={() => step(1)} />
            <span className="calendar__range">{label}</span>
            {mobile && addButton}
          </div>
        </div>
        <div className="calendar__tools">
          <Segmented label="View" options={views.map((v) => ({ value: v, label: v }))} value={view} onChange={(v) => go({ view: v })} />
          {searching ? (
            <div className="search search--inline">
              <SearchIcon size={16} />
              <input className="search__input" autoFocus placeholder="search events" aria-label="Search events" value={search} onChange={(e) => setSearch(e.target.value)} />
              <IconButton
                icon={CloseIcon}
                label="Close search"
                onClick={() => {
                  setSearch('')
                  setSearching(false)
                }}
              />
            </div>
          ) : (
            <IconButton icon={SearchIcon} label="Search events" onClick={() => setSearching(true)} />
          )}
          <Menu label="Show tags" trigger={(props) => <IconButton {...props} icon={FilterIcon} label="Filter by tag" active={tagFilter.size > 0} />}>
            {() => (
              <>
                <MenuHeading>Show only</MenuHeading>
                {[...TAGS, 'none' as const].map((tag) => (
                  <MenuItem key={tag} checked={tagFilter.has(tag)} onSelect={() => toggleTag(tag)}>
                    <span className="menu__tag">
                      <TagDot tag={tag === 'none' ? null : tag} title="" />
                      {tag === 'none' ? 'no tag' : TAG_INFO[tag].label}
                    </span>
                  </MenuItem>
                ))}
                {tagFilter.size > 0 && (
                  <>
                    <MenuSeparator />
                    <MenuItem onSelect={() => setTagFilter(new Set())}>Show everything</MenuItem>
                  </>
                )}
              </>
            )}
          </Menu>
          <Menu label="Calendars" trigger={(props) => <IconButton {...props} icon={SettingsIcon} label="Calendars" active={hidden.length > 0} />}>
            {() => (
              <>
                <MenuHeading>Calendars shown</MenuHeading>
                {(calendars ?? []).map((calendar) => (
                  <MenuItem
                    key={calendar.id}
                    checked={!hidden.includes(calendar.id)}
                    onSelect={() => {
                      const next = hidden.includes(calendar.id) ? hidden.filter((id) => id !== calendar.id) : [...hidden, calendar.id]
                      setHidden(next)
                      try {
                        localStorage.setItem(HIDDEN_CALENDARS_KEY, JSON.stringify(next))
                      } catch {
                        // Remembered for this visit only.
                      }
                    }}
                  >
                    <span className="menu__tag">
                      <span className="calendar-swatch" style={{ background: calendar.color }} />
                      {calendar.name}
                    </span>
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
          {!mobile && addButton}
        </div>
      </header>

      <div className="calendar__body">
        {!!error && !data && <ErrorNote error={error} onRetry={reload} />}
        {(view === 'week' || view === 'day') && <TimeGrid days={range.days} events={events} onOpen={(event) => setEditing({ mode: 'edit', event })} onCreate={create} />}
        {view === 'month' && <MonthGrid cursor={cursor} events={events} onOpen={(event) => setEditing({ mode: 'edit', event })} onCreate={create} onDay={openDay} />}
        {view === 'year' && <YearGrid cursor={cursor} events={events} onDay={openDay} />}
        {view === 'schedule' && (
          <Schedule from={cursor} days={scheduleDays} events={events} projects={projects ?? []} onOpen={(event) => setEditing({ mode: 'edit', event })} onMore={() => setScheduleDays((d) => d + 30)} />
        )}
      </div>

      <EventDialog editing={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
