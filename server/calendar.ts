import type { CalendarEvent, CalendarInfo, EventDraft, TagId } from '../src/lib/types.js'
import { CALENDAR, inParallel, type Google } from './google.js'
import { HttpError } from './http.js'

// Google Calendar ↔ Rayons. An event's tag and project are private extended properties
// (rayonsTag, rayonsProject): visible only to you, kept on your copy of invited events too.

const TAGS: TagId[] = ['admin', 'event', 'buy', 'knowledge']

interface GCalendar {
  id: string
  summary: string
  summaryOverride?: string
  backgroundColor?: string
  primary?: boolean
  selected?: boolean
  accessRole: 'freeBusyReader' | 'reader' | 'writer' | 'owner'
}

interface GEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  start: { date?: string; dateTime?: string; timeZone?: string }
  end: { date?: string; dateTime?: string; timeZone?: string }
  organizer?: { self?: boolean }
  guestsCanModify?: boolean
  extendedProperties?: { private?: Record<string, string> }
}

export async function listCalendars(google: Google): Promise<(CalendarInfo & { selected: boolean })[]> {
  const body = await google.request<{ items?: GCalendar[] }>(`${CALENDAR}/users/me/calendarList?minAccessRole=reader&maxResults=250`)
  return (body.items ?? []).map((c) => ({
    id: c.id,
    name: c.summaryOverride ?? c.summary,
    color: c.backgroundColor ?? '#493886',
    primary: !!c.primary,
    canEdit: c.accessRole === 'writer' || c.accessRole === 'owner',
    selected: c.selected !== false,
  }))
}

function toEvent(calendar: CalendarInfo, event: GEvent): CalendarEvent {
  const props = event.extendedProperties?.private ?? {}
  const tag = TAGS.includes(props.rayonsTag as TagId) ? (props.rayonsTag as TagId) : null
  return {
    id: `${calendar.id}|${event.id}`,
    calendarId: calendar.id,
    title: event.summary ?? '(no title)',
    start: event.start.dateTime ?? event.start.date ?? '',
    end: event.end.dateTime ?? event.end.date ?? '',
    allDay: !event.start.dateTime,
    location: event.location ?? '',
    description: event.description ?? '',
    tag,
    projectId: props.rayonsProject || null,
    threadId: props.rayonsThread || null,
    link: event.htmlLink,
    canEdit: calendar.canEdit && (!event.organizer || !!event.organizer.self || !!event.guestsCanModify),
  }
}

export function splitId(id: string) {
  const index = id.lastIndexOf('|')
  if (index <= 0) throw new HttpError(400, 'bad_request', 'Unknown event.')
  return { calendarId: id.slice(0, index), eventId: id.slice(index + 1) }
}

/** Events between two ISO date-times, across the calendars shown in Google Calendar. */
export async function listEvents(google: Google, timeMin: string, timeMax: string, filter: { projectId?: string; threadId?: string } = {}): Promise<CalendarEvent[]> {
  const calendars = (await listCalendars(google)).filter((c) => c.selected)
  const lists = await inParallel(calendars, 5, async (calendar) => {
    const events: CalendarEvent[] = []
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '2500' })
      if (filter.projectId) params.append('privateExtendedProperty', `rayonsProject=${filter.projectId}`)
      if (filter.threadId) params.append('privateExtendedProperty', `rayonsThread=${filter.threadId}`)
      if (pageToken) params.set('pageToken', pageToken)
      const page = await google
        .request<{ items?: GEvent[]; nextPageToken?: string }>(`${CALENDAR}/calendars/${encodeURIComponent(calendar.id)}/events?${params}`)
        .catch((error) => {
          // One unreadable calendar (a removed subscription) shouldn't hide the others.
          console.error('Calendar skipped', calendar.id, error)
          return { items: [], nextPageToken: undefined }
        })
      events.push(...(page.items ?? []).filter((e) => e.status !== 'cancelled').map((e) => toEvent(calendar, e)))
      pageToken = page.nextPageToken
    } while (pageToken && events.length < 5000)
    return events
  })
  return lists.flat().sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
}

function body(draft: Partial<EventDraft>, timeZone?: string) {
  const out: Record<string, unknown> = {}
  if (draft.title !== undefined) out.summary = draft.title
  if (draft.location !== undefined) out.location = draft.location
  if (draft.description !== undefined) out.description = draft.description
  if (draft.start !== undefined && draft.end !== undefined) {
    if (draft.allDay) {
      out.start = { date: draft.start, dateTime: null }
      out.end = { date: draft.end, dateTime: null }
    } else {
      out.start = { dateTime: draft.start, timeZone, date: null }
      out.end = { dateTime: draft.end, timeZone, date: null }
    }
  }
  const props: Record<string, string> = {}
  // An empty value clears the property (patch merges this map rather than replacing it).
  if (draft.tag !== undefined) props.rayonsTag = draft.tag ?? ''
  if (draft.projectId !== undefined) props.rayonsProject = draft.projectId ?? ''
  if (draft.threadId !== undefined) props.rayonsThread = draft.threadId ?? ''
  if (Object.keys(props).length) out.extendedProperties = { private: props }
  return out
}

async function calendarInfo(google: Google, calendarId: string) {
  const calendar = (await listCalendars(google)).find((c) => c.id === calendarId)
  if (!calendar) throw new HttpError(404, 'not_found', 'That calendar is not available.')
  return calendar
}

export async function createEvent(google: Google, draft: EventDraft, timeZone?: string) {
  const calendar = await calendarInfo(google, draft.calendarId ?? 'primary').catch(async () => (await listCalendars(google)).find((c) => c.primary)!)
  const created = await google.request<GEvent>(`${CALENDAR}/calendars/${encodeURIComponent(calendar.id)}/events`, { method: 'POST', body: JSON.stringify(body(draft, timeZone)) })
  return toEvent(calendar, created)
}

export async function getEvent(google: Google, id: string) {
  const { calendarId, eventId } = splitId(id)
  const calendar = await calendarInfo(google, calendarId)
  const event = await google.request<GEvent>(`${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`)
  return toEvent(calendar, event)
}

export async function updateEvent(google: Google, id: string, patch: Partial<EventDraft>, timeZone?: string) {
  const { calendarId, eventId } = splitId(id)
  const calendar = await calendarInfo(google, calendarId)
  const updated = await google.request<GEvent>(`${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body(patch, timeZone)),
  })
  return toEvent(calendar, updated)
}

export async function deleteEvent(google: Google, id: string) {
  const { calendarId, eventId } = splitId(id)
  await google.request(`${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' })
}

/**
 * A mail joined (or left) a project: the events linked to it follow, unless one was put in
 * another project on purpose. Returns the projects whose events changed.
 */
export async function followThreadProject(google: Google, threadId: string, projectId: string | null, previous: string[]) {
  const now = Date.now()
  const year = 365 * 86_400_000
  const events = await listEvents(google, new Date(now - 2 * year).toISOString(), new Date(now + 2 * year).toISOString(), { threadId })
  const moving = events.filter((event) => event.projectId !== projectId && (!event.projectId || previous.includes(event.projectId))).slice(0, 25)
  await inParallel(moving, 3, (event) => updateEvent(google, event.id, { projectId }))
  return moving.map((event) => event.projectId).filter((id): id is string => !!id)
}

/** Tags used by a project's events (two years back and ahead). */
export async function projectEventTags(google: Google, projectId: string) {
  const now = Date.now()
  const year = 365 * 86_400_000
  const events = await listEvents(google, new Date(now - 2 * year).toISOString(), new Date(now + 2 * year).toISOString(), { projectId })
  return [...new Set(events.map((e) => e.tag).filter((t): t is TagId => t !== null))]
}
