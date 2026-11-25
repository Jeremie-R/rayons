import { useEffect, useState } from 'react'
import { CloseIcon, TranslateIcon } from '../components/icons'
import { IconButton } from '../components/ui'
import { formatListDate } from '../lib/dates'
import { detectLanguage, detectorUsable, languageName, LANGUAGES, setTargetLanguage, translateText, translationSupport, translatorFor } from '../lib/translate'
import type { Message } from '../lib/types'
import { splitQuoted } from './MessageBody'

/**
 * The conversation translated, beside the original. Each message is detected on its own
 * (threads can mix languages); the quoted history is left out, as in the mail itself.
 */
export function TranslationRail({ messages, target, onTargetChange, onClose }: { messages: Message[]; target: string; onTargetChange: (code: string) => void; onClose: () => void }) {
  const [supported, setSupported] = useState<boolean | null>(translationSupport() ? null : false)
  useEffect(() => {
    if (supported === null) void detectorUsable().then(setSupported)
  }, [supported])
  return (
    <aside className="side-card translation-rail" aria-label="Translation">
      <header className="side-card__header">
        <span className="side-card__title">
          <TranslateIcon size={16} />
          Translate to
        </span>
        <select
          className="translation-rail__target"
          value={target}
          aria-label="Translate to"
          onChange={(event) => {
            setTargetLanguage(event.target.value)
            onTargetChange(event.target.value)
          }}
        >
          {[...new Set([target, ...LANGUAGES])].map((code) => (
            <option key={code} value={code}>
              {languageName(code)}
            </option>
          ))}
        </select>
        <IconButton icon={CloseIcon} label="Close translation" shortcut="t" size={16} onClick={onClose} />
      </header>
      {supported === null ? (
        <p className="muted translation-rail__note">Checking…</p>
      ) : !supported ? (
        <p className="muted translation-rail__note">
          Translation runs on your computer with Google Chrome’s built-in translator (Chrome 138 or later, on desktop). This browser doesn’t have it.
        </p>
      ) : (
        <ol className="translation-rail__list" role="list">
          {messages.map((message) => (
            <TranslatedMessage key={`${message.id}:${target}`} message={message} target={target} />
          ))}
        </ol>
      )}
    </aside>
  )
}

type State =
  | { status: 'working'; progress?: number; from?: string }
  | { status: 'done'; from: string; text: string }
  | { status: 'same'; from: string }
  | { status: 'unknown' }
  | { status: 'unavailable'; from: string }
  | { status: 'error' }

function TranslatedMessage({ message, target }: { message: Message; target: string }) {
  const [state, setState] = useState<State>({ status: 'working' })
  const text = splitQuoted(message.text)[0]

  useEffect(() => {
    let cancelled = false
    const update = (next: State) => !cancelled && setState(next)
    ;(async () => {
      const from = await detectLanguage(text, true)
      if (!from) return update({ status: 'unknown' })
      if (from === target) return update({ status: 'same', from })
      update({ status: 'working', from })
      const translator = await translatorFor(from, target, (progress) => update({ status: 'working', from, progress }))
      if (!translator) return update({ status: 'unavailable', from })
      update({ status: 'done', from, text: await translateText(translator, text, `${message.id}:${target}`) })
    })().catch((error) => {
      console.error('Translation failed', error)
      update({ status: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [message.id, target, text])

  return (
    <li className="translated">
      <p className="translated__meta">
        <span className="medium">{message.from.name || message.from.email}</span>
        <span className="muted"> · {formatListDate(message.date)}</span>
        {'from' in state && state.from && <span className="muted"> · from {languageName(state.from)}</span>}
      </p>
      {state.status === 'done' && <p className="translated__text">{state.text}</p>}
      {state.status === 'working' && (
        <p className="muted translated__status">
          {state.progress !== undefined && state.progress < 1
            ? `Downloading ${languageName(state.from!)} → ${languageName(target)} on this computer (${Math.round(state.progress * 100)}%)…`
            : 'Translating…'}
        </p>
      )}
      {state.status === 'same' && <p className="muted translated__status">Already in {languageName(target)}.</p>}
      {state.status === 'unknown' && <p className="muted translated__status">Couldn’t tell which language this is.</p>}
      {state.status === 'unavailable' && (
        <p className="muted translated__status">
          Chrome can’t translate {languageName(state.from)} to {languageName(target)} yet.
        </p>
      )}
      {state.status === 'error' && <p className="muted translated__status">Translation failed. Close and open it again to retry.</p>}
    </li>
  )
}
