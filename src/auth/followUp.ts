// Something to do once Google sends you back (e.g. import contacts after granting access).
// Kept apart from cloud.ts so screens can read it without loading Supabase.

const KEY = 'rayons:after-sign-in'

export function setSignInFollowUp(value: string) {
  try {
    sessionStorage.setItem(KEY, value)
  } catch {
    // Storage blocked: the person can press the button again.
  }
}

/** What to do now that Google came back (once), e.g. 'import-contacts'. */
export function takeSignInFollowUp(): string | null {
  try {
    const value = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return value
  } catch {
    return null
  }
}
