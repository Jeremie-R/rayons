// Date helpers. Week starts on Monday, times use a 24-hour clock, months read "Sep 9".

export const DAY_MS = 86_400_000

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', options)
const shortDay = fmt({ month: 'short', day: 'numeric' })
const fullDay = fmt({ month: 'short', day: 'numeric', year: 'numeric' })
const time = fmt({ hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
const weekday = fmt({ weekday: 'short' })
const longWeekday = fmt({ weekday: 'long', month: 'long', day: 'numeric' })
const monthName = fmt({ month: 'short' })
const monthYear = fmt({ month: 'long', year: 'numeric' })

export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
export const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes())
export const addMonths = (date: Date, months: number) => new Date(date.getFullYear(), date.getMonth() + months, 1)
export const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Monday of the week holding `date`. */
export function startOfWeek(date: Date) {
  const day = startOfDay(date)
  return addDays(day, -((day.getDay() + 6) % 7))
}

export const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

/** `YYYY-MM-DD` in local time. */
export function dateKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Reads `YYYY-MM-DD` as local midnight, or a full ISO date-time as is. */
export function parseDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

/** ISO date-time with the local offset, as Google Calendar expects. */
export function toLocalIso(date: Date) {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
}

export const formatTime = (date: Date) => time.format(date)
export const formatWeekday = (date: Date) => weekday.format(date)
export const formatLongDay = (date: Date) => longWeekday.format(date)
export const formatMonth = (date: Date) => monthName.format(date).toLowerCase()
export const formatMonthYear = (date: Date) => monthYear.format(date)
export const formatDay = (date: Date) => fullDay.format(date)

/** "10:42" today, "Sep 9" this year, "Sep 9, 2025" before. */
export function formatListDate(value: string, now = new Date()) {
  const date = new Date(value)
  if (isSameDay(date, now)) return time.format(date)
  if (date.getFullYear() === now.getFullYear()) return shortDay.format(date)
  return fullDay.format(date)
}

export const minutesIntoDay = (date: Date) => date.getHours() * 60 + date.getMinutes()

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
