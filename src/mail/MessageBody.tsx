import DOMPurify from 'dompurify'
import { useEffect, useMemo, useRef, useState } from 'react'

// Mail HTML is untrusted. It is sanitised, then shown in a sandboxed iframe without scripts.
// `allow-same-origin` only lets us measure its height; with no `allow-scripts`, nothing in it runs.
// Links open in a new tab. Text-only mail is shown as text, with links made clickable.

const FRAME_STYLE = `
  <style>
    html { color-scheme: light; }
    body { margin: 0; font: 16px/1.6 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2e2e2e; overflow-wrap: anywhere; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100% !important; }
    a { color: #493886; }
    blockquote { margin: 0 0 0 0.5em; padding-left: 0.75em; border-left: 2px solid #e4e4e4; color: #6b6b6b; }
  </style>`

export function MessageBody({ text, html }: { text: string; html?: string }) {
  if (html) return <HtmlBody html={html} />
  return <TextBody text={text} />
}

function HtmlBody({ html }: { html: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(120)
  const srcDoc = useMemo(() => {
    const clean = DOMPurify.sanitize(html, {
      WHOLE_DOCUMENT: false,
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
      FORBID_ATTR: ['style'],
    })
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">${FRAME_STYLE}</head><body>${clean}</body></html>`
  }, [html])

  useEffect(() => {
    const iframe = frame.current
    if (!iframe) return
    let observer: ResizeObserver | undefined
    const measure = () => {
      const body = iframe.contentDocument?.body
      if (!body) return
      setHeight(Math.ceil(body.scrollHeight) + 4)
      observer?.disconnect()
      observer = new ResizeObserver(() => setHeight(Math.ceil(body.scrollHeight) + 4))
      observer.observe(body)
    }
    iframe.addEventListener('load', measure)
    return () => {
      iframe.removeEventListener('load', measure)
      observer?.disconnect()
    }
  }, [srcDoc])

  return (
    <iframe
      ref={frame}
      className="message__frame"
      title="Message"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      style={{ height }}
    />
  )
}

const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/g

function TextBody({ text }: { text: string }) {
  // Drop the quoted history at the end ("On … wrote:" and lines starting with ">").
  const [main, quoted] = useMemo(() => splitQuoted(text), [text])
  const [showQuoted, setShowQuoted] = useState(false)
  return (
    <div className="message__text">
      <Linkified text={main} />
      {quoted && (
        <>
          <button type="button" className="message__quoted-toggle" onClick={() => setShowQuoted((v) => !v)} aria-expanded={showQuoted}>
            {showQuoted ? 'Hide quoted text' : '•••'}
            <span className="visually-hidden">Show quoted text</span>
          </button>
          {showQuoted && (
            <blockquote className="message__quoted">
              <Linkified text={quoted} />
            </blockquote>
          )}
        </>
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

function splitQuoted(text: string): [string, string] {
  const lines = text.split('\n')
  const start = lines.findIndex((line, index) => /^On .+wrote:\s*$/.test(line.trim()) || (line.startsWith('>') && lines.slice(index).every((l) => l.startsWith('>') || !l.trim())))
  if (start <= 0) return [text.trimEnd(), '']
  return [lines.slice(0, start).join('\n').trimEnd(), lines.slice(start).join('\n').trim()]
}
