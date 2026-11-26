import type { Contact } from './types'

// Pictures for people: a Google Contacts photo when there is one, otherwise the company's logo
// for mail from a company domain (see api/logo), otherwise the first letter.

/** Personal mail providers: their logo would say nothing about the person. */
const PERSONAL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'ymail.com', 'icloud.com',
  'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.de', 'gmx.net', 'web.de', 'mail.com',
  'zoho.com', 'yandex.com', 'yandex.ru', 'mail.ru', 'hey.com', 'fastmail.com', 'tutanota.com', 'tuta.io', 'orange.fr', 'free.fr',
  'laposte.net', 'sfr.fr', 'wanadoo.fr', 'hotmail.fr', 'live.fr', 'yahoo.fr', 'outlook.fr', 'telia.com', 'comhem.se', 'bredband.net',
  'qq.com', '163.com', 'naver.com',
])

const photos = new Map<string, string>()

export function rememberPhotos(contacts: Contact[]) {
  for (const contact of contacts) if (contact.photo) photos.set(contact.email.toLowerCase(), contact.photo)
}

export function pictureFor(email: string): string | null {
  const address = email.trim().toLowerCase()
  const photo = photos.get(address)
  if (photo) return photo
  const domain = address.split('@')[1]
  if (!domain || PERSONAL.has(domain) || /(^|\.)(example\.(com|org|net)|[a-z0-9-]+\.(example|test|invalid|localhost|local))$/.test(domain) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null
  return `/api/logo?domain=${encodeURIComponent(domain)}`
}
