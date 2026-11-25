import { api as callApi, ApiError, reportReconnectNeeded, supabase } from '../auth/cloud'
import { addDays, parseDate, toLocalIso } from '../lib/dates'
import type { Account, CalendarEvent, CalendarInfo, Project, ProjectFile, TagId, Thread, ThreadSummary } from '../lib/types'
import type { Backend } from './backend'
import { invalidate, keys } from './store'

// Gmail and Google Calendar through our api/ functions; projects, notes and files in Supabase.

interface ProjectRow {
  id: string
  name: string
  notes: string
  status: 'active' | 'archived'
  tags: TagId[]
  unread_count: number
  created_at: string
  updated_at: string
  archived_at: string | null
}

interface FileRow {
  id: string
  project_id: string
  name: string
  size: number
  mime_type: string
  storage_path: string
  created_at: string
}

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  notes: row.notes,
  status: row.status,
  tags: row.tags,
  unreadCount: row.unread_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  archivedAt: row.archived_at,
})

const toFile = (row: FileRow): ProjectFile & { storagePath: string } => ({
  id: row.id,
  projectId: row.project_id,
  name: row.name,
  size: row.size,
  mimeType: row.mime_type,
  source: 'upload',
  createdAt: row.created_at,
  storagePath: row.storage_path,
})

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

export function createLiveBackend(userId: string, account: Account): Backend {
  const db = supabase()

  async function api<T>(path: string, body: unknown, as: 'json' | 'blob' = 'json') {
    try {
      return await callApi<T>(path, body, as)
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'google_reconnect' || error.code === 'google_not_connected')) reportReconnectNeeded()
      throw error
    }
  }
  const gmail = <T>(body: Record<string, unknown>) => api<T>('gmail', body)
  const calendar = <T>(body: Record<string, unknown>) => api<T>('calendar', body)

  /** Re-counts tags and unread mail for these projects, then shows the new numbers. */
  let refreshing: Promise<void> | null = null
  const refreshStats = (projectIds?: (string | null | undefined)[]) => {
    const ids = projectIds?.filter((id): id is string => !!id)
    if (ids && ids.length === 0) return
    const run = api('projects', { action: 'refresh', projectIds: ids })
      .then(() => invalidate(keys.projects))
      .catch((error) => console.warn('Could not refresh project numbers', error))
    if (!ids) refreshing = run.finally(() => (refreshing = null))
  }
  let refreshedAt = 0

  const unwrap = <T>({ data, error }: { data: T | null; error: { message: string } | null }) => {
    if (error) throw new Error(error.message)
    return data as T
  }

  const wide = () => ({ timeMin: toLocalIso(addDays(new Date(), -730)), timeMax: toLocalIso(addDays(new Date(), 730)) })

  return {
    kind: 'live',
    account,

    listThreads: (query) => gmail<ThreadSummary[]>({ action: 'listThreads', query }),
    getThread: (id) => gmail<Thread>({ action: 'getThread', id }),

    async setThreadTag(id, tag) {
      const { project } = await gmail<{ project: string | null }>({ action: 'setTag', id, tag })
      refreshStats([project])
    },
    async setThreadProject(id, projectId) {
      const { changed } = await gmail<{ changed: string[] }>({ action: 'setProject', id, projectId })
      refreshStats(changed)
    },
    async setThreadRead(id, read) {
      const { project } = await gmail<{ project: string | null }>({ action: 'setRead', id, read })
      refreshStats([project])
    },
    async setThreadArchived(id, archived) {
      await gmail({ action: 'setArchived', id, archived })
    },
    async trashThread(id) {
      await gmail({ action: 'trash', id })
    },
    async setThreadSpam(id, spam) {
      await gmail({ action: 'setSpam', id, spam })
    },
    unsubscribe: (id) => gmail({ action: 'unsubscribe', id }),
    async send(draft) {
      await gmail({ action: 'send', draft })
    },
    async attachmentUrl(messageId, attachmentId, _filename, mimeType) {
      const blob = await api<Blob>('gmail', { action: 'attachment', messageId, attachmentId, mimeType }, 'blob')
      return URL.createObjectURL(blob)
    },

    listCalendars: () => calendar<CalendarInfo[]>({ action: 'listCalendars' }),
    listEvents: (from, to, options) =>
      calendar<CalendarEvent[]>({ action: 'listEvents', timeMin: toLocalIso(parseDate(from)), timeMax: toLocalIso(parseDate(to)), projectId: options?.projectId }),
    async createEvent(draft) {
      const event = await calendar<CalendarEvent>({ action: 'createEvent', draft, timeZone })
      refreshStats([event.projectId])
      return event
    },
    async updateEvent(id, patch) {
      const { event, previousProjectId } = await calendar<{ event: CalendarEvent; previousProjectId: string | null }>({ action: 'updateEvent', id, patch, timeZone })
      refreshStats([...new Set([event.projectId, previousProjectId])])
      return event
    },
    async deleteEvent(id) {
      await calendar({ action: 'deleteEvent', id })
    },

    async listProjects() {
      const rows = unwrap(await db.from('projects').select('*').order('updated_at', { ascending: false }))
      // Numbers come from Gmail; refresh them now and then, in the background.
      if (!refreshing && Date.now() - refreshedAt > 5 * 60_000) {
        refreshedAt = Date.now()
        refreshStats()
      }
      return (rows as ProjectRow[]).map(toProject)
    },
    async getProject(id) {
      return toProject(unwrap(await db.from('projects').select('*').eq('id', id).single()) as ProjectRow)
    },
    async createProject(name) {
      return toProject(unwrap(await db.from('projects').insert({ name, user_id: userId }).select('*').single()) as ProjectRow)
    },
    async updateProject(id, patch) {
      unwrap(await db.from('projects').update(patch).eq('id', id).select('id'))
      if (patch.name !== undefined) await api('projects', { action: 'renamed', projectId: id })
    },
    async setProjectArchived(id, archived) {
      unwrap(await db.from('projects').update({ status: archived ? 'archived' : 'active', archived_at: archived ? new Date().toISOString() : null }).eq('id', id).select('id'))
      if (archived) await api('projects', { action: 'archive', projectId: id })
    },
    async deleteProject(id) {
      await api('projects', { action: 'delete', projectId: id })
    },
    listProjectEvents: (projectId) => calendar<CalendarEvent[]>({ action: 'listEvents', ...wide(), projectId }),
    listThreadEvents: (threadId) => calendar<CalendarEvent[]>({ action: 'listEvents', ...wide(), threadId }),

    async listFiles(projectId) {
      const [rows, fromMail] = await Promise.all([
        db.from('project_files').select('*').eq('project_id', projectId).order('created_at').then(unwrap),
        api<ProjectFile[]>('projects', { action: 'attachments', projectId }).catch((error) => {
          console.warn('Could not list mail attachments', error)
          return [] as ProjectFile[]
        }),
      ])
      return [...(rows as FileRow[]).map(toFile), ...fromMail]
    },
    async uploadFile(projectId, file) {
      const safeName = file.name.replace(/[^\w.\- ()]+/g, '_').slice(-120)
      const path = `${userId}/${projectId}/${crypto.randomUUID()}-${safeName}`
      const { error } = await db.storage.from('project-files').upload(path, file, { contentType: file.type || 'application/octet-stream' })
      if (error) throw new Error(error.message)
      const row = unwrap(
        await db
          .from('project_files')
          .insert({ project_id: projectId, user_id: userId, name: file.name, size: file.size, mime_type: file.type || 'application/octet-stream', storage_path: path })
          .select('*')
          .single(),
      ) as FileRow
      return toFile(row)
    },
    async deleteFile(file) {
      const row = unwrap(await db.from('project_files').select('storage_path').eq('id', file.id).single()) as Pick<FileRow, 'storage_path'>
      await db.storage.from('project-files').remove([row.storage_path])
      unwrap(await db.from('project_files').delete().eq('id', file.id).select('id'))
    },
    async fileUrl(file) {
      const row = unwrap(await db.from('project_files').select('storage_path').eq('id', file.id).single()) as Pick<FileRow, 'storage_path'>
      const { data, error } = await db.storage.from('project-files').createSignedUrl(row.storage_path, 300)
      if (error) throw new Error(error.message)
      return data.signedUrl
    },
  }
}
