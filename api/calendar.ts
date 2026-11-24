import type { EventDraft } from '../src/lib/types'
import * as calendar from '../server/calendar'
import { accountFor, googleClient } from '../server/google'
import { handle, HttpError, json, readJson } from '../server/http'
import { touchProjects } from '../server/projects'
import { requireUser } from '../server/supabase'

type Body =
  | { action: 'listCalendars' }
  | { action: 'listEvents'; timeMin: string; timeMax: string; projectId?: string }
  | { action: 'createEvent'; draft: EventDraft; timeZone?: string }
  | { action: 'updateEvent'; id: string; patch: Partial<EventDraft>; timeZone?: string }
  | { action: 'deleteEvent'; id: string }

const validTime = (value: string) => !Number.isNaN(Date.parse(value))
const validZone = (zone?: string) => {
  if (!zone) return undefined
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return zone
  } catch {
    return undefined
  }
}

export function POST(request: Request) {
  return handle(request, async () => {
    const user = await requireUser(request)
    const body = await readJson<Body>(request)
    const google = googleClient(await accountFor(user.id))

    switch (body.action) {
      case 'listCalendars':
        return json(await calendar.listCalendars(google))
      case 'listEvents':
        if (!validTime(body.timeMin) || !validTime(body.timeMax)) throw new HttpError(400, 'bad_request', 'Unknown dates.')
        return json(await calendar.listEvents(google, body.timeMin, body.timeMax, body.projectId))
      case 'createEvent': {
        const event = await calendar.createEvent(google, body.draft, validZone(body.timeZone))
        await touchProjects([event.projectId])
        return json(event)
      }
      case 'updateEvent': {
        const before = body.patch.projectId !== undefined ? await calendar.getEvent(google, body.id) : null
        const event = await calendar.updateEvent(google, body.id, body.patch, validZone(body.timeZone))
        if (before && before.projectId !== event.projectId) await touchProjects([event.projectId])
        return json({ event, previousProjectId: before?.projectId ?? event.projectId })
      }
      case 'deleteEvent':
        await calendar.deleteEvent(google, body.id)
        return json({})
      default:
        throw new HttpError(400, 'bad_request', 'Unknown action.')
    }
  })
}
