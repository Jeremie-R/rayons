import { decrypt } from '../../server/crypto'
import { handle, json } from '../../server/http'
import { adminClient, requireUser } from '../../server/supabase'

// Forgets the Google connection: asks Google to revoke the token, then deletes it here.
// Projects, notes and files stay; mail and events were always in Google.

export function POST(request: Request) {
  return handle(request, async () => {
    const user = await requireUser(request)
    const db = adminClient()
    const { data: accounts } = await db.from('google_accounts').select('id').eq('user_id', user.id)
    for (const account of accounts ?? []) {
      const { data: tokens } = await db.from('google_tokens').select('refresh_token').eq('account_id', account.id).maybeSingle()
      if (tokens?.refresh_token) {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: decrypt(tokens.refresh_token) }),
        }).catch((error) => console.error('Revoke failed', error))
      }
      await db.from('google_accounts').delete().eq('id', account.id)
    }
    return json({})
  })
}
