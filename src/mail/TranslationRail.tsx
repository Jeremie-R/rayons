import { useEffect, useState } from 'react'
import { CloseIcon, TranslateIcon } from '../components/icons'
import { IconButton } from '../components/ui'
import { useBackend } from '../data/store'
import { formatListDate } from '../lib/dates'
import { detectLanguage, detectorUsable, languageName, LANGUAGES, setTargetLanguage, translateText, translatorFor } from '../lib/translate'
import type { Message } from '../lib/types'
import { errorText } from './actions'
import { splitQuoted } from './MessageBody'

/**
 * The conversation translated, beside the original. In Google Chrome it runs on the computer
 * (nothing leaves it); in other browsers (Arc, Safari, phones) it goes through the translation
 * service set up on the server. Each message is detected on its own; quoted history is left out.
 */
export function TranslationRail({ messages, target, onTargetChange, onClose }: { messages: Message[]; target: string; onTargetChange: (code: string) => void; onClose: () => void }) {
  const [mode, setMode] = useState<'checking' | 'device' | 'service'>('checking')
  useEffect(() => {
    void detectorUsable().then((usable) => setMode(usable ? 'device' : 'service'))
  }, [])

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
      {mode === 'checking' ? (
        <p className="muted translation-rail__note">Checking…</p>
      ) : mode === 'device' ? (
        <ol className="translation-rail__list" role="list">
          {messages.map((message) => (
            <DeviceTranslation key={`${message.id}:${target}`} message={message} target={target} />
          ))}
        </ol>
      ) : (
        <ServiceTranslation key={target} messages={messages} target={target} />
      )}
    </aside>
  )
}

type State =
  | { status: 'working'; progress?: number; from?: string }
  | { status: 'done'; from: string; text: string }
  | { status: 'same'; from: string }
  | { status: 'failed'; reason: string; from?: string }

const mainText = (message: Message) => splitQuoted(message.text)[0]

/** One message, translated by Chrome on the computer; falls back to the service if Chrome can't. */
function DeviceTranslation({ message, target }: { message: Message; target: string }) {
  const backend = useBackend()
  const [state, setState] = useState<State>({ status: 'working' })
  const text = mainText(message)

  useEffect(() => {
    let cancelled = false
    const update = (next: State) => !cancelled && setState(next)
    const viaService = async () => {
      const [result] = await backend.translate([text], target)
      if (!result) throw new Error('No translation came back.')
      update(result.source === target ? { status: 'same', from: target } : { status: 'done', from: result.source, text: result.text })
    }
    ;(async () => {
      const from = await detectLanguage(text, true).catch(() => null)
      if (from === target) return update({ status: 'same', from })
      const translator = from ? await translatorFor(from, target, (progress) => update({ status: 'working', from, progress })).catch(() => null) : null
      if (!from || !translator) return viaService()
      update({ status: 'done', from, text: await translateText(translator, text, `${message.id}:${target}`) })
    })().catch((error) => update({ status: 'failed', reason: errorText(error) }))
    return () => {
      cancelled = true
    }
  }, [message.id, target, text])

  return <TranslatedItem message={message} target={target} state={state} />
}

/** The whole conversation through the translation service, in one request. */
function ServiceTranslation({ messages, target }: { messages: Message[]; target: string }) {
  const backend = useBackend()
  const [states, setStates] = useState<State[]>(() => messages.map(() => ({ status: 'working' })))
  const ids = messages.map((m) => m.id).join(',')

  useEffect(() => {
    let cancelled = false
    const texts = messages.map(mainText)
    backend.translate(texts, target).then(
      (results) =>
        !cancelled &&
        setStates(
          messages.map((_, i) => {
            const result = results[i]
            if (!result) return { status: 'failed', reason: 'No translation came back.' }
            return result.source === target ? { status: 'same', from: target } : { status: 'done', from: result.source, text: result.text }
          }),
        ),
      (error) => !cancelled && setStates(messages.map(() => ({ status: 'failed', reason: errorText(error) }))),
    )
    return () => {
      cancelled = true
    }
    // The ids, not the array (a new one each render).
  }, [ids, target])

  // One message about a missing service is enough.
  const failed = states.every((s) => s.status === 'failed') ? (states[0] as Extract<State, { status: 'failed' }>) : null
  if (failed) return <p className="muted translation-rail__note">{failed.reason}</p>
  return (
    <ol className="translation-rail__list" role="list">
      {messages.map((message, i) => (
        <TranslatedItem key={message.id} message={message} target={target} state={states[i]} />
      ))}
    </ol>
  )
}

function TranslatedItem({ message, target, state }: { message: Message; target: string; state: State }) {
  return (
    <li className="translated">
      <p className="translated__meta">
        <span className="medium">{message.from.name || message.from.email}</span>
        <span className="muted"> · {formatListDate(message.date)}</span>
        {'from' in state && state.from && state.status !== 'same' && <span className="muted"> · from {languageName(state.from)}</span>}
      </p>
      {state.status === 'done' && <p className="translated__text">{state.text}</p>}
      {state.status === 'working' && (
        <p className="muted translated__status">
          {state.progress !== undefined && state.progress < 1 && state.from
            ? `Downloading ${languageName(state.from)} → ${languageName(target)} on this computer (${Math.round(state.progress * 100)}%)…`
            : 'Translating…'}
        </p>
      )}
      {state.status === 'same' && <p className="muted translated__status">Already in {languageName(target)}.</p>}
      {state.status === 'failed' && <p className="muted translated__status">{state.reason}</p>}
    </li>
  )
}
