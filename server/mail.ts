import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { Attachment, Draft, Message, Person, ProjectFile, TagId, Thread, ThreadQuery, ThreadSummary } from '../src/lib/types.js'
import { GMAIL, inParallel, type Google } from './google.js'
import { HttpError } from './http.js'
import { adminClient } from './supabase.js'

// Gmail ↔ Rayons. Tags are Gmail labels "Rayons/admin"…; a project is a label
// "Rayons/Projects/<name>". Read/unread, archived and spam are Gmail's own labels.

const TAGS: TagId[] = ['admin', 'event', 'buy', 'knowledge']

interface GHeader {
  name: string
  value: string
}
interface GPart {
  partId?: string
  mimeType: string
  filename?: string
  headers?: GHeader[]
  body?: { size: number; data?: string; attachmentId?: string }
  parts?: GPart[]
}
interface GMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate: string
  payload: GPart
}
interface GThread {
  id: string
  messages?: GMessage[]
}
interface GLabel {
  id: string
  name: string
}

export interface ProjectRow {
  id: string
  name: string
  status: 'active' | 'archived'
  gmail_label_id: string | null
}

export async function projectsOf(userId: string): Promise<ProjectRow[]> {
  const { data, error } = await adminClient().from('projects').select('id, name, status, gmail_label_id').eq('user_id', userId)
  if (error) throw error
  return data as ProjectRow[]
}

export async function projectOf(userId: string, projectId: string): Promise<ProjectRow> {
  const { data, error } = await adminClient().from('projects').select('id, name, status, gmail_label_id').eq('user_id', userId).eq('id', projectId).maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'not_found', 'That project does not exist any more.')
  return data as ProjectRow
}

// Labels ------------------------------------------------------------------------------------------

const labelName = (projectName: string) => `Rayons/Projects/${projectName.replace(/\//g, '∕').trim()}`

async function findOrCreateLabel(google: Google, name: string, existing?: GLabel[]): Promise<string> {
  const labels = existing ?? (await google.request<{ labels: GLabel[] }>(`${GMAIL}/labels`)).labels
  const found = labels.find((label) => label.name.toLowerCase() === name.toLowerCase())
  if (found) return found.id
  // Gmail shows "A/B" nested only when "A" exists.
  const parent = name.split('/').slice(0, -1).join('/')
  if (parent && !labels.some((label) => label.name.toLowerCase() === parent.toLowerCase())) await findOrCreateLabel(google, parent, labels)
  try {
    const created = await google.request<GLabel>(`${GMAIL}/labels`, {
      method: 'POST',
      body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }),
    })
    labels.push(created)
    return created.id
  } catch (error) {
    // Another request created it a moment ago (two screens loading at once): use that one.
    if (!(error instanceof HttpError && error.status === 409)) throw error
    const fresh = (await google.request<{ labels: GLabel[] }>(`${GMAIL}/labels`)).labels
    const found = fresh.find((label) => label.name.toLowerCase() === name.toLowerCase())
    if (!found) throw error
    labels.push(found)
    return found.id
  }
}

export async function tagLabels(google: Google): Promise<Record<TagId, string>> {
  const cached = google.account.tag_labels as Partial<Record<TagId, string>>
  if (TAGS.every((tag) => cached[tag])) return cached as Record<TagId, string>
  const { labels } = await google.request<{ labels: GLabel[] }>(`${GMAIL}/labels`)
  const map = {} as Record<TagId, string>
  for (const tag of TAGS) map[tag] = await findOrCreateLabel(google, `Rayons/${tag}`, labels)
  await adminClient().from('google_accounts').update({ tag_labels: map }).eq('id', google.account.id)
  google.account.tag_labels = map
  return map
}

export async function projectLabel(google: Google, project: ProjectRow): Promise<string> {
  if (project.gmail_label_id) return project.gmail_label_id
  const id = await findOrCreateLabel(google, labelName(project.name))
  await adminClient().from('projects').update({ gmail_label_id: id }).eq('id', project.id)
  project.gmail_label_id = id
  return id
}

export async function renameProjectLabel(google: Google, project: ProjectRow) {
  if (!project.gmail_label_id) return
  await google.request(`${GMAIL}/labels/${project.gmail_label_id}`, { method: 'PATCH', body: JSON.stringify({ name: labelName(project.name) }) })
}

export async function deleteProjectLabel(google: Google, project: ProjectRow) {
  if (!project.gmail_label_id) return
  await google.request(`${GMAIL}/labels/${project.gmail_label_id}`, { method: 'DELETE' }).catch((error) => {
    if (!(error instanceof HttpError && error.status === 404)) throw error
  })
}

// Reading -----------------------------------------------------------------------------------------

const header = (part: GPart | undefined, name: string) => part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

function decodeEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/** `"Last, First" <a@b.c>, d@e.f` → people. */
export function parseAddresses(value: string): Person[] {
  const people: Person[] = []
  let current = ''
  let quoted = false
  let angle = false
  for (const char of value) {
    if (char === '"') quoted = !quoted
    if (char === '<') angle = true
    if (char === '>') angle = false
    if (char === ',' && !quoted && !angle) {
      people.push(parseAddress(current))
      current = ''
    } else current += char
  }
  if (current.trim()) people.push(parseAddress(current))
  return people.filter((p) => p.email)
}

function parseAddress(value: string): Person {
  const match = value.trim().match(/^(.*?)\s*<([^>]+)>$/)
  if (match) return { name: match[1].trim().replace(/^"|"$/g, '').replace(/\\"/g, '"'), email: match[2].trim() }
  return { name: '', email: value.trim() }
}

function summarize(thread: GThread, tags: Record<TagId, string>, projects: ProjectRow[]): ThreadSummary {
  const messages = (thread.messages ?? []).filter((m) => !m.labelIds?.includes('DRAFT'))
  const all = messages.length ? messages : (thread.messages ?? [])
  const first = all[0]
  const last = all[all.length - 1]
  const labels = new Set(all.flatMap((m) => m.labelIds ?? []))
  const tag = TAGS.find((t) => labels.has(tags[t])) ?? null
  const project = projects.find((p) => p.gmail_label_id && labels.has(p.gmail_label_id))
  return {
    id: thread.id,
    subject: header(first?.payload, 'Subject') || '(no subject)',
    snippet: decodeEntities(last?.snippet ?? ''),
    from: parseAddresses(header(last?.payload, 'From'))[0] ?? { name: '', email: '' },
    date: new Date(Number(last?.internalDate ?? 0)).toISOString(),
    unread: labels.has('UNREAD'),
    archived: !labels.has('INBOX'),
    spam: labels.has('SPAM'),
    tag,
    projectId: project?.id ?? null,
    messageCount: all.length,
    hasAttachments: all.some((m) => m.payload?.mimeType === 'multipart/mixed'),
    canUnsubscribe: all.some((m) => !!header(m.payload, 'List-Unsubscribe')),
  }
}

const METADATA = ['From', 'To', 'Subject', 'Date', 'List-Unsubscribe', 'List-Unsubscribe-Post'].map((h) => `metadataHeaders=${h}`).join('&')

export async function listThreads(google: Google, userId: string, query: ThreadQuery): Promise<ThreadSummary[]> {
  const [tags, projects] = await Promise.all([tagLabels(google), projectsOf(userId)])
  const labelIds: string[] = []
  const q: string[] = []
  let includeSpamTrash = false

  if (query.projectId) {
    const project = projects.find((p) => p.id === query.projectId)
    if (!project?.gmail_label_id) return []
    labelIds.push(project.gmail_label_id)
    q.push('-in:spam', '-in:trash')
  } else if (query.box === 'inbox') {
    labelIds.push('INBOX')
  } else if (query.box === 'spam') {
    labelIds.push('SPAM')
    includeSpamTrash = true
  } else {
    q.push('-in:inbox', '-in:spam', '-in:trash', '-in:drafts', '-in:chats')
  }
  if (query.tag && query.tag !== 'all') labelIds.push(tags[query.tag])
  if (query.search?.trim()) q.push(query.search.trim().slice(0, 300))

  const params = new URLSearchParams({ maxResults: '50' })
  for (const id of labelIds) params.append('labelIds', id)
  if (q.length) params.set('q', q.join(' '))
  if (includeSpamTrash) params.set('includeSpamTrash', 'true')

  const list = await google.request<{ threads?: { id: string }[] }>(`${GMAIL}/threads?${params}`)
  const threads = await inParallel(list.threads ?? [], 10, (t) => google.request<GThread>(`${GMAIL}/threads/${t.id}?format=metadata&${METADATA}`))
  return threads.filter((t) => t.messages?.length).map((t) => summarize(t, tags, projects))
}

function decodeBody(part: GPart): string {
  if (!part.body?.data) return ''
  const bytes = Buffer.from(part.body.data, 'base64url')
  const charset = header(part, 'Content-Type').match(/charset="?([^";\s]+)/i)?.[1] ?? 'utf-8'
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|h\d|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function toMessage(message: GMessage): Message {
  let text = ''
  let html = ''
  const attachments: Attachment[] = []
  const walk = (part: GPart) => {
    const disposition = header(part, 'Content-Disposition').toLowerCase()
    if (part.filename && part.body?.attachmentId) {
      // Inline pictures referenced by the HTML (logos, signatures) aren't listed as attachments.
      if (!(disposition.startsWith('inline') && header(part, 'Content-ID'))) {
        attachments.push({ id: part.body.attachmentId, messageId: message.id, filename: part.filename, mimeType: part.mimeType, size: part.body.size })
      }
      return
    }
    if (part.mimeType === 'text/plain' && !text && !disposition.startsWith('attachment')) text = decodeBody(part)
    else if (part.mimeType === 'text/html' && !html && !disposition.startsWith('attachment')) html = decodeBody(part)
    for (const child of part.parts ?? []) walk(child)
  }
  walk(message.payload)
  const payload = message.payload
  return {
    id: message.id,
    threadId: message.threadId,
    from: parseAddresses(header(payload, 'From'))[0] ?? { name: '', email: '' },
    to: parseAddresses(header(payload, 'To')),
    cc: parseAddresses(header(payload, 'Cc')),
    date: new Date(Number(message.internalDate)).toISOString(),
    snippet: decodeEntities(message.snippet ?? ''),
    text: text || htmlToText(html),
    html: html || undefined,
    attachments,
    messageIdHeader: header(payload, 'Message-ID') || header(payload, 'Message-Id') || undefined,
    references: header(payload, 'References') || undefined,
  }
}

export async function getThread(google: Google, userId: string, id: string): Promise<Thread> {
  const [thread, tags, projects] = await Promise.all([google.request<GThread>(`${GMAIL}/threads/${encodeURIComponent(id)}?format=full`), tagLabels(google), projectsOf(userId)])
  const messages = (thread.messages ?? []).filter((m) => !m.labelIds?.includes('DRAFT')).map(toMessage)
  return { ...summarize(thread, tags, projects), messages }
}

// Changing ----------------------------------------------------------------------------------------

export async function modifyThread(google: Google, id: string, add: string[], remove: string[]) {
  await google.request(`${GMAIL}/threads/${encodeURIComponent(id)}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove.filter((label) => !add.includes(label)) }),
  })
}

export async function setTag(google: Google, id: string, tag: TagId | null) {
  const tags = await tagLabels(google)
  await modifyThread(google, id, tag ? [tags[tag]] : [], Object.values(tags))
}

/** Puts a thread in one project (or none), returning the projects whose numbers changed. */
export async function setProject(google: Google, userId: string, id: string, projectId: string | null) {
  const projects = await projectsOf(userId)
  const target = projectId ? projects.find((p) => p.id === projectId) : undefined
  if (projectId && !target) throw new HttpError(404, 'not_found', 'That project does not exist any more.')
  const add = target ? [await projectLabel(google, target)] : []
  const others = projects.filter((p) => p.gmail_label_id && p.id !== projectId)
  const thread = await google.request<GThread>(`${GMAIL}/threads/${encodeURIComponent(id)}?format=minimal`)
  const labels = new Set((thread.messages ?? []).flatMap((m) => m.labelIds ?? []))
  const previous = others.filter((p) => labels.has(p.gmail_label_id!))
  await modifyThread(google, id, add, previous.map((p) => p.gmail_label_id!))
  return [...previous.map((p) => p.id), ...(target ? [target.id] : [])]
}

export async function projectOfThread(google: Google, userId: string, id: string) {
  const projects = (await projectsOf(userId)).filter((p) => p.gmail_label_id)
  if (!projects.length) return null
  const thread = await google.request<GThread>(`${GMAIL}/threads/${encodeURIComponent(id)}?format=minimal`)
  const labels = new Set((thread.messages ?? []).flatMap((m) => m.labelIds ?? []))
  return projects.find((p) => labels.has(p.gmail_label_id!))?.id ?? null
}

async function threadIdsWithLabels(google: Google, labelIds: string[], limit = 500) {
  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({ maxResults: '100' })
    for (const id of labelIds) params.append('labelIds', id)
    if (pageToken) params.set('pageToken', pageToken)
    const page = await google.request<{ threads?: { id: string }[]; nextPageToken?: string }>(`${GMAIL}/threads?${params}`)
    ids.push(...(page.threads ?? []).map((t) => t.id))
    pageToken = page.nextPageToken
  } while (pageToken && ids.length < limit)
  return ids
}

/** Archiving a project archives its conversations too. */
export async function archiveProjectMail(google: Google, project: ProjectRow) {
  if (!project.gmail_label_id) return
  const ids = await threadIdsWithLabels(google, [project.gmail_label_id, 'INBOX'])
  await inParallel(ids, 5, (id) => modifyThread(google, id, [], ['INBOX']))
}

/** Tags in use and unread conversations in a project's mail. */
export async function projectMailStats(google: Google, project: ProjectRow) {
  if (!project.gmail_label_id) return { tags: [] as TagId[], unread: 0 }
  const tags = await tagLabels(google)
  const label = project.gmail_label_id
  const [present, unread] = await Promise.all([
    inParallel(TAGS, 4, async (tag) => {
      const page = await google.request<{ threads?: unknown[] }>(`${GMAIL}/threads?maxResults=1&labelIds=${label}&labelIds=${tags[tag]}`)
      return page.threads?.length ? tag : null
    }),
    threadIdsWithLabels(google, [label, 'UNREAD'], 100),
  ])
  return { tags: present.filter((t): t is TagId => t !== null), unread: unread.length }
}

export async function projectAttachments(google: Google, project: ProjectRow): Promise<ProjectFile[]> {
  if (!project.gmail_label_id) return []
  const list = await google.request<{ threads?: { id: string }[] }>(`${GMAIL}/threads?maxResults=30&labelIds=${project.gmail_label_id}&q=${encodeURIComponent('has:attachment -in:trash -in:spam')}`)
  const threads = await inParallel(list.threads ?? [], 5, (t) => google.request<GThread>(`${GMAIL}/threads/${t.id}?format=full`))
  return threads.flatMap((thread) =>
    (thread.messages ?? []).map(toMessage).flatMap((message) =>
      message.attachments.map((attachment) => ({
        id: `${message.id}:${attachment.id}`,
        projectId: project.id,
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
}

export async function attachment(google: Google, messageId: string, attachmentId: string) {
  const body = await google.request<{ data: string; size: number }>(`${GMAIL}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`)
  return Buffer.from(body.data, 'base64url')
}

// Sending -----------------------------------------------------------------------------------------

const encodeWord = (text: string) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`)
const address = (p: Person) => {
  if (!/^[^\s@<>,"]+@[^\s@<>,"]+$/.test(p.email)) throw new HttpError(400, 'bad_address', `"${p.email}" is not an email address.`)
  return p.name ? `${encodeWord(p.name.replace(/"/g, ''))} <${p.email}>` : p.email
}

export async function send(google: Google, draft: Draft) {
  if (!draft.to.length) throw new HttpError(400, 'bad_address', 'Add at least one recipient.')
  const headers = [
    `From: ${address({ name: google.account.name ?? '', email: google.account.email })}`,
    `To: ${draft.to.map(address).join(', ')}`,
    ...(draft.cc.length ? [`Cc: ${draft.cc.map(address).join(', ')}`] : []),
    `Subject: ${encodeWord(draft.subject.replace(/[\r\n]+/g, ' '))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ]
  let threadId: string | undefined
  if (draft.threadId) {
    // Thread the reply properly: read the ids from Gmail rather than trusting the browser.
    const thread = await google.request<GThread>(`${GMAIL}/threads/${encodeURIComponent(draft.threadId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`)
    const last = thread.messages?.[thread.messages.length - 1]
    const messageId = header(last?.payload, 'Message-ID')
    if (messageId) {
      headers.push(`In-Reply-To: ${messageId}`, `References: ${[header(last?.payload, 'References'), messageId].filter(Boolean).join(' ')}`)
    }
    threadId = thread.id
  }
  const body = Buffer.from(draft.text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n')
  const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`).toString('base64url')
  await google.request(`${GMAIL}/messages/send`, { method: 'POST', body: JSON.stringify({ raw, threadId }) })
}

// Unsubscribing -----------------------------------------------------------------------------------

function isPrivateAddress(ip: string) {
  if (ip.includes(':')) {
    const lower = ip.toLowerCase()
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7))
    return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

async function isPublicHttps(url: URL) {
  if (url.protocol !== 'https:' || (url.port && url.port !== '443')) return false
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return !isPrivateAddress(host)
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false
  const addresses = await lookup(host, { all: true }).catch(() => [])
  return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address))
}

/**
 * RFC 8058 one-click when the sender supports it (we POST for you). Otherwise the
 * unsubscribe page or a mailto: link for the person to finish.
 */
export async function unsubscribe(google: Google, id: string): Promise<{ done: true } | { open: string }> {
  const thread = await google.request<GThread>(`${GMAIL}/threads/${encodeURIComponent(id)}?format=metadata&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Unsubscribe-Post`)
  const message = [...(thread.messages ?? [])].reverse().find((m) => header(m.payload, 'List-Unsubscribe'))
  if (!message) throw new HttpError(400, 'no_unsubscribe', 'This sender did not include a way to unsubscribe.')
  const links = [...header(message.payload, 'List-Unsubscribe').matchAll(/<([^>]+)>/g)].map((m) => m[1].trim())
  const https = links.find((link) => link.startsWith('https://'))
  const oneClick = /List-Unsubscribe=One-Click/i.test(header(message.payload, 'List-Unsubscribe-Post'))
  if (https && oneClick && (await isPublicHttps(new URL(https)))) {
    const response = await fetch(https, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    }).catch(() => null)
    if (response && response.status < 400) return { done: true }
  }
  const page = https ?? links.find((link) => link.startsWith('http://'))
  if (page) return { open: page }
  const mailto = links.find((link) => link.startsWith('mailto:'))
  if (mailto) return { open: mailto }
  throw new HttpError(400, 'no_unsubscribe', 'This sender did not include a way to unsubscribe.')
}
