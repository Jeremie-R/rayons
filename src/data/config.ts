// Read each variable by its full name: Vite then inlines only these. Going through
// `const env = import.meta.env` would put every VITE_* variable in the public bundle.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY as string | undefined
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

/** Everything needed to use real Gmail and Calendar, or null to run the demo only. */
export const liveConfig = supabaseUrl && supabaseKey && googleClientId ? { supabaseUrl, supabaseKey, googleClientId } : null

/** What Rayons asks Google for. Must match REQUIRED_SCOPES in server/google.ts. */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
]
