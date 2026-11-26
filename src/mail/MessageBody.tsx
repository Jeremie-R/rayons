import DOMPurify from 'dompurify'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MoreIcon, TranslateIcon } from '../components/icons'
import { tooltip } from '../components/ui'
import { useTheme } from '../lib/theme'
import { languageName } from '../lib/translate'
import { useTranslated, type Translated } from './useTranslated'

// Mail HTML is untrusted. It is sanitised, then shown in a sandboxed iframe without scripts.
// `allow-same-origin` only lets us measure its height; with no `allow-scripts`, nothing in it runs.
// Like Gmail, the mail keeps its own styles (<style> blocks and style="…"): inside the sandbox
// they can only style the mail itself. Links open in a new tab. Text-only mail is shown as
// text, with links made clickable.
//
// Like Gmail, the quoted history at the end of a reply ("On … wrote:" and what follows) is
// hidden behind a ••• button.

// Defaults only, close to Gmail's: the mail's own styles come after and win.
const FRAME_STYLE = `
  <style>
    html { color-scheme: light; overflow-y: hidden; }
    body { margin: 0; font: 14px/1.5 Arial, Helvetica, sans-serif; color: #222; overflow-wrap: break-word; }
    body.paper { padding: 16px 20px; }
    img { max-width: 100%; }
    a { color: #1a5fb4; }
    blockquote { margin: 0 0 0 0.8ex; padding-left: 1ex; border-left: 1px solid #ccc; }
  </style>`

interface BodyProps {
  text: string
  html?: string
  /** Show the message translated into this language (null: as written). */
  translateTo?: string | null
  cacheKey?: string
}

export function MessageBody({ text, html, translateTo = null, cacheKey = '' }: BodyProps) {
  if (html) return <HtmlBody html={html} text={text} translateTo={translateTo} cacheKey={cacheKey} />
  return <TextBody text={text} translateTo={translateTo} cacheKey={cacheKey} />
}

const sanitize = (html: string) =>
  DOMPurify.sanitize(html, {
    FORCE_BODY: true,
    ADD_TAGS: ['style'],
    ADD_ATTR: ['bgcolor', 'background', 'align', 'valign', 'width', 'height', 'cellpadding', 'cellspacing', 'border'],
    FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'meta', 'link', 'base'],
  })

/** "Translated from Swedish · Show original", or where the translation is at. */
function TranslationNote({ state, target, original, onToggle }: { state: Translated; target: string; original: boolean; onToggle: () => void }) {
  if (state.status === 'idle') return null
  let text: string
  if (state.status === 'working') {
    text =
      state.progress !== undefined && state.progress < 1 && state.from
        ? `Downloading ${languageName(state.from)} → ${languageName(target)} on this computer (${Math.round(state.progress * 100)}%)…`
        : 'Translating…'
  } else if (state.status === 'same') text = `Already in ${languageName(target)}`
  else if (state.status === 'failed') text = `Couldn’t translate: ${state.reason}`
  else text = original ? `Original, in ${languageName(state.from)}` : `Translated into ${languageName(target)}`
  return (
    <p className={`translation-note ${state.status === 'failed' ? 'is-failed' : ''}`} role="status">
      <TranslateIcon size={14} />
      <span>{text}</span>
      {state.status === 'done' && (
        <button type="button" onClick={onToggle}>
          {original ? `Show ${languageName(target)}` : 'Show original'}
        </button>
      )}
    </p>
  )
}

// Where mail programs put the quoted history.
const QUOTE_SELECTORS = [
  '.gmail_quote_container',
  '.gmail_quote',
  '.gmail_extra',
  'blockquote[type="cite"]',
  '.yahoo_quoted',
  '.moz-cite-prefix',
  '#divRplyFwdMsg',
  '#appendonsend',
  'div[name="messageReplySection"]',
  '.protonmail_quote',
  '.zmail_extra',
]

/** Splits mail HTML into what was written now and the quoted history (empty if none). */
function splitQuotedHtml(clean: string): [string, string] {
  const doc = new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html')
  const first = doc.body.querySelector(QUOTE_SELECTORS.join(','))
  if (!first) {
    // No marker: a blockquote at the very end, after an "On … wrote:" line, is the history.
    const quotes = [...doc.body.querySelectorAll('blockquote')]
    const last = quotes[quotes.length - 1]
    if (!last || last.nextElementSibling || !/wrote:|a écrit|skrev|schrieb|escribió|scrisse/i.test(last.previousElementSibling?.textContent ?? last.parentElement?.textContent?.slice(0, 400) ?? '')) {
      return [clean, '']
    }
    return cutFrom(doc, last.previousElementSibling ?? last)
  }
  // Outlook: everything from the marker (or the line just before it) to the end.
  const start = first.matches('#divRplyFwdMsg') && first.previousElementSibling?.tagName === 'HR' ? first.previousElementSibling : first
  return cutFrom(doc, start)
}

function cutFrom(doc: Document, start: Element): [string, string] {
  // Remove `start`, every sibling after it, and the same for each ancestor up to <body>.
  const quoted = doc.createElement('div')
  let node: Element | null = start
  while (node && node !== doc.body) {
    let sibling: ChildNode | null = node === start ? node : node.nextSibling
    const parent: Element | null = node.parentElement
    while (sibling) {
      const next: ChildNode | null = sibling.nextSibling
      quoted.appendChild(sibling)
      sibling = next
    }
    node = parent
  }
  const main = doc.body.innerHTML
  // Keep it whole if what's left is empty (a forward, say).
  if (!doc.body.textContent?.trim() && !doc.body.querySelector('img')) return [quoted.innerHTML, '']
  return [main, quoted.innerHTML]
}

function HtmlBody({ html, text, translateTo, cacheKey }: { html: string; text: string; translateTo: string | null; cacheKey: string }) {
  const { resolved } = useTheme()
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(120)
  const [showQuoted, setShowQuoted] = useState(false)
  const [original, setOriginal] = useState(false)
  const [main, quoted] = useMemo(() => {
    // Keep the <style> blocks mail programs put in <head>, then the body.
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const headStyles = [...doc.head.querySelectorAll('style')].map((style) => style.outerHTML).join('')
    return splitQuotedHtml(sanitize(headStyles + doc.body.innerHTML))
  }, [html])
  const translation = useTranslated(translateTo ? { format: 'html', content: main, sample: splitQuoted(text)[0] } : null, translateTo, cacheKey)
  // A translation is HTML that went to a service and back: sanitised again before display.
  const shownMain = useMemo(() => (translation.status === 'done' && !original ? sanitize(translation.content) : main), [translation, original, main])
  const body = showQuoted && quoted ? `${shownMain}${quoted}` : shownMain
  // Mail is written for white paper; in dark mode it stays on a light card.
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">${FRAME_STYLE}</head><body class="${resolved === 'dark' ? 'paper' : ''}">${body}</body></html>`

  useEffect(() => {
    const iframe = frame.current
    if (!iframe) return
    let observer: ResizeObserver | undefined
    const measure = () => {
      const doc = iframe.contentDocument
      if (!doc?.body) return
      // The document is at least as tall as the frame, so measure with the frame folded to
      // nothing; otherwise hiding the quoted history again would never shrink it.
      const update = () => {
        const kept = iframe.style.height
        iframe.style.height = '0px'
        const next = Math.ceil(doc.documentElement.scrollHeight) + 2
        iframe.style.height = kept
        setHeight(next)
      }
      update()
      observer?.disconnect()
      observer = new ResizeObserver(update)
      observer.observe(doc.body)
    }
    iframe.addEventListener('load', measure)
    return () => {
      iframe.removeEventListener('load', measure)
      observer?.disconnect()
    }
  }, [srcDoc])

  return (
    <>
      {translateTo && <TranslationNote state={translation} target={translateTo} original={original} onToggle={() => setOriginal((v) => !v)} />}
      <iframe
        ref={frame}
        className={`message__frame ${resolved === 'dark' ? 'is-paper' : ''}`}
        title="Message"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        style={{ height }}
      />
      {quoted && <QuotedToggle open={showQuoted} onToggle={() => setShowQuoted((v) => !v)} />}
    </>
  )
}

function QuotedToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`quoted-toggle ${open ? 'is-open' : ''}`} onClick={onToggle} aria-expanded={open} {...tooltip(open ? 'Hide earlier messages' : 'Show earlier messages')}>
      <MoreIcon size={16} />
      <span className="visually-hidden">{open ? 'Hide earlier messages' : 'Show earlier messages'}</span>
    </button>
  )
}

const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/g

function TextBody({ text, translateTo, cacheKey }: { text: string; translateTo: string | null; cacheKey: string }) {
  const [main, quoted] = useMemo(() => splitQuoted(text), [text])
  const [showQuoted, setShowQuoted] = useState(false)
  const [original, setOriginal] = useState(false)
  const translation = useTranslated(translateTo ? { format: 'text', content: main, sample: main } : null, translateTo, cacheKey)
  return (
    <div className="message__text">
      {translateTo && <TranslationNote state={translation} target={translateTo} original={original} onToggle={() => setOriginal((v) => !v)} />}
      <Linkified text={translation.status === 'done' && !original ? translation.content : main} />
      {quoted && <QuotedToggle open={showQuoted} onToggle={() => setShowQuoted((v) => !v)} />}
      {quoted && showQuoted && (
        <blockquote className="message__quoted">
          <Linkified text={quoted} />
        </blockquote>
      )}
    </div>
  )
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN)
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  )
}

// "On Wed, Nov 25, 2026 at 8:30 AM Jordan <j@x.com> wrote:" (may wrap over two or three lines),
// in a few languages, and Outlook's "-----Original Message-----" / "From: … Sent: …" block.
const ATTRIBUTION_END = /(wrote|a écrit|skrev|schrieb|escribió|scrisse|schreef|kirjoitti)\s*:\s*$/i
const ATTRIBUTION_START = /^(On|Le|Den|Am|El|Il|Op|Em)\b.*\d/
const OUTLOOK = /^(-{3,}\s*(Original Message|Ursprüngliche Nachricht|Message d'origine|Ursprungligt meddelande|Oprindelig meddelelse)\s*-{3,}|_{10,}|From:\s.+|Från:\s.+|De\s?:\s.+|Von:\s.+|Fra:\s.+)$/i

/** Splits plain text into what was written now and the quoted history (empty if none). */
export function splitQuoted(text: string): [string, string] {
  const lines = text.split('\n')
  let cut = -1
  for (let i = 0; i < lines.length && cut < 0; i++) {
    const line = lines[i].trim()
    // An attribution ending on this line, possibly started one or two lines above.
    if (ATTRIBUTION_END.test(line)) {
      for (const back of [0, 1, 2]) {
        const startLine = lines[i - back]?.trim() ?? ''
        if (ATTRIBUTION_START.test(startLine)) {
          cut = i - back
          break
        }
      }
      if (cut < 0 && lines[i + 1]?.trim().startsWith('>')) cut = i
    } else if (OUTLOOK.test(line) && (line.startsWith('-') || line.startsWith('_') || /^(Sent|Skickat|Envoyé|Gesendet|Sendt|Date|Datum):/i.test(lines[i + 1]?.trim() ?? '') || /^(Sent|Skickat|Envoyé|Gesendet|Sendt|Date|Datum):/i.test(lines[i + 2]?.trim() ?? ''))) {
      cut = i
    } else if (line.startsWith('>') && lines.slice(i).every((l) => l.startsWith('>') || !l.trim())) {
      cut = i
    }
  }
  if (cut <= 0) return [text.trimEnd(), '']
  return [lines.slice(0, cut).join('\n').trimEnd(), lines.slice(cut).join('\n').trim()]
}
