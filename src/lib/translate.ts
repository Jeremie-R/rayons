// Translation with Chrome's built-in, on-device Translator and LanguageDetector APIs
// (Chrome 138+ on desktop). Free, and the mail never leaves the computer. Models download
// once per language pair, which needs a click (Chrome asks for a user gesture).
// Other browsers don't have these yet: `translationSupport()` says so.

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

interface Monitor {
  addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void
}
interface ChromeTranslator {
  translate(text: string): Promise<string>
}
interface ChromeDetector {
  detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]>
}
interface TranslatorStatic {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>
  create(options: { sourceLanguage: string; targetLanguage: string; monitor?: (m: Monitor) => void }): Promise<ChromeTranslator>
}
interface DetectorStatic {
  availability(): Promise<Availability>
  create(options?: { monitor?: (m: Monitor) => void }): Promise<ChromeDetector>
}

const api = globalThis as unknown as { Translator?: TranslatorStatic; LanguageDetector?: DetectorStatic }

export const translationSupport = () => !!api.Translator && !!api.LanguageDetector

/** Some Chromium browsers have the API but not the models: then availability never answers. */
const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T) =>
  Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])

let detectorChecked: Promise<boolean> | null = null
/** True when this browser can detect languages on the device (now, or after a download). */
export function detectorUsable(): Promise<boolean> {
  if (!api.LanguageDetector) return Promise.resolve(false)
  detectorChecked ??= withTimeout(api.LanguageDetector.availability(), 6000, 'unavailable' as Availability).then((a) => a !== 'unavailable')
  return detectorChecked
}

// Target language --------------------------------------------------------------------------------

const KEY = 'rayons:translate-to'

export const LANGUAGES = ['en', 'fr', 'sv', 'da', 'nb', 'de', 'es', 'it', 'nl', 'pt', 'pl', 'fi', 'tr', 'ar', 'zh', 'ja', 'ko'] as const

export function targetLanguage(): string {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return saved
  } catch {
    // Fall through.
  }
  return (navigator.language || 'en').split('-')[0]
}

export function setTargetLanguage(code: string) {
  try {
    localStorage.setItem(KEY, code)
  } catch {
    // This visit only.
  }
}

const names = new Intl.DisplayNames(['en'], { type: 'language' })
export const languageName = (code: string) => {
  try {
    return names.of(code) ?? code
  } catch {
    return code
  }
}

// Detection ------------------------------------------------------------------------------------

let detector: Promise<ChromeDetector> | null = null

/**
 * The language of `text`, or null when unsure. With `allowDownload` false (on page load) it
 * only answers when the detector is already on this computer, so nothing downloads unasked.
 */
export async function detectLanguage(text: string, allowDownload = false): Promise<string | null> {
  if (!api.LanguageDetector || text.trim().length < 20) return null
  if (!detector) {
    const availability = await withTimeout(api.LanguageDetector.availability(), 6000, 'unavailable' as Availability)
    if (availability === 'unavailable' || (!allowDownload && availability !== 'available')) return null
    detector = api.LanguageDetector.create()
    detector.catch(() => (detector = null))
  }
  const [best] = await (await detector).detect(text.slice(0, 2000))
  return best && best.detectedLanguage !== 'und' && best.confidence >= 0.5 ? best.detectedLanguage.split('-')[0] : null
}

// Translation ----------------------------------------------------------------------------------

const translators = new Map<string, Promise<ChromeTranslator>>()
const results = new Map<string, string>()

export type TranslateStatus = { state: 'ready' } | { state: 'downloading'; progress: number } | { state: 'unavailable' }

/** A translator for this pair, downloading its model if needed (call from a click). */
export async function translatorFor(source: string, target: string, onProgress?: (progress: number) => void): Promise<ChromeTranslator | null> {
  if (!api.Translator) return null
  const key = `${source}>${target}`
  if (!translators.has(key)) {
    const availability = await withTimeout(api.Translator.availability({ sourceLanguage: source, targetLanguage: target }), 8000, 'unavailable' as Availability)
    if (availability === 'unavailable') return null
    const created = api.Translator.create({
      sourceLanguage: source,
      targetLanguage: target,
      monitor: (m) => m.addEventListener('downloadprogress', (event) => onProgress?.(event.loaded)),
    })
    created.catch(() => translators.delete(key))
    translators.set(key, created)
  }
  return translators.get(key)!
}

/** Translates paragraph by paragraph (keeps the mail's shape), remembering results. */
export async function translateText(translator: ChromeTranslator, text: string, cacheKey: string): Promise<string> {
  const cached = results.get(cacheKey)
  if (cached !== undefined) return cached
  const paragraphs = text.split(/\n{2,}/)
  const out: string[] = []
  for (const paragraph of paragraphs) out.push(paragraph.trim() ? await translator.translate(paragraph) : paragraph)
  const joined = out.join('\n\n')
  results.set(cacheKey, joined)
  return joined
}
