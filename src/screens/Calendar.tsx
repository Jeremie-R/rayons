import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { EventDialog, newDraft, type EventEditing } from '../calendar/EventDialog'
import { MonthGrid, Schedule, TimeGrid, YearGrid } from '../calendar/views'
import { AddEventIcon, CloseIcon, FilterIcon, FolderIcon, NextIcon, PrevIcon, SearchIcon, SettingsIcon } from '../components/icons'
import { Menu, MenuHeading, MenuItem, MenuSeparator } from '../components/overlays'
import { ErrorNote, IconButton, Segmented, TagDot } from '../components/ui'
import { keys, prefetch, useBackend, useQuery } from '../data/store'
import { addDays, addMonths, dateKey, formatDay, formatMonth, formatMonthYear, parseDate, startOfDay, startOfMonth, startOfWeek } from '../lib/dates'
import { useIsMobile, useShortcut } from '../lib/hooks'
import { TAG_INFO } from '../lib/tags'
import { TAGS, type CalendarEvent, type TagId } from '../lib/types'

type View = 'schedule' | 'day' | 'week' | 'month' | 'year'
const DESKTOP_VIEWS: View[] = ['schedule', 'day', 'week', 'month', 'year']
const MOBILE_VIEWS: View[] = ['schedule', 'day', 'week', 'month']
const HIDDEN_CALENDARS_KEY = 'rayons:hidden-calendars'

function readHidden(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_CALENDARS_KEY) ?? '[]')
  } catch {
    return []
  }
}

/** The date one period before or after, for the arrows, j/k and swipes. */
function stepFrom(view: View, cursor: Date, direction: 1 | -1) {
  if (view === 'day') return addDays(cursor, direction)
  if (view === 'week') return addDays(cursor, 7 * direction)
  if (view === 'month') return addMonths(cursor, direction)
  if (view === 'year') return new Date(cursor.getFullYear() + direction, 0, 1)
  return addDays(cursor, 30 * direction)
}

/**
 * What a view loads and shows. The day view loads its whole week (and a day either side), so
 * moving a day stays on data already here; on a phone it shows the day before and after too,
 * for swiping.
 */
function rangeFor(view: View, cursor: Date, scheduleDays: number, mobile: boolean): { from: Date; to: Date; days: Date[] } {
  switch (view) {
    case 'day': {
      const week = startOfWeek(cursor)
      return { from: addDays(week, -1), to: addDays(week, 8), days: mobile ? [addDays(cursor, -1), cursor, addDays(cursor, 1)] : [cursor] }
    }
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
  const [editing, setEditingState] = useState<EventEditing | null>(null)
  // While the open editor has unsaved changes, clicks on other events don't replace it.
  const dirty = useRef(false)
  const setEditing = (next: EventEditing | null) => {
    if (next && dirty.current) return
    dirty.current = false
    setEditingState(next)
  }
  const closeEditor = useCallback(() => {
    dirty.current = false
    setEditingState(null)
  }, [])
  const [tagFilter, setTagFilter] = useState<Set<TagId | 'none'>>(new Set())
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set())
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

  const range = useMemo(() => rangeFor(view, cursor, scheduleDays, mobile), [view, dateKey(cursor), scheduleDays, mobile])

  const from = dateKey(range.from)
  const to = dateKey(range.to)
  const { data, error, reload } = useQuery(`${keys.events}${from}:${to}`, () => backend.listEvents(from, to))

  // The periods either side load in the background, so moving to them doesn't wait.
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const direction of [1, -1] as const) {
        const next = rangeFor(view, stepFrom(view, cursor, direction), scheduleDays, mobile)
        const [a, b] = [dateKey(next.from), dateKey(next.to)]
        prefetch(`${keys.events}${a}:${b}`, () => backend.listEvents(a, b))
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [view, dateKey(cursor), scheduleDays, mobile, backend])
  const { data: calendars } = useQuery(keys.calendars, () => backend.listCalendars())
  const { data: projects } = useQuery(keys.projects, () => backend.listProjects())
  const activeProjects = (projects ?? []).filter((p) => p.status === 'active').sort((a, b) => a.name.localeCompare(b.name))

  const events = useMemo(() => {
    const words = search.trim().toLowerCase()
    return (data ?? []).filter(
      (event) =>
        !hidden.includes(event.calendarId) &&
        (tagFilter.size === 0 || tagFilter.has(event.tag ?? 'none')) &&
        (projectFilter.size === 0 || (!!event.projectId && projectFilter.has(event.projectId))) &&
        (!words || `${event.title} ${event.location} ${event.description}`.toLowerCase().includes(words)),
    )
  }, [data, hidden, tagFilter, projectFilter, search])
  const filtering = tagFilter.size > 0 || projectFilter.size > 0
  const toggleProject = (id: string) =>
    setProjectFilter((set) => {
      const next = new Set(set)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const step = (direction: 1 | -1) => go({ date: stepFrom(view, cursor, direction) })
  const today = () => go({ date: startOfDay(new Date()) })
  const openDay = (day: Date) => go({ view: 'day', date: day })
  const create = (at: Date, allDay = false, anchor?: DOMRect, end?: Date) => setEditing({ mode: 'create', draft: newDraft(at, { allDay, end }), anchor })
  const open = (event: CalendarEvent, anchor?: DOMRect) => setEditing({ mode: 'edit', event, anchor })

  // Google Calendar's keys.
  useShortcut('t', today)
  useShortcut('j', () => step(1))
  useShortcut('k', () => step(-1))
  useShortcut('ArrowRight', () => step(1))
  useShortcut('ArrowLeft', () => step(-1))
  useShortcut('a', () => go({ view: 'schedule' }))
  useShortcut('d', () => go({ view: 'day' }))
  useShortcut('w', () => go({ view: 'week' }))
  useShortcut('m', () => go({ view: 'month' }))
  useShortcut('y', () => go({ view: 'year' }), !mobile)
  useShortcut('/', () => setSearching(true))

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
  // Phones: no year on days and weeks, to fit beside the buttons.
  const shownLabel = (() => {
    if (!mobile || view === 'month') return label
    if (view === 'week') {
      const start = startOfWeek(cursor)
      const end = addDays(start, 6)
      const short = (d: Date) => formatDay(d).replace(/, \d{4}$/, '')
      return start.getMonth() === end.getMonth() ? `${short(start)}–${end.getDate()}` : `${short(start)} – ${short(end)}`
    }
    return label.replace(/,? \d{4}$/, '')
  })()

  const now = new Date()
  const createNow = () => {
    const at = new Date(cursor)
    at.setHours(Math.max(9, new Date().getHours() + 1), 0, 0, 0)
    create(at)
  }
  // /calendar?new=1 (from the command bar) opens a new event.
  useEffect(() => {
    if (params.get('new') !== '1') return
    createNow()
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('new')
        return next
      },
      { replace: true },
    )
  }, [params])
  const addButton = <IconButton icon={AddEventIcon} label="New event" shortcut="c" variant="round" onClick={createNow} />
  const todayBadge = (
    <button type="button" className="today-badge" onClick={today} data-tooltip="Today" data-keys="t" aria-label="Go to today">
      <span className="today-badge__month">{formatMonth(now)}</span>
      <span className="today-badge__day">{now.getDate()}</span>
    </button>
  )
  const viewSwitch = <Segmented label="View" options={views.map((v) => ({ value: v, label: v }))} value={view} onChange={(v) => go({ view: v })} />
  const toolButtons = (
    <>
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
        <IconButton icon={SearchIcon} label="Search events" shortcut="/" onClick={() => setSearching(true)} />
      )}
      <Menu label="Filter" trigger={(props) => <IconButton {...props} icon={FilterIcon} label="Filter by tag or project" active={filtering} />}>
        {() => (
          <>
            <MenuHeading>Tags</MenuHeading>
            {[...TAGS, 'none' as const].map((tag) => (
              <MenuItem key={tag} checked={tagFilter.has(tag)} onSelect={() => toggleTag(tag)}>
                <span className="menu__tag">
                  <TagDot tag={tag === 'none' ? null : tag} title="" />
                  {tag === 'none' ? 'no tag' : TAG_INFO[tag].label}
                </span>
              </MenuItem>
            ))}
            {activeProjects.length > 0 && (
              <>
                <MenuSeparator />
                <MenuHeading>Projects</MenuHeading>
                {activeProjects.map((project) => (
                  <MenuItem key={project.id} icon={FolderIcon} checked={projectFilter.has(project.id)} onSelect={() => toggleProject(project.id)}>
                    {project.name}
                  </MenuItem>
                ))}
              </>
            )}
            {filtering && (
              <>
                <MenuSeparator />
                <MenuItem
                  onSelect={() => {
                    setTagFilter(new Set())
                    setProjectFilter(new Set())
                  }}
                >
                  Show everything
                </MenuItem>
              </>
            )}
          </>
        )}
      </Menu>
      <Menu label="Calendars" trigger={(props) => <IconButton {...props} icon={SettingsIcon} label="Calendars" />}>
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
    </>
  )

  useShortcut('c', createNow)
  const toggleTag = (tag: TagId | 'none') =>
    setTagFilter((set) => {
      const next = new Set(set)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })

  return (
    <div className="calendar">
      <header className={`calendar__header ${mobile ? 'calendar__header--phone' : ''}`}>
        {mobile ? (
          <>
            {/* Phones: date and tools on top, the views with the arrows either side below. */}
            <div className="calendar__title">
              {todayBadge}
              <span className="calendar__range">{shownLabel}</span>
              <div className="calendar__actions">
                {toolButtons}
                {addButton}
              </div>
            </div>
            <div className="calendar__tools">
              <IconButton icon={PrevIcon} label="Previous" size={20} onClick={() => step(-1)} />
              {viewSwitch}
              <IconButton icon={NextIcon} label="Next" size={20} onClick={() => step(1)} />
            </div>
          </>
        ) : (
          <>
            <div className="calendar__title">
              <h1>Calendar</h1>
              {todayBadge}
              <div className="calendar__nav">
                <IconButton icon={PrevIcon} label="Previous" shortcut="k" size={20} onClick={() => step(-1)} />
                <IconButton icon={NextIcon} label="Next" shortcut="j" size={20} onClick={() => step(1)} />
                <span className="calendar__range">{label}</span>
              </div>
            </div>
            <div className="calendar__tools">
              {viewSwitch}
              {toolButtons}
              {addButton}
            </div>
          </>
        )}
      </header>

      <div className="calendar__body">
        {!!error && !data && <ErrorNote error={error} onRetry={reload} />}
        {(view === 'week' || view === 'day') && (
          <TimeGrid
            key={view}
            days={range.days}
            events={events}
            onOpen={open}
            onCreate={create}
            ghost={editing?.mode === 'create' ? editing.draft : null}
            onStep={mobile && view === 'day' ? step : undefined}
          />
        )}
        {view === 'month' && <MonthGrid cursor={cursor} events={events} onOpen={open} onCreate={create} onDay={openDay} />}
        {view === 'year' && <YearGrid cursor={cursor} events={events} onDay={openDay} />}
        {view === 'schedule' && (
          <Schedule from={cursor} days={scheduleDays} events={events} projects={projects ?? []} onOpen={open} onMore={() => setScheduleDays((d) => d + 30)} />
        )}
      </div>

      <EventDialog editing={editing} onClose={closeEditor} onDirtyChange={(value) => (dirty.current = value)} />
    </div>
  )
}
