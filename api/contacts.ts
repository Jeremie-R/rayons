import { importContacts } from '../server/contacts.js'
import { accountFor, googleClient } from '../server/google.js'
import { handle, HttpError, json, readJson } from '../server/http.js'
import { requireUser } from '../server/supabase.js'

// Reading and remembering contacts goes straight to Supabase from the browser; only the
// import needs Google.
export function POST(request: Request) {
  return handle(request, async () => {
    const user = await requireUser(request)
    const body = await readJson<{ action: 'import' }>(request)
    if (body.action !== 'import') throw new HttpError(400, 'bad_request', 'Unknown action.')
    return json(await importContacts(googleClient(await accountFor(user.id)), user.id))
  })
}
