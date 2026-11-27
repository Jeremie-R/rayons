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

const edgeColours = new Map<string, string | null>()

/**
 * The colour around a logo's edge, when most of the edge is one opaque colour (a favicon on a
 * purple square, say). The circle is filled with it so the logo doesn't float on white.
 * Logos come from our own /api/logo, so the canvas can read them. Measured once per logo.
 */
export function edgeColour(image: HTMLImageElement): string | null {
  const key = image.currentSrc || image.src
  if (edgeColours.has(key)) return edgeColours.get(key)!
  let colour: string | null = null
  try {
    const size = 24
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context) {
      context.drawImage(image, 0, 0, size, size)
      const { data } = context.getImageData(0, 0, size, size)
      // Pixels just inside the border (skipping rounded or anti-aliased corners), grouped by
      // rough colour.
      const groups = new Map<number, { n: number; r: number; g: number; b: number }>()
      let total = 0
      for (let i = 2; i < size - 2; i++) {
        for (const [x, y] of [[i, 1], [i, size - 2], [1, i], [size - 2, i]]) {
          const at = (y * size + x) * 4
          total++
          if (data[at + 3] < 220) continue
          const [r, g, b] = [data[at], data[at + 1], data[at + 2]]
          const bucket = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
          const group = groups.get(bucket) ?? { n: 0, r: 0, g: 0, b: 0 }
          group.n++
          group.r += r
          group.g += g
          group.b += b
          groups.set(bucket, group)
        }
      }
      const best = [...groups.values()].sort((a, b) => b.n - a.n)[0]
      if (best && best.n >= total * 0.6) {
        const [r, g, b] = [best.r, best.g, best.b].map((sum) => Math.round(sum / best.n))
        // White edges: the usual white circle already fits.
        if (Math.min(r, g, b) < 235) colour = `rgb(${r} ${g} ${b})`
      }
    }
  } catch {
    // Unreadable image: keep the default look.
  }
  edgeColours.set(key, colour)
  return colour
}
