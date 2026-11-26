import { decrypt, encrypt } from './crypto.js'
import { env, HttpError } from './http.js'
import { adminClient } from './supabase.js'
import { timed } from './timing.js'

export const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
export const CALENDAR = 'https://www.googleapis.com/calendar/v3'

/** What Rayons asks Google for. Gmail "modify" covers reading, labelling, archiving and sending. */
export const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
]

export interface GoogleAccount {
  id: string
  user_id: string
  google_sub: string
  email: string
  name: string | null
  tag_labels: Record<string, string>
  scopes: string[] | null
  status: 'ok' | 'reconnect'
}

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  id_token?: string
  scope: string
  error?: string
  error_description?: string
}

export async function exchangeCode(code: string, codeVerifier: string, redirectUri: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      grant_type: 'authorization_code',
    }),
  })
  const body = (await response.json()) as TokenResponse
  if (!response.ok) throw new HttpError(400, 'google_refused', body.error_description ?? 'Google did not accept the sign-in. Please try again.')
  return body
}

/** The person's Google account (Rayons uses one per person for now). */
export async function accountFor(userId: string): Promise<GoogleAccount> {
  const { data, error } = await timed('account', Promise.resolve(adminClient().from('google_accounts').select('*').eq('user_id', userId).order('created_at').limit(1).maybeSingle()))
  if (error) throw error
  if (!data) throw new HttpError(409, 'google_not_connected', 'Connect your Google account first.')
  if (data.status === 'reconnect') throw new HttpError(401, 'google_reconnect', 'Google needs you to sign in again.')
  return data as GoogleAccount
}

async function refresh(account: GoogleAccount) {
  const db = adminClient()
  const { data: tokens, error } = await db.from('google_tokens').select('*').eq('account_id', account.id).single()
  if (error || !tokens) throw new HttpError(401, 'google_reconnect', 'Google needs you to sign in again.')
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      refresh_token: decrypt(tokens.refresh_token),
      grant_type: 'refresh_token',
    }),
  })
  const body = (await response.json()) as TokenResponse
  if (!response.ok) {
    if (body.error === 'invalid_grant') {
      await db.from('google_accounts').update({ status: 'reconnect' }).eq('id', account.id)
      throw new HttpError(401, 'google_reconnect', 'Google needs you to sign in again.')
    }
    throw new HttpError(502, 'google_error', 'Google is not answering right now. Please try again.')
  }
  const expiresAt = new Date(Date.now() + (body.expires_in - 60) * 1000).toISOString()
  await db.from('google_tokens').update({ access_token: encrypt(body.access_token), expires_at: expiresAt }).eq('account_id', account.id)
  return body.access_token
}

async function accessToken(account: GoogleAccount, force = false) {
  if (!force) {
    const { data } = await adminClient().from('google_tokens').select('access_token, expires_at').eq('account_id', account.id).single()
    if (data?.access_token && data.expires_at && new Date(data.expires_at).getTime() > Date.now()) return decrypt(data.access_token)
  }
  return refresh(account)
}

/** Calls a Google API as this account, refreshing the token when needed. */
export function googleClient(account: GoogleAccount) {
  let token: Promise<string> | null = null

  async function call(url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
    token ??= accessToken(account)
    const response = await fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${await token}` },
    })
    if (response.status === 401 && attempt === 0) {
      token = accessToken(account, true)
      return call(url, init, 1)
    }
    // Gmail allows about 25 conversation reads a second per person. When it says "slow down"
    // (429, or 403 with a rate-limit reason) wait and try again, up to three times.
    if ((response.status === 429 || (response.status === 403 && isRateLimit(await response.clone().text()))) && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** attempt + Math.random() * 300))
      return call(url, init, attempt + 1)
    }
    return response
  }

  async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await call(url, init.body ? { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) } } : init)
    if (response.status === 204) return undefined as T
    const text = await response.text()
    if (!response.ok) {
      console.error('Google API error', response.status, url.replace(/\?.*/, ''), text.slice(0, 500))
      const reason = text.match(/"reason":\s*"([^"]+)"/)?.[1] ?? ''
      if (response.status === 404) throw new HttpError(404, 'not_found', 'It is not there any more. It may have been deleted in Gmail or Google Calendar.')
      if (response.status === 409) throw new HttpError(409, 'conflict', 'That already exists in Google.')
      if (response.status === 429 || isRateLimit(text)) throw new HttpError(429, 'google_busy', 'Google asked Rayons to slow down. Wait a few seconds and try again.')
      if (response.status === 400 && reason === 'failedPrecondition' && url.includes('gmail.googleapis.com')) {
        throw new HttpError(409, 'no_gmail', `This Google account (${account.email}) has no Gmail mailbox. Sign in with your Gmail account instead.`)
      }
      if (response.status === 403 && /SERVICE_DISABLED|accessNotConfigured/.test(text)) {
        const api = url.includes('people.googleapis.com') ? 'People API' : 'API'
        throw new HttpError(403, 'api_disabled', `The Google ${api} is not turned on for Rayons yet. Turn it on in Google Cloud (APIs & Services), then try again.`)
      }
      if (response.status === 403 && /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/.test(text)) {
        throw new HttpError(403, 'needs_scope', 'Rayons needs one more permission from Google for this.')
      }
      if (response.status === 403) throw new HttpError(403, 'google_forbidden', `Google did not allow that${reason ? ` (${reason})` : ''}. You may need to sign in again to grant access.`)
      throw new HttpError(502, 'google_error', `Google did not accept that${reason ? ` (${reason})` : ''}. Please try again.`)
    }
    return (text ? JSON.parse(text) : undefined) as T
  }

  /**
   * Several GETs in one HTTP request (Google's batch endpoint): much faster than one request
   * each. `paths` are like '/gmail/v1/users/me/threads/abc?format=metadata'. Returns the parsed
   * bodies in order, null for any that failed (callers may fetch those again on their own).
   */
  async function batch<T>(service: 'gmail/v1', paths: string[]): Promise<(T | null)[]> {
    if (paths.length === 0) return []
    const boundary = `batch_${Math.random().toString(36).slice(2)}`
    const body =
      paths.map((path, index) => `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <item${index}>\r\n\r\nGET ${path}\r\n\r\n`).join('') + `--${boundary}--`
    const response = await call(`https://gmail.googleapis.com/batch/${service}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` },
      body,
    })
    if (!response.ok) throw new HttpError(502, 'google_error', 'Google is not answering right now. Please try again.')
    const replyBoundary = response.headers.get('content-type')?.match(/boundary=([^;]+)/)?.[1]
    const text = await response.text()
    const results: (T | null)[] = paths.map(() => null)
    if (!replyBoundary) return results
    for (const part of text.split(`--${replyBoundary}`)) {
      const id = part.match(/Content-ID:\s*<response-item(\d+)>/i)?.[1]
      const status = Number(part.match(/HTTP\/1\.1 (\d{3})/)?.[1])
      const json = part.indexOf('{')
      if (id === undefined || status !== 200 || json < 0) continue
      try {
        results[Number(id)] = JSON.parse(part.slice(json, part.lastIndexOf('}') + 1)) as T
      } catch {
        // Left null.
      }
    }
    return results
  }

  return { call, request, batch, account }
}

const isRateLimit = (body: string) => /rateLimitExceeded|userRateLimitExceeded|RESOURCE_EXHAUSTED|concurrent requests/i.test(body)

export type Google = ReturnType<typeof googleClient>

/** Runs `task` over `items`, `limit` at a time (to stay under Google's per-user rate limits). */
export async function inParallel<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await task(items[index])
      }
    }),
  )
  return results
}
