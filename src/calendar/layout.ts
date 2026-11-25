import { addDays, DAY_MS, parseDate, startOfDay } from '../lib/dates'
import type { CalendarEvent } from '../lib/types'

/** Default height of an hour in the day and week grids, in px. Pinch changes it. */
export const HOUR_HEIGHT = 50

export function eventRange(event: CalendarEvent) {
  return { start: parseDate(event.start), end: parseDate(event.end) }
}

/** All-day events, and timed ones lasting a full day or more, go in the all-day row. */
export function isBanner(event: CalendarEvent) {
  if (event.allDay) return true
  const { start, end } = eventRange(event)
  return end.getTime() - start.getTime() >= DAY_MS
}

export interface Placed {
  event: CalendarEvent
  top: number
  height: number
  /** Column within its group of overlapping events, and how many columns the group has. */
  column: number
  columns: number
}

/** Timed events of one day, positioned, with overlapping ones side by side. */
export function layoutDay(events: CalendarEvent[], day: Date, hourHeight = HOUR_HEIGHT): Placed[] {
  const dayStart = startOfDay(day).getTime()
  const dayEnd = dayStart + DAY_MS
  const items = events
    .filter((event) => !isBanner(event))
    .map((event) => {
      const { start, end } = eventRange(event)
      return { event, start: Math.max(start.getTime(), dayStart), end: Math.min(Math.max(end.getTime(), start.getTime() + 15 * 60_000), dayEnd) }
    })
    .filter((item) => item.start < dayEnd && item.end > dayStart)
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const placed: Placed[] = []
  let group: (typeof items[number] & { column: number })[] = []
  let groupEnd = 0
  const flush = () => {
    const columns = Math.max(1, ...group.map((item) => item.column + 1))
    for (const item of group) {
      const minutes = (item.start - dayStart) / 60_000
      const duration = (item.end - item.start) / 60_000
      placed.push({ event: item.event, top: (minutes / 60) * hourHeight, height: Math.max(20, (duration / 60) * hourHeight - 2), column: item.column, columns })
    }
    group = []
  }
  for (const item of items) {
    if (group.length && item.start >= groupEnd) flush()
    const taken = new Set(group.filter((other) => other.end > item.start).map((other) => other.column))
    let column = 0
    while (taken.has(column)) column++
    group.push({ ...item, column })
    groupEnd = Math.max(groupEnd, item.end)
  }
  if (group.length) flush()
  return placed
}

export interface Banner {
  event: CalendarEvent
  /** First and last column (inclusive) within the visible days. */
  from: number
  to: number
  row: number
  continuesBefore: boolean
  continuesAfter: boolean
}

/** All-day bars across the visible days, stacked into rows without overlaps. */
export function layoutBanners(events: CalendarEvent[], days: Date[]): Banner[] {
  const first = startOfDay(days[0]).getTime()
  const last = addDays(days[days.length - 1], 1).getTime()
  const rows: number[][] = []
  const result: Banner[] = []
  const banners = events
    .filter(isBanner)
    .map((event) => ({ event, ...eventRange(event) }))
    .filter(({ start, end }) => start.getTime() < last && end.getTime() > first)
    .sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime())

  for (const { event, start, end } of banners) {
    const from = Math.max(0, Math.floor((startOfDay(start).getTime() - first) / DAY_MS))
    // End is exclusive: an event ending at midnight doesn't reach into that day.
    const endDay = end.getTime() === startOfDay(end).getTime() ? addDays(end, -1) : end
    const to = Math.min(days.length - 1, Math.floor((startOfDay(endDay).getTime() - first) / DAY_MS))
    let row = 0
    while ((rows[row] ?? []).some((col) => col >= from && col <= to)) row++
    rows[row] = [...(rows[row] ?? []), ...Array.from({ length: to - from + 1 }, (_, i) => from + i)]
    result.push({ event, from, to, row, continuesBefore: start.getTime() < first, continuesAfter: end.getTime() > last })
  }
  return result
}

/** Events touching a given day, all-day ones first. */
export function eventsOnDay(events: CalendarEvent[], day: Date) {
  const start = startOfDay(day).getTime()
  const end = start + DAY_MS
  return events
    .filter((event) => {
      const range = eventRange(event)
      return range.start.getTime() < end && range.end.getTime() > start
    })
    .sort((a, b) => Number(isBanner(b)) - Number(isBanner(a)) || parseDate(a.start).getTime() - parseDate(b.start).getTime())
}
