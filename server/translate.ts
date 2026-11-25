import { HttpError } from './http.js'

// Translation through a service, for browsers without Chrome's on-device translator (Arc,
// Safari, Firefox, phones). DeepL when DEEPL_API_KEY is set (its free plan covers 500,000
// characters a month), else Google Cloud Translation with GOOGLE_TRANSLATE_API_KEY.
// Both detect the source language themselves.

export interface Translation {
  text: string
  /** Detected source language, lower-case ISO code ('sv'). */
  source: string
}

const MAX_CHARS = 30_000

// DeepL wants regional codes for a few targets.
const DEEPL_TARGET: Record<string, string> = { en: 'EN-GB', pt: 'PT-PT', zh: 'ZH-HANS' }

export async function translate(texts: string[], target: string): Promise<Translation[]> {
  if (!/^[a-z]{2,3}$/.test(target)) throw new HttpError(400, 'bad_request', 'Unknown language.')
  if (texts.length === 0) return []
  if (texts.length > 50 || texts.reduce((sum, t) => sum + t.length, 0) > MAX_CHARS) {
    throw new HttpError(413, 'too_large', 'That conversation is too long to translate at once.')
  }

  // Pasted keys often carry spaces, quotes or a line break.
  const deepl = process.env.DEEPL_API_KEY?.trim().replace(/^["']|["']$/g, '').trim()
  if (deepl) {
    // Free-plan keys end in ":fx" and use their own host; if that host refuses the key, the
    // other one gets a try.
    const free = deepl.endsWith(':fx')
    const hosts = free ? ['https://api-free.deepl.com', 'https://api.deepl.com'] : ['https://api.deepl.com', 'https://api-free.deepl.com']
    let response: Response | null = null
    for (const host of hosts) {
      response = await fetch(`${host}/v2/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `DeepL-Auth-Key ${deepl}` },
        body: JSON.stringify({ text: texts, target_lang: DEEPL_TARGET[target] ?? target.toUpperCase() }),
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null)
      if (response && response.status !== 403) break
    }
    if (!response) throw new HttpError(502, 'translate_failed', 'DeepL could not be reached. Please try again.')
    if (response.status === 456) throw new HttpError(429, 'quota', 'The DeepL allowance for this month is used up.')
    if (response.status === 403) throw new HttpError(502, 'translate_key', 'DeepL did not accept the key in DEEPL_API_KEY. Copy it again from DeepL (Account → API Keys) into Vercel, then redeploy.')
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200)
      console.error('DeepL error', response.status, detail)
      throw new HttpError(502, 'translate_failed', `DeepL answered ${response.status}${detail ? `: ${detail}` : ''}`)
    }
    const body = (await response.json()) as { translations: { text: string; detected_source_language: string }[] }
    return body.translations.map((t) => ({ text: t.text, source: t.detected_source_language.toLowerCase().split('-')[0] }))
  }

  const google = process.env.GOOGLE_TRANSLATE_API_KEY
  if (google) {
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(google)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: texts, target, format: 'text' }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new HttpError(502, 'translate_failed', 'The translation service did not answer. Please try again.')
    const body = (await response.json()) as { data: { translations: { translatedText: string; detectedSourceLanguage?: string }[] } }
    return body.data.translations.map((t) => ({ text: t.translatedText, source: (t.detectedSourceLanguage ?? '').toLowerCase().split('-')[0] }))
  }

  throw new HttpError(501, 'translate_not_configured', 'No translation service is set up yet: add DEEPL_API_KEY on the server (see docs/SETUP.md).')
}
