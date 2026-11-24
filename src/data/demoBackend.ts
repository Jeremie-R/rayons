import { DAY_MS, parseDate, startOfDay } from '../lib/dates'
import { TAGS, type CalendarEvent, type Project, type ProjectFile, type TagId, type Thread, type ThreadSummary } from '../lib/types'
import type { Backend } from './backend'
import { createDemoData, DEMO_ACCOUNT, DEMO_VERSION, type DemoData, type DemoThread } from './demoSeed'

// The demo keeps its data in this browser (localStorage), so changes survive a reload.
// Every date moves forward by the days since it was first set up, to keep it looking current.

const STORAGE_KEY = 'rayons:demo'
const SEEDED_KEY = 'rayons:demo-seeded'

function load(): DemoData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const seeded = Number(localStorage.getItem(SEEDED_KEY))
    if (raw && seeded) {
      const data = JSON.parse(raw) as DemoData
      if (data.version === DEMO_VERSION) return shift(data, Math.round((startOfDay(new Date()).getTime() - seeded) / DAY_MS))
    }
  } catch {
    // Unreadable or blocked storage: start over.
  }
  return createDemoData()
}

function shift(data: DemoData, days: number): DemoData {
  if (days <= 0) return data
  const iso = (value: string) => new Date(new Date(value).getTime() + days * DAY_MS).toISOString()
  const dayOrIso = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return iso(value)
    const date = parseDate(value)
    date.setDate(date.getDate() + days)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  for (const thread of data.threads) for (const message of thread.messages) message.date = iso(message.date)
  for (const event of data.events) {
    event.start = event.allDay ? dayOrIso(event.start) : iso(event.start)
    event.end = event.allDay ? dayOrIso(event.end) : iso(event.end)
  }
  return data
}

export function resetDemo() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(SEEDED_KEY)
  } catch {
    // Nothing to clear.
  }
}

const placeholder = (name: string) =>
  URL.createObjectURL(new Blob([`This is a demo file (${name}). Connect your Google account to see real attachments.`], { type: 'text/plain' }))

export function createDemoBackend(): Backend {
  const data = load()
  const uploads = new Map<string, Blob>()

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      localStorage.setItem(SEEDED_KEY, String(startOfDay(new Date()).getTime()))
    } catch {
      // Private mode or full storage: the demo still works for this visit.
    }
  }
  save()

  const findThread = (id: string) => {
    const thread = data.threads.find((t) => t.id === id)
    if (!thread) throw new Error('Thread not found')
    return thread
  }
  const findEvent = (id: string) => {
    const event = data.events.find((e) => e.id === id)
    if (!event) throw new Error('Event not found')
    return event
  }
  const findProject = (id: string) => {
    const project = data.projects.find((p) => p.id === id)
    if (!project) throw new Error('Project not found')
    return project
  }

  const summary = (thread: DemoThread): ThreadSummary => {
    const last = thread.messages[thread.messages.length - 1]
    return {
      id: thread.id,
      subject: thread.subject,
      snippet: last.snippet,
      from: last.from,
      date: last.date,
      unread: thread.unread,
      archived: thread.archived,
      spam: thread.spam,
      tag: thread.tag,
      projectId: thread.projectId,
      messageCount: thread.messages.length,
      hasAttachments: thread.messages.some((m) => m.attachments.length > 0),
      canUnsubscribe: thread.canUnsubscribe,
    }
  }

  const live = (thread: DemoThread) => !thread.trashed && !thread.spam

  const withRollup = (project: DemoData['projects'][number]): Project => {
    const tags = new Set<TagId>()
    let unreadCount = 0
    for (const thread of data.threads) {
      if (thread.projectId !== project.id || !live(thread)) continue
      if (thread.tag) tags.add(thread.tag)
      if (thread.unread) unreadCount++
    }
    for (const event of data.events) if (event.projectId === project.id && event.tag) tags.add(event.tag)
    return { ...project, tags: TAGS.filter((tag) => tags.has(tag)), unreadCount }
  }

  const byDateDesc = (a: ThreadSummary, b: ThreadSummary) => b.date.localeCompare(a.date)
  const touch = (projectId: string | null) => {
    if (projectId) findProject(projectId).updatedAt = new Date().toISOString()
  }

  const mailFiles = (projectId: string): ProjectFile[] =>
    data.threads
      .filter((thread) => thread.projectId === projectId && live(thread))
      .flatMap((thread) =>
        thread.messages.flatMap((message) =>
          message.attachments.map((attachment) => ({
            id: `${message.id}:${attachment.id}`,
            projectId,
            name: attachment.filename,
            size: attachment.size,
            mimeType: attachment.mimeType,
            source: 'mail' as const,
            createdAt: message.date,
            messageId: message.id,
            attachmentId: attachment.id,
          })),
        ),
      )

  const overlaps = (event: CalendarEvent, from: Date, to: Date) => parseDate(event.start) < to && parseDate(event.end) > from

  const done = <T,>(value: T) => {
    save()
    return Promise.resolve(value)
  }

  return {
    kind: 'demo',
    account: DEMO_ACCOUNT,

    async listThreads(query) {
      const search = query.search?.trim().toLowerCase()
      return data.threads
        .filter((thread) => {
          if (thread.trashed) return false
          if (query.projectId) {
            if (thread.projectId !== query.projectId || thread.spam) return false
          } else if (query.box === 'spam') {
            if (!thread.spam) return false
          } else if (thread.spam || thread.archived !== (query.box === 'archived')) {
            return false
          }
          if (query.tag && query.tag !== 'all' && thread.tag !== query.tag) return false
          if (search) {
            const haystack = [thread.subject, ...thread.messages.flatMap((m) => [m.from.name, m.from.email, m.text])].join(' ').toLowerCase()
            if (!haystack.includes(search)) return false
          }
          return true
        })
        .map(summary)
        .sort(byDateDesc)
    },

    async getThread(id) {
      const thread = findThread(id)
      return { ...summary(thread), messages: thread.messages } satisfies Thread
    },

    async setThreadTag(id, tag) {
      findThread(id).tag = tag
      return done(undefined)
    },

    async setThreadProject(id, projectId) {
      const thread = findThread(id)
      touch(thread.projectId)
      thread.projectId = projectId
      touch(projectId)
      return done(undefined)
    },

    async setThreadRead(id, read) {
      findThread(id).unread = !read
      return done(undefined)
    },

    async setThreadArchived(id, archived) {
      findThread(id).archived = archived
      return done(undefined)
    },

    async trashThread(id) {
      findThread(id).trashed = true
      return done(undefined)
    },

    async setThreadSpam(id, spam) {
      const thread = findThread(id)
      thread.spam = spam
      if (spam) thread.archived = false
      return done(undefined)
    },

    async unsubscribe(id) {
      findThread(id).canUnsubscribe = false
      return done({ done: true as const })
    },

    async send(draft) {
      const message = {
        id: `m${Date.now()}`,
        threadId: draft.threadId ?? `t${Date.now()}`,
        from: { name: DEMO_ACCOUNT.name, email: DEMO_ACCOUNT.email },
        to: draft.to,
        cc: draft.cc,
        date: new Date().toISOString(),
        snippet: draft.text.slice(0, 140),
        text: draft.text,
        attachments: [],
      }
      if (draft.threadId) {
        findThread(draft.threadId).messages.push(message)
      } else {
        // Like Gmail, a new conversation you start isn't in your inbox until someone answers.
        data.threads.push({
          id: message.threadId,
          subject: draft.subject || '(no subject)',
          tag: null,
          projectId: null,
          unread: false,
          archived: true,
          spam: false,
          trashed: false,
          canUnsubscribe: false,
          messages: [message],
        })
      }
      return done(undefined)
    },

    async attachmentUrl(_messageId, _attachmentId, filename) {
      return placeholder(filename)
    },

    async listCalendars() {
      return [{ id: 'primary', name: DEMO_ACCOUNT.email, color: '#493886', primary: true, canEdit: true }]
    },

    async listEvents(from, to, options) {
      const start = parseDate(from)
      const end = parseDate(to)
      return data.events
        .filter((event) => overlaps(event, start, end) && (!options?.projectId || event.projectId === options.projectId))
        .sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime())
    },

    async createEvent(draft) {
      const id = `primary|e${Date.now()}`
      const event: CalendarEvent = { calendarId: 'primary', ...draft, id, canEdit: true }
      data.events.push(event)
      touch(event.projectId)
      return done(event)
    },

    async updateEvent(id, patch) {
      const event = findEvent(id)
      touch(event.projectId)
      Object.assign(event, patch)
      touch(event.projectId)
      return done({ ...event })
    },

    async deleteEvent(id) {
      data.events = data.events.filter((event) => event.id !== id)
      return done(undefined)
    },

    async listProjects() {
      return data.projects.map(withRollup).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },

    async getProject(id) {
      return withRollup(findProject(id))
    },

    async createProject(name) {
      const now = new Date().toISOString()
      const project = { id: `p${Date.now()}`, name, notes: '', status: 'active' as const, createdAt: now, updatedAt: now, archivedAt: null }
      data.projects.push(project)
      return done(withRollup(project))
    },

    async updateProject(id, patch) {
      Object.assign(findProject(id), patch, { updatedAt: new Date().toISOString() })
      return done(undefined)
    },

    async setProjectArchived(id, archived) {
      const project = findProject(id)
      project.status = archived ? 'archived' : 'active'
      project.archivedAt = archived ? new Date().toISOString() : null
      if (archived) {
        for (const thread of data.threads) if (thread.projectId === id) thread.archived = true
      }
      return done(undefined)
    },

    async deleteProject(id) {
      data.projects = data.projects.filter((project) => project.id !== id)
      for (const thread of data.threads) if (thread.projectId === id) thread.projectId = null
      for (const event of data.events) if (event.projectId === id) event.projectId = null
      data.files = data.files.filter((file) => file.projectId !== id)
      return done(undefined)
    },

    async listProjectEvents(projectId) {
      return data.events
        .filter((event) => event.projectId === projectId)
        .sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime())
    },

    async listFiles(projectId) {
      const uploaded = data.files.filter((file) => file.projectId === projectId)
      return [...uploaded, ...mailFiles(projectId)]
    },

    async uploadFile(projectId, file) {
      const entry: ProjectFile = {
        id: `f${Date.now()}`,
        projectId,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        source: 'upload',
        createdAt: new Date().toISOString(),
      }
      uploads.set(entry.id, file)
      data.files.push(entry)
      touch(projectId)
      return done(entry)
    },

    async deleteFile(file) {
      data.files = data.files.filter((entry) => entry.id !== file.id)
      uploads.delete(file.id)
      return done(undefined)
    },

    async fileUrl(file) {
      const blob = uploads.get(file.id)
      return blob ? URL.createObjectURL(blob) : placeholder(file.name)
    },
  }
}
