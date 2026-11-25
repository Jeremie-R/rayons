import { handle, json, readJson } from '../server/http.js'
import { requireUser } from '../server/supabase.js'
import { translate } from '../server/translate.js'

// Signed-in only, so the translation allowance can't be used by anyone else.
export function POST(request: Request) {
  return handle(request, async () => {
    await requireUser(request)
    const { texts, target, format } = await readJson<{ texts: string[]; target: string; format?: 'text' | 'html' }>(request)
    return json(await translate(Array.isArray(texts) ? texts.map(String) : [], String(target), format === 'html' ? 'html' : 'text'))
  })
}
