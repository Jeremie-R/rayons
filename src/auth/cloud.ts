import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { GOOGLE_SCOPES, liveConfig } from '../data/config'
import { setSignInFollowUp } from './followUp'

// Signing in: the browser goes to Google (authorization code + PKCE), Google sends it back to
// /auth/callback with a one-time code, and api/google/connect trades the code for tokens on the
// server and returns a Supabase session. Google's screen shows our own domain.

let client: SupabaseClient | null = null

export function supabase() {
  if (!liveConfig) throw new Error('Rayons is running as a demo: Supabase is not configured.')
  client ??= createClient(liveConfig.supabaseUrl, liveConfig.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  return client
}

const STATE_KEY = 'rayons:oauth'
export const CALLBACK_PATH = '/auth/callback'

const randomString = (bytes = 32) => {
  const data = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function challengeFor(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

interface SavedSignIn {
  state: string
  verifier: string
  back: string
  scopes?: string[]
  then?: string
}

/**
 * Sends the browser to Google. `consent` asks again for every permission (gives a new refresh
 * token); `scopes` asks for more than the usual ones; `then` is kept for the page to act on
 * when it comes back (see `takeSignInFollowUp`).
 */
export async function startGoogleSignIn(options: { consent?: boolean; hint?: string; scopes?: string[]; then?: string } = {}) {
  if (!liveConfig) throw new Error('Google sign-in is not configured.')
  const state = randomString(16)
  const verifier = randomString(48)
  const saved: SavedSignIn = { state, verifier, back: location.pathname + location.search, scopes: options.scopes, then: options.then }
  sessionStorage.setItem(STATE_KEY, JSON.stringify(saved))
  const params = new URLSearchParams({
    client_id: liveConfig.googleClientId,
    redirect_uri: location.origin + CALLBACK_PATH,
    response_type: 'code',
    scope: [...GOOGLE_SCOPES, ...(options.scopes ?? [])].join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
    prompt: options.consent ? 'consent' : 'select_account',
  })
  if (options.hint) params.set('login_hint', options.hint)
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}

export class SignInError extends Error {}

/**
 * On /auth/callback: checks the answer from Google and finishes signing in.
 * Returns where to go next, or null when this page load isn't a sign-in.
 */
export async function finishGoogleSignIn(): Promise<string | null> {
  if (location.pathname !== CALLBACK_PATH) return null
  const params = new URLSearchParams(location.search)
  const saved = JSON.parse(sessionStorage.getItem(STATE_KEY) ?? 'null') as SavedSignIn | null
  sessionStorage.removeItem(STATE_KEY)
  history.replaceState(null, '', '/')
  if (params.get('error')) throw new SignInError(params.get('error') === 'access_denied' ? 'Sign-in was cancelled.' : 'Google did not complete the sign-in.')
  const code = params.get('code')
  if (!code || !saved || saved.state !== params.get('state')) throw new SignInError('That sign-in link is not valid any more. Please try again.')

  const { data } = await supabase().auth.getSession()
  const response = await fetch('/api/google/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: JSON.stringify({ code, codeVerifier: saved.verifier, redirectUri: location.origin + CALLBACK_PATH }),
  })
  const body = (await response.json().catch(() => ({}))) as { session?: Session | null; needsConsent?: boolean; message?: string }
  if (!response.ok) throw new SignInError(body.message ?? 'Could not finish signing in.')
  if (body.needsConsent) {
    await startGoogleSignIn({ consent: true, scopes: saved.scopes, then: saved.then })
    return new Promise(() => {}) // Leaving for Google.
  }
  if (body.session) await supabase().auth.setSession(body.session)
  if (saved.then) setSignInFollowUp(saved.then)
  return saved.back && saved.back !== CALLBACK_PATH ? saved.back : '/'
}


/** Calls one of our api/ functions as the signed-in person. */
export async function api<T>(path: string, body: unknown, as: 'json' | 'blob' = 'json'): Promise<T> {
  const { data } = await supabase().auth.getSession()
  if (!data.session) throw new ApiError('signed_out', 'Please sign in again.')
  const response = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: string; message?: string }
    throw new ApiError(error.error ?? 'server_error', error.message ?? 'Something went wrong. Please try again.')
  }
  return (as === 'blob' ? response.blob() : response.json()) as Promise<T>
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Listeners for "Google needs you to sign in again", so the app can offer a button. */
const reconnectListeners = new Set<() => void>()
export const onReconnectNeeded = (listener: () => void) => {
  reconnectListeners.add(listener)
  return () => {
    reconnectListeners.delete(listener)
  }
}
export const reportReconnectNeeded = () => reconnectListeners.forEach((listener) => listener())
