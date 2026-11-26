import type { Google } from './google.js'
import { HttpError } from './http.js'
import { adminClient } from './supabase.js'

// Google Contacts → Rayons. "Other contacts" are the people Gmail remembers on its own (anyone
// you wrote to or answered); together with your saved contacts they are what Gmail suggests.

export const CONTACT_SCOPES = ['https://www.googleapis.com/auth/contacts.readonly', 'https://www.googleapis.com/auth/contacts.other.readonly']
const PEOPLE = 'https://people.googleapis.com/v1'
const MAX_PAGES = 10

interface PersonResource {
  names?: { displayName?: string; metadata?: { primary?: boolean } }[]
  emailAddresses?: { value?: string; metadata?: { primary?: boolean } }[]
  photos?: { url?: string; default?: boolean }[]
}

interface Row {
  user_id: string
  email: string
  name: string
  source: 'google'
  photo_url: string | null
}

const primary = <T extends { metadata?: { primary?: boolean } }>(items: T[] | undefined) => items?.find((item) => item.metadata?.primary) ?? items?.[0]

export async function importContacts(google: Google, userId: string) {
  const granted = google.account.scopes ?? []
  if (!CONTACT_SCOPES.every((scope) => granted.includes(scope))) {
    throw new HttpError(403, 'needs_contacts_scope', 'Rayons needs your permission to read your Google contacts.')
  }
  const rows = new Map<string, Row>()
  const add = (person: PersonResource, saved: boolean) => {
    const name = primary(person.names)?.displayName?.trim() ?? ''
    const photo = person.photos?.find((p) => p.url && !p.default)?.url ?? null
    for (const address of person.emailAddresses ?? []) {
      const email = address.value?.trim().toLowerCase()
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue
      // Saved contacts win over Gmail's automatic ones.
      if (rows.has(email) && !saved) continue
      rows.set(email, { user_id: userId, email, name, source: 'google', photo_url: photo })
    }
  }

  const pages = async <T>(first: string, list: (page: T & { nextPageToken?: string }) => PersonResource[] | undefined, saved: boolean) => {
    let token: string | undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = await google.request<T & { nextPageToken?: string }>(`${first}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`)
      for (const person of list(body) ?? []) add(person, saved)
      token = body.nextPageToken
      if (!token) break
    }
  }

  await pages<{ connections?: PersonResource[] }>(`${PEOPLE}/people/me/connections?personFields=names,emailAddresses,photos&pageSize=1000`, (page) => page.connections, true)
  await pages<{ otherContacts?: PersonResource[] }>(`${PEOPLE}/otherContacts?readMask=names,emailAddresses,photos&pageSize=1000`, (page) => page.otherContacts, false)

  const all = [...rows.values()]
  const db = adminClient()
  for (let start = 0; start < all.length; start += 500) {
    const { error } = await db.from('contacts').upsert(all.slice(start, start + 500), { onConflict: 'user_id,email' })
    if (error) throw error
  }
  return { count: all.length }
}
