import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, HttpError } from './http.js'
import { timed } from './timing.js'

let admin: SupabaseClient | null = null

/** Supabase with the secret key: bypasses row-level security, so always filter by user. */
export function adminClient() {
  admin ??= createClient(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return admin
}

/** A client with the public key, for signing someone in on the server. */
export function publicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_KEY
  if (!key) throw new HttpError(500, 'not_configured', 'The server is missing SUPABASE_PUBLISHABLE_KEY. See docs/SETUP.md.')
  return createClient(env('SUPABASE_URL'), key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * The signed-in person behind `Authorization: Bearer <Supabase access token>`, or null.
 * The token's signature is checked locally against the project's published keys (cached),
 * so this usually needs no round trip to Supabase.
 */
export async function optionalUser(request: Request): Promise<{ id: string } | null> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const { data, error } = await timed('auth', adminClient().auth.getClaims(token))
  const claims = data?.claims
  if (error || !claims?.sub || claims.role !== 'authenticated' || claims.is_anonymous) return null
  return { id: claims.sub }
}

export async function requireUser(request: Request) {
  const user = await optionalUser(request)
  if (!user) throw new HttpError(401, 'signed_out', 'Please sign in again.')
  return user
}
