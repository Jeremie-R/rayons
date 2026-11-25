// The Rayons object model. See docs/ARCHITECTURE.md for where each piece is stored.
//
// Mail threads and calendar events live in Google; Rayons reads and writes them there.
// Projects, their notes and uploaded files live in Supabase. A thread or event joins a
// project through a Gmail label or a private event property, so Google stays the record.

/** The fixed set of categories. `null` means untagged, which plays the role of "other". */
export const TAGS = ['admin', 'event', 'buy', 'knowledge'] as const
export type TagId = (typeof TAGS)[number]
export type Tag = TagId | null

export interface Person {
  name: string
  email: string
}

export interface Attachment {
  id: string
  messageId: string
  filename: string
  mimeType: string
  size: number
}

export interface Message {
  id: string
  threadId: string
  from: Person
  to: Person[]
  cc: Person[]
  /** ISO date-time. */
  date: string
  snippet: string
  /** Plain-text body (always present, derived from HTML when the mail only has HTML). */
  text: string
  /** Raw HTML body when the mail has one. Sanitised and sandboxed before display. */
  html?: string
  attachments: Attachment[]
  /** Message-ID header, used to thread replies. */
  messageIdHeader?: string
  references?: string
}

/** The fields shown in a mail list. */
export interface ThreadSummary {
  id: string
  subject: string
  snippet: string
  /** Who the latest message is from. */
  from: Person
  /** Who the latest message went to (shown in Sent). */
  to: Person[]
  /** ISO date-time of the latest message. */
  date: string
  unread: boolean
  /** Not in the inbox any more. */
  archived: boolean
  spam: boolean
  tag: Tag
  projectId: string | null
  messageCount: number
  hasAttachments: boolean
  /** Sender offers a one-click or mailto unsubscribe. */
  canUnsubscribe: boolean
}

export interface Thread extends ThreadSummary {
  messages: Message[]
}

export type MailBox = 'inbox' | 'archived' | 'spam' | 'sent'

export interface ThreadQuery {
  box: MailBox
  tag?: TagId | 'all'
  projectId?: string
  search?: string
}

export interface CalendarInfo {
  id: string
  name: string
  color: string
  primary: boolean
  canEdit: boolean
}

export interface CalendarEvent {
  /** Unique across calendars: `${calendarId}|${eventId}`. */
  id: string
  calendarId: string
  title: string
  /**
   * Timed events: ISO date-time with offset. All-day events: `YYYY-MM-DD`, with `end`
   * exclusive (the day after the last day), as Google stores them.
   */
  start: string
  end: string
  allDay: boolean
  location: string
  description: string
  tag: Tag
  projectId: string | null
  /** The mail conversation this event came from or belongs with, with or without a project. */
  threadId: string | null
  /** Opens the event in Google Calendar. */
  link?: string
  /** False for events you were invited to and can't move. */
  canEdit: boolean
}

export type EventDraft = Pick<CalendarEvent, 'title' | 'start' | 'end' | 'allDay' | 'location' | 'description' | 'tag' | 'projectId' | 'threadId'> & {
  calendarId?: string
}

export interface Project {
  id: string
  name: string
  notes: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  /** Rolled up from the tags of its threads and events (never set by hand). */
  tags: TagId[]
  /** Unread mail in this project. Shown on archived projects as "there's news". */
  unreadCount: number
}

export interface ProjectFile {
  id: string
  projectId: string
  name: string
  size: number
  mimeType: string
  /** Uploaded to the project, or an attachment of one of its mails. */
  source: 'upload' | 'mail'
  createdAt: string
  /** For mail attachments. */
  messageId?: string
  attachmentId?: string
}

export interface Draft {
  to: Person[]
  cc: Person[]
  subject: string
  text: string
  /** Replying in a thread. */
  threadId?: string
}

export interface Account {
  email: string
  name: string
  picture?: string
}
