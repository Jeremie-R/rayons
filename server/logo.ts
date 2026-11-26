import { resolveTxt } from 'node:dns/promises'
import { isPublicHttps } from './net.js'

// Company logos for mail senders, the way Gmail shows them:
// 1. BIMI: brands publish a logo in DNS (default._bimi.<domain>), the same one Gmail uses.
// 2. Otherwise the site's own icon, through Google's favicon service.
// Only the domain is looked up, never the address. The browser caches the answer for a week.

const MAX_BYTES = 200_000
// Second-level parts that belong to the country code (sub.example.co.uk → example.co.uk).
const SHARED_SECOND_LEVEL = /^(co|com|org|net|gov|ac|edu|ne|or|go)\.[a-z]{2}$/

/** "news.mail.spotify.com" → ["news.mail.spotify.com", "mail.spotify.com", "spotify.com"]. */
export function domainsToTry(domain: string): string[] {
  const labels = domain.split('.')
  const keep = SHARED_SECOND_LEVEL.test(labels.slice(-2).join('.')) ? 3 : 2
  const out: string[] = []
  for (let i = 0; labels.length - i >= keep && out.length < 4; i++) out.push(labels.slice(i).join('.'))
  return out
}

async function fetchSmall(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(3000) }).catch(() => null)
  if (!response?.ok) return null
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) return null
  const body = await response.arrayBuffer().catch(() => null)
  if (!body || body.byteLength > MAX_BYTES || body.byteLength < 50) return null
  return { body, type: response.headers.get('content-type')?.split(';')[0].trim() ?? '' }
}

async function bimi(domain: string) {
  const records = await resolveTxt(`default._bimi.${domain}`).catch(() => [])
  const record = records.map((parts) => parts.join('')).find((text) => /^v=BIMI1/i.test(text.trim()))
  const location = record?.match(/(?:^|;)\s*l=([^;\s]+)/i)?.[1]
  if (!location) return null
  let url: URL
  try {
    url = new URL(location)
  } catch {
    return null
  }
  if (!(await isPublicHttps(url))) return null
  const logo = await fetchSmall(url.href, { redirect: 'error' })
  if (!logo || !(logo.type.includes('svg') || new TextDecoder().decode(logo.body.slice(0, 200)).includes('<svg'))) return null
  return { body: logo.body, type: 'image/svg+xml' }
}

async function favicon(domain: string) {
  const url = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=128&url=${encodeURIComponent(`https://${domain}`)}`
  const icon = await fetchSmall(url)
  return icon && icon.type.startsWith('image/') ? icon : null
}

export async function logoFor(domain: string): Promise<{ body: ArrayBuffer; type: string } | null> {
  const candidates = domainsToTry(domain)
  for (const candidate of candidates) {
    const found = await bimi(candidate)
    if (found) return found
  }
  // Mail often comes from a sub-domain (email.brand.com); the brand's site is the shortest one.
  return favicon(candidates[candidates.length - 1] ?? domain)
}
