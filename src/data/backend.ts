import type {
  Account,
  CalendarEvent,
  CalendarInfo,
  Draft,
  EventDraft,
  Project,
  ProjectFile,
  Tag,
  Thread,
  ThreadQuery,
  ThreadSummary,
} from '../lib/types'

/**
 * Everything the screens can ask for. Two implementations:
 * - `demoBackend` keeps made-up mail, events and projects in this browser (no account needed).
 * - `liveBackend` talks to Gmail and Google Calendar through our api/ functions, and to Supabase.
 */
export interface Backend {
  kind: 'demo' | 'live'
  account: Account

  // Mail
  listThreads(query: ThreadQuery): Promise<ThreadSummary[]>
  getThread(id: string): Promise<Thread>
  setThreadTag(id: string, tag: Tag): Promise<void>
  setThreadProject(id: string, projectId: string | null): Promise<void>
  setThreadRead(id: string, read: boolean): Promise<void>
  setThreadArchived(id: string, archived: boolean): Promise<void>
  trashThread(id: string): Promise<void>
  setThreadSpam(id: string, spam: boolean): Promise<void>
  /** Unsubscribes when the sender allows it in one click; otherwise returns a page or mailto to open. */
  unsubscribe(id: string): Promise<{ done: true } | { open: string }>
  send(draft: Draft): Promise<void>
  /** Opens or downloads an attachment. */
  attachmentUrl(messageId: string, attachmentId: string, filename: string, mimeType: string): Promise<string>

  /** Translation through a service (when the browser can't translate on the device). */
  translate(texts: string[], target: string, format?: 'text' | 'html'): Promise<{ text: string; source: string }[]>

  // Calendar
  listCalendars(): Promise<CalendarInfo[]>
  /** Events overlapping [from, to), ISO dates. */
  listEvents(from: string, to: string, options?: { projectId?: string }): Promise<CalendarEvent[]>
  /** Events linked to a mail conversation (any date). */
  listThreadEvents(threadId: string): Promise<CalendarEvent[]>
  createEvent(draft: EventDraft): Promise<CalendarEvent>
  updateEvent(id: string, patch: Partial<EventDraft>): Promise<CalendarEvent>
  deleteEvent(id: string): Promise<void>

  // Projects
  listProjects(): Promise<Project[]>
  getProject(id: string): Promise<Project>
  createProject(name: string): Promise<Project>
  updateProject(id: string, patch: { name?: string; notes?: string }): Promise<void>
  /** Archiving a project also archives its mail; un-archiving leaves the mail where it is. */
  setProjectArchived(id: string, archived: boolean): Promise<void>
  deleteProject(id: string): Promise<void>
  listProjectEvents(projectId: string): Promise<CalendarEvent[]>
  listFiles(projectId: string): Promise<ProjectFile[]>
  uploadFile(projectId: string, file: File): Promise<ProjectFile>
  deleteFile(file: ProjectFile): Promise<void>
  fileUrl(file: ProjectFile): Promise<string>
}
