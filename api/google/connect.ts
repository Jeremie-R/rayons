import { encrypt } from '../../server/crypto'
import { exchangeCode, REQUIRED_SCOPES } from '../../server/google'
import { env, handle, HttpError, json, readJson } from '../../server/http'
import { adminClient, optionalUser, publicClient } from '../../server/supabase'

// Finishes "Continue with Google". The browser sends the one-time code Google gave it; we
// trade it (with the client secret, which never leaves the server) for tokens, keep the
// refresh token encrypted, and sign the person in to Supabase with Google's ID token.

interface Body {
  code: string
  codeVerifier: string
  redirectUri: string
}

interface IdClaims {
  iss: string
  aud: string
  sub: string
  email: string
  email_verified?: boolean
  name?: string
  picture?: string
  exp: number
}

export function POST(request: Request) {
  return handle(request, async () => {
    const { code, codeVerifier, redirectUri } = await readJson<Body>(request)
    if (!code || !codeVerifier || !redirectUri) throw new HttpError(400, 'bad_request', 'Missing sign-in details.')
    const origin = request.headers.get('origin')
    if (origin && new URL(redirectUri).origin !== origin) throw new HttpError(400, 'bad_request', 'Sign-in came back to the wrong site.')

    const tokens = await exchangeCode(code, codeVerifier, redirectUri)
    if (!tokens.id_token) throw new HttpError(400, 'google_refused', 'Google did not say who you are. Please try again.')

    // The ID token comes straight from Google's token endpoint over TLS, so its claims can be
    // read without checking the signature (OpenID Connect Core 3.1.3.7); still check them.
    const claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString()) as IdClaims
    if (claims.aud !== env('GOOGLE_CLIENT_ID') || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) || claims.exp * 1000 < Date.now()) {
      throw new HttpError(400, 'google_refused', 'That sign-in was not meant for Rayons.')
    }
    if (claims.email_verified === false) throw new HttpError(400, 'google_refused', 'Your Google email address is not verified.')

    const granted = tokens.scope.split(' ')
    const missing = REQUIRED_SCOPES.filter((scope) => !granted.includes(scope))
    if (missing.length) {
      throw new HttpError(403, 'missing_scopes', 'Rayons needs access to both Gmail and Google Calendar. Please try again and tick every box on Google’s screen.')
    }

    const db = adminClient()
    const { data: existing } = await db.from('google_accounts').select('id, user_id').eq('google_sub', claims.sub).maybeSingle()
    const { data: stored } = existing ? await db.from('google_tokens').select('refresh_token').eq('account_id', existing.id).maybeSingle() : { data: null }
    // Google only sends a refresh token on first consent. Without one (and none kept) ask again.
    if (!tokens.refresh_token && !stored?.refresh_token) return json({ needsConsent: true })

    let userId = (await optionalUser(request))?.id
    let session: { access_token: string; refresh_token: string } | null = null
    if (!userId) {
      const { data, error } = await publicClient().auth.signInWithIdToken({ provider: 'google', token: tokens.id_token })
      if (error || !data.session) {
        console.error('Supabase sign-in failed', error)
        throw new HttpError(400, 'sign_in_failed', 'Could not sign you in. Is Google enabled in Supabase, with this client ID? See docs/SETUP.md.')
      }
      userId = data.user.id
      session = { access_token: data.session.access_token, refresh_token: data.session.refresh_token }
    }
    if (existing && existing.user_id !== userId) throw new HttpError(409, 'account_taken', 'This Google account is already connected to another Rayons account.')

    const { data: account, error } = await db
      .from('google_accounts')
      .upsert(
        { user_id: userId, google_sub: claims.sub, email: claims.email, name: claims.name ?? null, picture: claims.picture ?? null, scopes: granted, status: 'ok' },
        { onConflict: 'google_sub' },
      )
      .select('id')
      .single()
    if (error) throw error
    const { error: tokenError } = await db.from('google_tokens').upsert({
      account_id: account.id,
      refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : stored!.refresh_token,
      access_token: encrypt(tokens.access_token),
      expires_at: new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString(),
    })
    if (tokenError) throw tokenError

    return json({ session, email: claims.email })
  })
}
