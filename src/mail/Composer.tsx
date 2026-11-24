import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { ComposeIcon as SendIcon } from '../components/icons'
import { Dialog, useFeedback } from '../components/overlays'
import { Button } from '../components/ui'
import { invalidate, keys, useBackend } from '../data/store'
import type { Person, Thread } from '../lib/types'
import { errorText } from './actions'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** Who a reply goes to: the latest sender who isn't you, or, if you wrote last, the people you wrote to. */
export function replyRecipients(thread: Thread, me: string): Person[] {
  const messages = [...thread.messages].reverse()
  const fromOther = messages.find((m) => m.from.email.toLowerCase() !== me.toLowerCase())
  if (fromOther) return [fromOther.from]
  return messages[0]?.to ?? []
}

export const formatPeople = (people: Person[]) => people.map((p) => p.name || p.email).join(', ')

export function ReplyComposer({ thread, onDone }: { thread: Thread; onDone: () => void }) {
  const backend = useBackend()
  const notify = useFeedback()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const to = replyRecipients(thread, backend.account.email)

  const send = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await backend.send({
        to,
        cc: [],
        subject: /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`,
        text,
        threadId: thread.id,
      })
      invalidate(keys.thread(thread.id), keys.threads, keys.projects)
      notify('Sent')
      onDone()
    } catch (error) {
      notify(errorText(error), { tone: 'error' })
    } finally {
      setSending(false)
    }
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <p className="composer__to">
        <span className="muted">To</span> {formatPeople(to)}
      </p>
      <AutoTextarea value={text} onChange={setText} onSubmit={send} placeholder="Write your reply…" label="Reply" autoFocus />
      <div className="composer__actions">
        <Button variant="ghost" onClick={onDone}>
          Discard
        </Button>
        <Button variant="accent" type="submit" icon={SendIcon} disabled={!text.trim() || sending} title={`Send (${isMac ? '⌘' : 'Ctrl'}+Enter)`}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </form>
  )
}

export function ComposeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const backend = useBackend()
  const notify = useFeedback()
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const recipients = parseRecipients(to)
  const valid = recipients.length > 0 && recipients.every((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))

  const reset = () => {
    setTo('')
    setSubject('')
    setText('')
  }

  const send = async () => {
    if (!valid || sending) return
    setSending(true)
    try {
      await backend.send({ to: recipients, cc: [], subject, text })
      invalidate(keys.threads)
      notify('Sent')
      reset()
      onClose()
    } catch (error) {
      notify(errorText(error), { tone: 'error' })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New message"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="accent" icon={SendIcon} disabled={!valid || sending} onClick={send}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </>
      }
    >
      <div className="form">
        <label className="field">
          <span className="field__label">To</span>
          <input className="field__input" type="text" inputMode="email" autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" autoFocus />
        </label>
        <label className="field">
          <span className="field__label">Subject</span>
          <input className="field__input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <div className="field">
          <span className="field__label" id="compose-body">
            Message
          </span>
          <AutoTextarea value={text} onChange={setText} onSubmit={send} label="Message" minRows={8} />
        </div>
      </div>
    </Dialog>
  )
}

/** "Sam <sam@x.com>, maja@y.com" → people. */
export function parseRecipients(value: string): Person[] {
  return value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.*)<([^>]+)>$/)
      if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() }
      return { name: '', email: part }
    })
}

export function AutoTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  autoFocus,
  minRows = 4,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  placeholder?: string
  label: string
  autoFocus?: boolean
  minRows?: number
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && onSubmit) {
      event.preventDefault()
      onSubmit()
    }
  }
  return (
    <textarea
      ref={ref}
      className={`field__input field__textarea ${className}`}
      aria-label={label}
      value={value}
      rows={minRows}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
      onChange={(event) => onChange(event.target.value)}
      style={{ fieldSizing: 'content' } as CSSProperties}
    />
  )
}
