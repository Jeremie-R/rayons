import { useEffect, useState } from 'react'
import { useBackend } from '../data/store'
import { detectLanguage, detectorUsable, translateHtmlOnDevice, translateText, translatorFor } from '../lib/translate'
import { errorText } from './actions'

export type Translated =
  | { status: 'idle' }
  | { status: 'working'; progress?: number; from?: string }
  | { status: 'done'; from: string; content: string }
  | { status: 'same'; from: string }
  | { status: 'failed'; reason: string }

/**
 * One message body, translated in place. Google Chrome translates on the computer (nothing
 * leaves it); other browsers use the translation service, which keeps HTML markup so a mail
 * keeps its design. `sample` is plain text used to detect the language.
 */
export function useTranslated(input: { format: 'text' | 'html'; content: string; sample: string } | null, target: string | null, cacheKey: string): Translated {
  const backend = useBackend()
  const [state, setState] = useState<Translated>({ status: 'idle' })
  const content = input?.content
  const format = input?.format

  useEffect(() => {
    if (!input || !target) {
      setState({ status: 'idle' })
      return
    }
    let cancelled = false
    const update = (next: Translated) => !cancelled && setState(next)
    const key = `${cacheKey}:${format}:${target}`
    update({ status: 'working' })
    ;(async () => {
      const from = (await detectorUsable()) ? await detectLanguage(input.sample, true).catch(() => null) : null
      if (from === target) return update({ status: 'same', from })
      if (from) {
        const translator = await translatorFor(from, target, (progress) => update({ status: 'working', from, progress })).catch(() => null)
        if (translator) {
          const translated = input.format === 'html' ? await translateHtmlOnDevice(translator, input.content, key) : await translateText(translator, input.content, key)
          return update({ status: 'done', from, content: translated })
        }
      }
      const [result] = await backend.translate([input.content], target, input.format)
      if (!result) throw new Error('No translation came back.')
      update(result.source === target ? { status: 'same', from: target } : { status: 'done', from: result.source, content: result.text })
    })().catch((error) => update({ status: 'failed', reason: errorText(error) }))
    return () => {
      cancelled = true
    }
  }, [content, format, target, cacheKey])

  return state
}
