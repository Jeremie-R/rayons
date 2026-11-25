import DOMPurify from 'dompurify'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MoreIcon } from '../components/icons'
import { tooltip } from '../components/ui'
import { useTheme } from '../lib/theme'

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
    html { color-scheme: light; }
    body { margin: 0; font: 14px/1.5 Arial, Helvetica, sans-serif; color: #222; overflow-wrap: break-word; }
    body.paper { padding: 16px 20px; }
    img { max-width: 100%; }
    a { color: #1a5fb4; }
    blockquote { margin: 0 0 0 0.8ex; padding-left: 1ex; border-left: 1px solid #ccc; }
  </style>`

export function MessageBody({ text, html }: { text: string; html?: string }) {
  if (html) return <HtmlBody html={html} />
  return <TextBody text={text} />
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

function HtmlBody({ html }: { html: string }) {
  const { resolved } = useTheme()
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(120)
  const [showQuoted, setShowQuoted] = useState(false)
  const [main, quoted] = useMemo(() => {
    // Keep the <style> blocks mail programs put in <head>, then the body.
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const headStyles = [...doc.head.querySelectorAll('style')].map((style) => style.outerHTML).join('')
    const clean = DOMPurify.sanitize(headStyles + doc.body.innerHTML, {
      FORCE_BODY: true,
      ADD_TAGS: ['style'],
      ADD_ATTR: ['bgcolor', 'background', 'align', 'valign', 'width', 'height', 'cellpadding', 'cellspacing', 'border'],
      FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'meta', 'link', 'base'],
    })
    return splitQuotedHtml(clean)
  }, [html])
  const body = showQuoted && quoted ? `${main}${quoted}` : main
  // Mail is written for white paper; in dark mode it stays on a light card.
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">${FRAME_STYLE}</head><body class="${resolved === 'dark' ? 'paper' : ''}">${body}</body></html>`

  useEffect(() => {
    const iframe = frame.current
    if (!iframe) return
    let observer: ResizeObserver | undefined
    const measure = () => {
      const doc = iframe.contentDocument
      if (!doc?.body) return
      const update = () => setHeight(Math.ceil(doc.documentElement.scrollHeight) + 2)
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

function TextBody({ text }: { text: string }) {
  const [main, quoted] = useMemo(() => splitQuoted(text), [text])
  const [showQuoted, setShowQuoted] = useState(false)
  return (
    <div className="message__text">
      <Linkified text={main} />
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
