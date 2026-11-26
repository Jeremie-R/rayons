import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Before the server fetches a URL that came from a mail (an unsubscribe link, a logo), make sure
// it points at the public internet and not at something private (SSRF).

function isPrivateAddress(ip: string) {
  if (ip.includes(':')) {
    const lower = ip.toLowerCase()
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7))
    return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

export async function isPublicHttps(url: URL) {
  if (url.protocol !== 'https:' || (url.port && url.port !== '443')) return false
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return !isPrivateAddress(host)
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false
  const addresses = await lookup(host, { all: true }).catch(() => [])
  return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address))
}
