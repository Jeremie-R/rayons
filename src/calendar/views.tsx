import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { addDays, dateKey, formatLongDay, formatMonthYear, formatTime, formatWeekday, isSameDay, minutesIntoDay, parseDate, startOfMonth, startOfWeek } from '../lib/dates'
import type { CalendarEvent, Project } from '../lib/types'
import { eventRange, eventsOnDay, HOUR_HEIGHT, isBanner, layoutBanners, layoutDay } from './layout'

interface ViewProps {
  events: CalendarEvent[]
  onOpen: (event: CalendarEvent) => void
  onCreate: (at: Date, allDay?: boolean) => void
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const tagOf = (event: CalendarEvent) => event.tag ?? 'none'

function timeRange(event: CalendarEvent) {
  const { start, end } = eventRange(event)
  return `${formatTime(start)} — ${formatTime(end)}`
}

// ---------------------------------------------------------------------------------------------
// Week and day: a time grid.

export function TimeGrid({ days, events, onOpen, onCreate }: ViewProps & { days: Date[] }) {
  const scroller = useRef<HTMLDivElement>(null)
  const now = useNow()
  const banners = layoutBanners(events, days)
  const bannerRows = Math.max(1, ...banners.map((b) => b.row + 1))
  const columns = { '--days': days.length } as CSSProperties

  // Open the day around 7:30, or earlier if something starts before then.
  useLayoutEffect(() => {
    const earliest = Math.min(7.5 * 60, ...days.flatMap((day) => layoutDay(events, day).map((p) => (p.top / HOUR_HEIGHT) * 60)))
    scroller.current?.scrollTo({ top: Math.max(0, (earliest / 60) * HOUR_HEIGHT - 24) })
    // Only when the visible days change, not on every refresh.
  }, [dateKey(days[0]), days.length])

  const createAt = (day: Date, event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const y = event.nativeEvent.offsetY
    const minutes = Math.floor(((y / HOUR_HEIGHT) * 60) / 30) * 30
    const at = new Date(day)
    at.setHours(0, minutes, 0, 0)
    onCreate(at)
  }

  return (
    <div className="time-grid" style={columns}>
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
        <div className="banners" style={{ gridTemplateRows: `repeat(${bannerRows}, 30px)` }} onDoubleClick={(e) => e.target === e.currentTarget && onCreate(days[0], true)}>
          {banners.map((banner) => (
            <button
              key={banner.event.id}
              type="button"
              className={`banner ${banner.continuesBefore ? 'continues-before' : ''} ${banner.continuesAfter ? 'continues-after' : ''}`}
              data-tag={tagOf(banner.event)}
              style={{ gridColumn: `${banner.from + 1} / ${banner.to + 2}`, gridRow: banner.row + 1 }}
              onClick={() => onOpen(banner.event)}
              title={banner.event.title}
            >
              {banner.event.title}
            </button>
          ))}
        </div>
      </div>

      <div className="time-grid__body" ref={scroller}>
        <div className="time-grid__canvas" style={{ height: HOUR_HEIGHT * 24 }}>
          <div className="time-grid__gutter" aria-hidden="true">
            {HOURS.map((hour) => (
              <span key={hour} className={`hour-label ${hour % 2 ? 'is-odd' : ''}`} style={{ top: hour * HOUR_HEIGHT }}>
                {hour > 0 && `${String(hour).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const placed = layoutDay(events, day)
            const today = isSameDay(day, now)
            return (
              <div key={day.toISOString()} className="day-column" onClick={(e) => createAt(day, e)} aria-label={formatLongDay(day)} role="group">
                {placed.map(({ event, top, height, column, columns }) => (
                  <button
                    key={event.id}
                    type="button"
                    className={`event-block ${height < 44 ? 'is-short' : ''}`}
                    data-tag={tagOf(event)}
                    style={{ top, height, left: `calc(${(column / columns) * 100}% + 4px)`, width: `calc(${100 / columns}% - 8px)` }}
                    onClick={() => onOpen(event)}
                  >
                    <span className="event-block__title">{event.title || '(no title)'}</span>
                    {height >= 44 && <span className="event-block__time">{timeRange(event)}</span>}
                    {height >= 80 && event.location && <span className="event-block__where">{event.location}</span>}
                  </button>
                ))}
                {today && <span className="now-line" style={{ top: (minutesIntoDay(now) / 60) * HOUR_HEIGHT }} aria-hidden="true" />}
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
              onCreate(at)
            }}
          >
            <button type="button" className="month-cell__date" onClick={() => onDay(day)} aria-label={formatLongDay(day)}>
              {day.getDate()}
            </button>
            {visible.map((event) => (
              <button key={event.id} type="button" className={`month-event ${isBanner(event) ? 'is-banner' : ''}`} data-tag={tagOf(event)} onClick={() => onOpen(event)}>
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
                <button type="button" className="schedule__event" data-tag={tagOf(event)} onClick={() => onOpen(event)}>
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

/** The current time, updated every minute (for the "now" line). */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

