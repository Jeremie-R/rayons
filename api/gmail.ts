import type { Draft, TagId, ThreadQuery } from '../src/lib/types'
import { accountFor, GMAIL, googleClient } from '../server/google'
import { handle, HttpError, json, readJson } from '../server/http'
import * as mail from '../server/mail'
import { touchProjects } from '../server/projects'
import { requireUser } from '../server/supabase'

type Body =
  | { action: 'listThreads'; query: ThreadQuery }
  | { action: 'getThread'; id: string }
  | { action: 'setTag'; id: string; tag: TagId | null }
  | { action: 'setProject'; id: string; projectId: string | null }
  | { action: 'setRead'; id: string; read: boolean }
  | { action: 'setArchived'; id: string; archived: boolean }
  | { action: 'setSpam'; id: string; spam: boolean }
  | { action: 'trash'; id: string }
  | { action: 'unsubscribe'; id: string }
  | { action: 'send'; draft: Draft }
  | { action: 'attachment'; messageId: string; attachmentId: string; mimeType: string }

const ID = /^[A-Za-z0-9_-]{1,200}$/

export function POST(request: Request) {
  return handle(request, async () => {
    const user = await requireUser(request)
    const body = await readJson<Body>(request)
    if ('id' in body && !ID.test(body.id)) throw new HttpError(400, 'bad_request', 'Unknown conversation.')
    const google = googleClient(await accountFor(user.id))
    const label = (id: string, add: string[], remove: string[]) => mail.modifyThread(google, id, add, remove)

    switch (body.action) {
      case 'listThreads':
        return json(await mail.listThreads(google, user.id, body.query))
      case 'getThread':
        return json(await mail.getThread(google, user.id, body.id))
      case 'setTag':
        await mail.setTag(google, body.id, body.tag)
        return json({ project: await mail.projectOfThread(google, user.id, body.id) })
      case 'setProject': {
        const changed = await mail.setProject(google, user.id, body.id, body.projectId)
        await touchProjects([body.projectId])
        return json({ changed })
      }
      case 'setRead':
        await (body.read ? label(body.id, [], ['UNREAD']) : label(body.id, ['UNREAD'], []))
        return json({ project: await mail.projectOfThread(google, user.id, body.id) })
      case 'setArchived':
        await (body.archived ? label(body.id, [], ['INBOX']) : label(body.id, ['INBOX'], []))
        return json({})
      case 'setSpam':
        await (body.spam ? label(body.id, ['SPAM'], ['INBOX']) : label(body.id, ['INBOX'], ['SPAM']))
        return json({})
      case 'trash':
        await google.request(`${GMAIL}/threads/${body.id}/trash`, { method: 'POST' })
        return json({})
      case 'unsubscribe':
        return json(await mail.unsubscribe(google, body.id))
      case 'send':
        await mail.send(google, body.draft)
        return json({})
      case 'attachment': {
        if (!ID.test(body.messageId)) throw new HttpError(400, 'bad_request', 'Unknown message.')
        const bytes = await mail.attachment(google, body.messageId, body.attachmentId)
        // Served as a download-only blob; the browser never runs it as a page from our origin.
        const type = /^[\w.+-]+\/[\w.+-]+$/.test(body.mimeType) && !/html|xml|javascript/i.test(body.mimeType) ? body.mimeType : 'application/octet-stream'
        return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
      }
      default:
        throw new HttpError(400, 'bad_request', 'Unknown action.')
    }
  })
}
