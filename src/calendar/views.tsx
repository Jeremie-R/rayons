import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { addDays, dateKey, formatLongDay, formatMonthYear, formatTime, formatWeekday, isSameDay, minutesIntoDay, parseDate, startOfMonth, startOfWeek } from '../lib/dates'
import type { CalendarEvent, EventDraft, Project } from '../lib/types'
import { eventRange, eventsOnDay, HOUR_HEIGHT, isBanner, layoutBanners, layoutDay } from './layout'

interface ViewProps {
  events: CalendarEvent[]
  /** `anchor` is where the click happened, so the editor can open next to it. */
  onOpen: (event: CalendarEvent, anchor: DOMRect) => void
  /** `end` when a time range was dragged out. */
  onCreate: (at: Date, allDay: boolean, anchor: DOMRect, end?: Date) => void
}

const rectOf = (event: { currentTarget: Element }) => event.currentTarget.getBoundingClientRect()

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const tagOf = (event: CalendarEvent) => event.tag ?? 'none'

function timeRange(event: CalendarEvent) {
  const { start, end } = eventRange(event)
  return `${formatTime(start)} — ${formatTime(end)}`
}

// ---------------------------------------------------------------------------------------------
// Week and day: a time grid.

const HOUR_KEY = 'rayons:hour-height'
const MIN_HOUR = 24
const MAX_HOUR = 140
const clampHour = (h: number) => Math.max(MIN_HOUR, Math.min(MAX_HOUR, h))

function savedHourHeight() {
  try {
    const value = Number(localStorage.getItem(HOUR_KEY))
    return value ? clampHour(value) : HOUR_HEIGHT
  } catch {
    return HOUR_HEIGHT
  }
}

/**
 * Week and day: a time grid.
 * - Pinch (or ctrl + scroll on a trackpad) to zoom the hours; the height is remembered.
 * - With `onStep` (the phone's day view) `days` holds the day before, the day and the day
 *   after, side by side: a sideways drag slides the page with the finger, and letting go
 *   past a quarter of the width brings in the neighbour, like pushing a sheet of paper.
 */
export function TimeGrid({ days, events, onOpen, onCreate, ghost, onStep }: ViewProps & { days: Date[]; ghost?: EventDraft | null; onStep?: (direction: 1 | -1) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const now = useNow()
  const [hourHeight, setHourHeight] = useState(savedHourHeight)
  const hourRef = useRef(hourHeight)
  hourRef.current = hourHeight
  const carousel = !!onStep
  const banners = layoutBanners(events, days)
  const bannerRows = Math.max(1, ...banners.map((b) => b.row + 1))
  const columns = { '--days': days.length, '--hour': `${hourHeight}px` } as CSSProperties

  // Open the day around 7:30, or earlier if something starts before then (once).
  useLayoutEffect(() => {
    const visible = carousel ? [days[1]] : days
    const earliest = Math.min(7.5 * 60, ...visible.flatMap((day) => layoutDay(events, day, hourHeight).map((p) => (p.top / hourHeight) * 60)))
    scroller.current?.scrollTo({ top: Math.max(0, (earliest / 60) * hourHeight - 24) })
  }, [])

  // Remember the zoom.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(HOUR_KEY, String(Math.round(hourHeight)))
      } catch {
        // This visit only.
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [hourHeight])

  /** Zooms keeping the time under `clientY` where it is on screen. */
  const zoomTo = useCallback((next: number, clientY: number) => {
    const body = scroller.current
    if (!body) return
    const height = clampHour(next)
    const offset = clientY - body.getBoundingClientRect().top
    const minutes = ((body.scrollTop + offset) / hourRef.current) * 60
    hourRef.current = height
    setHourHeight(height)
    requestAnimationFrame(() => body.scrollTo({ top: Math.max(0, (minutes / 60) * height - offset) }))
  }, [])

  // Trackpad pinch arrives as ctrl + wheel.
  useEffect(() => {
    const body = scroller.current
    if (!body) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      zoomTo(hourRef.current * Math.exp(-event.deltaY * 0.01), event.clientY)
    }
    body.addEventListener('wheel', onWheel, { passive: false })
    return () => body.removeEventListener('wheel', onWheel)
  }, [zoomTo])

  // Touch: two fingers pinch; one finger sideways swipes (carousel only).
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; height: number } | null>(null)
  const swipe = useRef<{ x: number; y: number; dx: number; axis: 'x' | 'y' | null } | null>(null)
  const swallowClick = useRef(false)

  const setSwipe = (dx: number, animate: boolean) => {
    const el = root.current
    if (!el) return
    el.classList.toggle('is-animating', animate)
    el.style.setProperty('--swipe', `${dx}px`)
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType !== 'touch') return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), height: hourRef.current }
      swipe.current = null
      setSwipe(0, true)
    } else if (pointers.current.size === 1 && carousel) {
      swipe.current = { x: event.clientX, y: event.clientY, dx: 0, axis: null }
    }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      zoomTo(pinch.current.height * (distance / pinch.current.distance), (a.y + b.y) / 2)
      return
    }
    const g = swipe.current
    if (!g) return
    const dx = event.clientX - g.x
    const dy = event.clientY - g.y
    if (!g.axis) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        g.axis = 'x'
        try {
          ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
        } catch {
          // Not capturable (synthetic or already gone): the drag still works.
        }
      } else if (Math.abs(dy) > 10) g.axis = 'y'
    }
    if (g.axis !== 'x') return
    g.dx = dx
    setSwipe(dx, false)
  }

  const onPointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    const g = swipe.current
    if (!g || pointers.current.size > 0) return
    swipe.current = null
    if (g.axis !== 'x' || !onStep) return
    swallowClick.current = true
    const width = scroller.current?.clientWidth ?? 1
    const direction = g.dx < -width * 0.25 ? 1 : g.dx > width * 0.25 ? -1 : 0
    if (!direction) {
      setSwipe(0, true)
      return
    }
    // Slide the neighbour in, then move the date and reset without animating: same picture.
    setSwipe(direction === 1 ? -width : width, true)
    window.setTimeout(() => {
      setSwipe(0, false)
      onStep(direction)
    }, 260)
  }

  // Mouse: press on an empty slot and drag to draw the event's time range (15-minute steps).
  const [drag, setDrag] = useState<{ day: Date; from: number; to: number } | null>(null)
  const dragStart = useRef<{ day: Date; anchor: number; y: number; moved: boolean; column: HTMLElement } | null>(null)
  const SNAP = 15
  const minutesAtY = (column: HTMLElement, clientY: number) => {
    const offset = clientY - column.getBoundingClientRect().top
    return Math.max(0, Math.min(24 * 60, (offset / hourRef.current) * 60))
  }

  const startDrag = (day: Date, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.target !== event.currentTarget) return
    const column = event.currentTarget
    const anchor = Math.floor(minutesAtY(column, event.clientY) / SNAP) * SNAP
    dragStart.current = { day, anchor, y: event.clientY, moved: false, column }
    try {
      column.setPointerCapture(event.pointerId)
    } catch {
      // Not capturable: the drag still works inside the column.
    }
  }

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = dragStart.current
    if (!d) return
    if (!d.moved && Math.abs(event.clientY - d.y) < 6) return
    d.moved = true
    const at = minutesAtY(d.column, event.clientY)
    const from = at < d.anchor ? Math.floor(at / SNAP) * SNAP : d.anchor
    const to = at < d.anchor ? d.anchor + SNAP : Math.max(d.anchor + SNAP, Math.ceil(at / SNAP) * SNAP)
    setDrag((current) => (current && current.from === from && current.to === Math.min(to, 24 * 60) ? current : { day: d.day, from, to: Math.min(to, 24 * 60) }))
  }

  const endDrag = () => {
    const d = dragStart.current
    dragStart.current = null
    if (!d || !d.moved || !drag) {
      setDrag(null)
      return
    }
    // The click that follows the drag must not create a second event.
    swallowClick.current = true
    const start = new Date(d.day)
    start.setHours(0, drag.from, 0, 0)
    const end = new Date(d.day)
    end.setHours(0, drag.to, 0, 0)
    const column = d.column.getBoundingClientRect()
    onCreate(start, false, new DOMRect(column.left, column.top + (drag.from / 60) * hourRef.current, column.width, ((drag.to - drag.from) / 60) * hourRef.current), end)
    setDrag(null)
  }

  const createAt = (day: Date, event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (swallowClick.current) {
      swallowClick.current = false
      return
    }
    const y = event.nativeEvent.offsetY
    const minutes = Math.floor(((y / hourHeight) * 60) / 30) * 30
    const at = new Date(day)
    at.setHours(0, minutes, 0, 0)
    const column = event.currentTarget.getBoundingClientRect()
    onCreate(at, false, new DOMRect(column.left, column.top + (minutes / 60) * hourHeight, column.width, hourHeight))
  }

  return (
    <div
      ref={root}
      className={`time-grid ${carousel ? 'is-carousel' : ''}`}
      style={columns}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={(event) => {
        if (swallowClick.current && !(event.target as Element).classList.contains('day-column')) {
          swallowClick.current = false
          event.stopPropagation()
          event.preventDefault()
        }
      }}
    >
      <div className="time-grid__head">
        <div className="time-grid__corner" />
        {days.map((day) => (
          <div key={day.toISOString()} className={`day-head ${isSameDay(day, now) ? 'is-today' : ''}`}>
            <span className="day-head__weekday">{formatWeekday(day)}</span>
            <span className="day-head__date">{day.getDate()}</span>
          </div>
        ))}
        <div className="time-grid__corner time-grid__corner--allday">
          <span className="visually-hidden">All day</span>
        </div>
        <div className="banners" style={{ gridTemplateRows: `repeat(${bannerRows}, 30px)` }} onDoubleClick={(e) => e.target === e.currentTarget && onCreate(days[carousel ? 1 : 0], true, rectOf(e))}>
          {banners.map((banner) => (
            <button
              key={banner.event.id}
              type="button"
              className={`banner ${banner.continuesBefore ? 'continues-before' : ''} ${banner.continuesAfter ? 'continues-after' : ''}`}
              data-tag={tagOf(banner.event)}
              style={{ gridColumn: `${banner.from + 1} / ${banner.to + 2}`, gridRow: banner.row + 1 }}
              onClick={(e) => onOpen(banner.event, rectOf(e))}
              data-tooltip={banner.event.title}
              data-tooltip-truncated=""
            >
              {banner.event.title}
            </button>
          ))}
        </div>
      </div>

      <div className="time-grid__body" ref={scroller}>
        <div className="time-grid__canvas" style={{ height: hourHeight * 24 }}>
          <div className="time-grid__gutter" aria-hidden="true">
            {HOURS.map((hour) => (
              <span key={hour} className={`hour-label ${hour % 2 && hourHeight < 70 ? 'is-odd' : ''}`} style={{ top: hour * hourHeight }}>
                {hour > 0 && `${String(hour).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const placed = layoutDay(events, day, hourHeight)
            const today = isSameDay(day, now)
            return (
              <div
                key={day.toISOString()}
                className={`day-column ${drag ? 'is-drawing' : ''}`}
                onClick={(e) => createAt(day, e)}
                onPointerDown={(e) => startDrag(day, e)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={() => {
                  dragStart.current = null
                  setDrag(null)
                }}
                aria-label={formatLongDay(day)}
                role="group"
              >
                {placed.map(({ event, top, height, column, columns }) => (
                  <button
                    key={event.id}
                    type="button"
                    className={`event-block ${height < 44 ? 'is-short' : ''}`}
                    data-tag={tagOf(event)}
                    style={{ top, height, left: `calc(${(column / columns) * 100}% + 4px)`, width: `calc(${100 / columns}% - 8px)` }}
                    onClick={(e) => onOpen(event, rectOf(e))}
                  >
                    <span className="event-block__title">{event.title || '(no title)'}</span>
                    {height >= 44 && <span className="event-block__time">{timeRange(event)}</span>}
                    {height >= 80 && event.location && <span className="event-block__where">{event.location}</span>}
                  </button>
                ))}
                {drag && isSameDay(drag.day, day) ? (
                  <DragBlock from={drag.from} to={drag.to} hourHeight={hourHeight} />
                ) : (
                  ghost && !ghost.allDay && <GhostBlock draft={ghost} day={day} hourHeight={hourHeight} />
                )}
                {today && <span className="now-line" style={{ top: (minutesIntoDay(now) / 60) * hourHeight }} aria-hidden="true" />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Month

export function MonthGrid({ cursor, events, onOpen, onCreate, onDay }: ViewProps & { cursor: Date; onDay: (day: Date) => void }) {
  const now = useNow()
  const first = startOfWeek(startOfMonth(cursor))
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i))
  return (
    <div className="month-grid">
      {days.slice(0, 7).map((day) => (
        <span key={`h${day.getDay()}`} className="month-grid__weekday">
          {formatWeekday(day)}
        </span>
      ))}
      {days.map((day) => {
        const list = eventsOnDay(events, day)
        const visible = list.slice(0, 3)
        return (
          <div
            key={day.toISOString()}
            className={`month-cell ${day.getMonth() !== cursor.getMonth() ? 'is-outside' : ''} ${isSameDay(day, now) ? 'is-today' : ''}`}
            onClick={(e) => {
              if (e.target !== e.currentTarget) return
              const at = new Date(day)
              at.setHours(9)
              onCreate(at, false, rectOf(e))
            }}
          >
            <button type="button" className="month-cell__date" onClick={() => onDay(day)} aria-label={formatLongDay(day)}>
              {day.getDate()}
            </button>
            {visible.map((event) => (
              <button key={event.id} type="button" className={`month-event ${isBanner(event) ? 'is-banner' : ''}`} data-tag={tagOf(event)} onClick={(e) => onOpen(event, rectOf(e))}>
                {!isBanner(event) && <span className="month-event__time">{formatTime(parseDate(event.start))}</span>}
                <span className="month-event__title">{event.title}</span>
              </button>
            ))}
            {list.length > 3 && (
              <button type="button" className="month-cell__more" onClick={() => onDay(day)}>
                +{list.length - 3} more
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Year

export function YearGrid({ cursor, events, onDay }: { cursor: Date; events: CalendarEvent[]; onDay: (day: Date) => void }) {
  const now = useNow()
  const busy = new Set<string>()
  for (const event of events) {
    const { start, end } = eventRange(event)
    for (let day = new Date(start.getFullYear(), start.getMonth(), start.getDate()); day < end; day = addDays(day, 1)) busy.add(dateKey(day))
  }
  return (
    <div className="year-grid">
      {Array.from({ length: 12 }, (_, m) => {
        const month = new Date(cursor.getFullYear(), m, 1)
        const first = startOfWeek(month)
        const days = Array.from({ length: 42 }, (_, i) => addDays(first, i))
        return (
          <section key={m} className="mini-month" aria-label={formatMonthYear(month)}>
            <h3>{formatMonthYear(month).split(' ')[0]}</h3>
            <div className="mini-month__grid">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i} className="mini-month__weekday" aria-hidden="true">
                  {d}
                </span>
              ))}
              {days.map((day) =>
                day.getMonth() !== m ? (
                  <span key={day.toISOString()} />
                ) : (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={`mini-month__day ${busy.has(dateKey(day)) ? 'is-busy' : ''} ${isSameDay(day, now) ? 'is-today' : ''}`}
                    onClick={() => onDay(day)}
                    aria-label={formatLongDay(day)}
                  >
                    {day.getDate()}
                  </button>
                ),
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Schedule: an agenda, day by day.

export function Schedule({ from, days, events, onOpen, projects, onMore }: Omit<ViewProps, 'onCreate'> & { from: Date; days: number; projects: Project[]; onMore: () => void }) {
  const now = useNow()
  const list = Array.from({ length: days }, (_, i) => addDays(from, i))
    .map((day) => ({ day, events: eventsOnDay(events, day) }))
    .filter((entry) => entry.events.length > 0)
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name

  return (
    <div className="schedule">
      {list.length === 0 && <p className="schedule__empty muted">Nothing planned in the next {days} days.</p>}
      {list.map(({ day, events: dayEvents }) => (
        <section key={day.toISOString()} className={`schedule__day ${isSameDay(day, now) ? 'is-today' : ''}`}>
          <h2 className="schedule__date">
            <span className="schedule__num">{day.getDate()}</span>
            <span>
              {formatWeekday(day)}
              <span className="muted"> · {formatMonthYear(day)}</span>
            </span>
          </h2>
          <ul role="list">
            {dayEvents.map((event) => (
              <li key={event.id}>
                <button type="button" className="schedule__event" data-tag={tagOf(event)} onClick={(e) => onOpen(event, rectOf(e))}>
                  <span className="schedule__time">{isBanner(event) ? 'all day' : timeRange(event)}</span>
                  <span className="schedule__bar" aria-hidden="true" />
                  <span className="schedule__what">
                    <span className="medium">{event.title}</span>
                    {(event.location || event.projectId) && (
                      <span className="muted schedule__meta">{[projectName(event.projectId), event.location].filter(Boolean).join(' · ')}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="schedule__more">
        <button type="button" className="button button--outline button--sm" onClick={onMore}>
          Show the next 30 days
        </button>
      </div>
    </div>
  )
}

const clock = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** The range being drawn with the mouse. */
function DragBlock({ from, to, hourHeight }: { from: number; to: number; hourHeight: number }) {
  return (
    <span className="event-block event-block--ghost is-drawing" style={{ top: (from / 60) * hourHeight, height: ((to - from) / 60) * hourHeight, left: 4, width: 'calc(100% - 8px)' }} aria-hidden="true">
      <span className="event-block__title">New event</span>
      <span className="event-block__time">
        {clock(from)} — {clock(to)}
      </span>
    </span>
  )
}

/** The slot being created, shown in the grid while the editor is open. */
function GhostBlock({ draft, day, hourHeight }: { draft: EventDraft; day: Date; hourHeight: number }) {
  const placed = layoutDay([{ ...draft, id: 'ghost', calendarId: '', canEdit: true }], day, hourHeight)[0]
  if (!placed) return null
  return (
    <span className="event-block event-block--ghost" style={{ top: placed.top, height: placed.height, left: 4, width: 'calc(100% - 8px)' }} aria-hidden="true">
      <span className="event-block__title">{draft.title || '(no title)'}</span>
      <span className="event-block__time">{timeRange({ ...draft, id: 'ghost', calendarId: '', canEdit: true })}</span>
    </span>
  )
}

/** The current time, updated every minute (for the "now" line). */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

