import { accountFor, googleClient } from '../server/google.js'
import { handle, HttpError, json, readJson } from '../server/http.js'
import * as mail from '../server/mail.js'
import { refreshProjects } from '../server/projects.js'
import { adminClient, requireUser } from '../server/supabase.js'

// The Google side of projects. The browser reads and writes the projects table itself
// (row-level security keeps it private); these keep Gmail's project labels in step.

type Body =
  | { action: 'renamed'; projectId: string }
  | { action: 'archive'; projectId: string }
  | { action: 'delete'; projectId: string }
  | { action: 'refresh'; projectIds?: string[] }
  | { action: 'attachments'; projectId: string }

const UUID = /^[0-9a-f-]{36}$/

export function POST(request: Request) {
  return handle(request, async () => {
    const user = await requireUser(request)
    const body = await readJson<Body>(request)
    if ('projectId' in body && !UUID.test(body.projectId)) throw new HttpError(400, 'bad_request', 'Unknown project.')
    const google = googleClient(await accountFor(user.id))

    switch (body.action) {
      case 'renamed':
        await mail.renameProjectLabel(google, await mail.projectOf(user.id, body.projectId))
        return json({})
      case 'archive':
        await mail.archiveProjectMail(google, await mail.projectOf(user.id, body.projectId))
        await refreshProjects(google, user.id, [body.projectId])
        return json({})
      case 'delete': {
        const project = await mail.projectOf(user.id, body.projectId)
        await mail.deleteProjectLabel(google, project)
        const db = adminClient()
        const { data: files } = await db.from('project_files').select('storage_path').eq('project_id', project.id).eq('user_id', user.id)
        if (files?.length) await db.storage.from('project-files').remove(files.map((f) => f.storage_path))
        const { error } = await db.from('projects').delete().eq('id', project.id).eq('user_id', user.id)
        if (error) throw error
        return json({})
      }
      case 'refresh':
        await refreshProjects(google, user.id, body.projectIds?.filter((id) => UUID.test(id)))
        return json({})
      case 'attachments':
        return json(await mail.projectAttachments(google, await mail.projectOf(user.id, body.projectId)))
      default:
        throw new HttpError(400, 'bad_request', 'Unknown action.')
    }
  })
}
