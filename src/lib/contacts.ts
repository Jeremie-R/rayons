import type { Contact, Person, Thread } from './types'

// Who to suggest when you type a name in To, Cc or Bcc.

/** Robots: never worth remembering or suggesting. */
const AUTOMATED = /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|mailer-daemon|postmaster|bounces?|newsletters?|marketing|updates|alerts?|receipts?)([+._-].*)?@|@(.*\.)?(bounces?|newsletters?|mailer|mg|sendgrid|mcsv|rsgsv|ccsend)\./i

export const isAutomated = (email: string) => AUTOMATED.test(email)

export const isEmail = (value: string) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/.test(value.trim())

/** Everyone in a conversation except you and robots. */
export function participants(thread: Thread, me: string): Person[] {
  const seen = new Map<string, Person>()
  for (const message of thread.messages) {
    for (const person of [message.from, ...message.to, ...message.cc]) {
      const email = person.email.toLowerCase()
      if (email === me.toLowerCase() || isAutomated(email) || !isEmail(email)) continue
      if (!seen.has(email) || (!seen.get(email)!.name && person.name)) seen.set(email, { name: person.name, email })
    }
  }
  return [...seen.values()]
}

const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Best matches for what was typed: names by word start, addresses by start of either part. */
export function suggestContacts(contacts: Contact[], query: string, exclude: string[] = [], limit = 6): Contact[] {
  const q = fold(query.trim())
  if (!q) return []
  const skip = new Set(exclude.map((email) => email.toLowerCase()))
  const now = Date.now()
  const scored: { contact: Contact; score: number }[] = []
  for (const contact of contacts) {
    if (skip.has(contact.email.toLowerCase())) continue
    const name = fold(contact.name)
    const email = contact.email.toLowerCase()
    const [local, domain = ''] = email.split('@')
    let match = 0
    if (name.startsWith(q) || local.startsWith(q)) match = 3
    else if (name.split(/[\s.\-']+/).some((word) => word.startsWith(q)) || email.startsWith(q)) match = 2
    else if (domain.startsWith(q) || (q.length > 2 && (name.includes(q) || email.includes(q)))) match = 1
    if (!match) continue
    const days = (now - new Date(contact.lastSeen).getTime()) / 86_400_000
    const use = contact.sent * 4 + contact.seen + (contact.source === 'google' ? 2 : 0)
    scored.push({ contact, score: match * 100 + Math.min(use, 60) + Math.max(0, 30 - days) })
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.contact)
}

/** "Sam <sam@x.com>", "sam@x.com", '"Sam, Jr" <sam@x.com>' → a person (or null). */
export function parseAddress(value: string): Person | null {
  const text = value.trim().replace(/[,;]+$/, '')
  const match = text.match(/^(.*)<([^>]+)>$/)
  const person = match ? { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() } : { name: '', email: text }
  return isEmail(person.email) ? person : null
}
