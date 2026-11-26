import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from 'react'
import { CloseIcon, CollapseIcon, ComposeIcon as SendIcon, ExpandIcon, ImageIcon, TrashIcon } from '../components/icons'
import { useFeedback } from '../components/overlays'
import { Editor } from '../components/Editor'
import type { RichEditorHandle, RichValue } from '../components/RichEditor'
import { Button, IconButton, tooltip } from '../components/ui'
import { invalidate, keys, useBackend } from '../data/store'
import { isEmail } from '../lib/contacts'
import { useIsMobile } from '../lib/hooks'
import type { Draft, Person, Thread } from '../lib/types'
import { errorText } from './actions'
import { RecipientField, useContacts } from './Recipients'

const EMPTY: RichValue = { html: '', text: '', empty: true }
// Vercel takes requests up to 4.5 MB; pictures are sent inside the request.
const MAX_DRAFT = 4_300_000

const sameEmail = (a: Person, b: Person) => a.email.toLowerCase() === b.email.toLowerCase()
const unique = (people: Person[], skip: Person[] = []) =>
  people.filter((person, index) => !skip.some((s) => sameEmail(s, person)) && people.findIndex((p) => sameEmail(p, person)) === index)

/** Who a reply goes to: the latest sender who isn't you, or, if you wrote last, the people you wrote to. */
export function replyRecipients(thread: Thread, me: string): Person[] {
  const messages = [...thread.messages].reverse()
  const fromOther = messages.find((m) => m.from.email.toLowerCase() !== me.toLowerCase())
  if (fromOther) return [fromOther.from]
  return messages[0]?.to ?? []
}

/** Everyone on the latest message, as Gmail's "Reply all" does: its sender and To in To, its Cc in Cc. */
export function replyAllRecipients(thread: Thread, me: string): { to: Person[]; cc: Person[] } {
  const latest = thread.messages[thread.messages.length - 1]
  if (!latest) return { to: [], cc: [] }
  const self = { name: '', email: me }
  const fromMe = sameEmail(latest.from, self)
  const to = unique(fromMe ? latest.to : [latest.from, ...latest.to], [self])
  return { to, cc: unique(latest.cc, [self, ...to]) }
}

export const formatPeople = (people: Person[]) => people.map((p) => p.name || p.email).join(', ')

/** Sends, remembers who it went to, and refreshes what needs it. */
function useSend() {
  const backend = useBackend()
  return async (draft: Draft) => {
    if (JSON.stringify(draft).length > MAX_DRAFT) throw new Error('That is too large to send. Try smaller or fewer pictures.')
    await backend.send(draft)
    void backend
      .rememberContacts([...draft.to, ...draft.cc, ...(draft.bcc ?? [])], 'sent')
      .then(() => invalidate(keys.contacts))
      .catch((error) => console.warn('Could not remember contacts', error))
  }
}

interface AddressState {
  to: Person[]
  cc: Person[]
  bcc: Person[]
  showCc: boolean
  showBcc: boolean
}

/** To, and Cc / Bcc when asked for (or already filled). */
function AddressFields({ value, onChange, autoFocus, extra }: { value: AddressState; onChange: (next: AddressState) => void; autoFocus?: boolean; extra?: ReactNode }) {
  const contacts = useContacts()
  const all = [...value.to, ...value.cc, ...value.bcc].map((p) => p.email)
  const set = (patch: Partial<AddressState>) => onChange({ ...value, ...patch })
  const toggles = (
    <>
      {extra}
      {!value.showCc && (
        <button type="button" className="text-button" onClick={() => set({ showCc: true })}>
          Cc
        </button>
      )}
      {!value.showBcc && (
        <button type="button" className="text-button" onClick={() => set({ showBcc: true })}>
          Bcc
        </button>
      )}
    </>
  )
  return (
    <div className="address-fields">
      <RecipientField label="To" people={value.to} onChange={(to) => set({ to })} contacts={contacts} exclude={all} autoFocus={autoFocus} aside={toggles} />
      {value.showCc && <RecipientField label="Cc" people={value.cc} onChange={(cc) => set({ cc })} contacts={contacts} exclude={all} autoFocus={!value.cc.length} />}
      {value.showBcc && <RecipientField label="Bcc" people={value.bcc} onChange={(bcc) => set({ bcc })} contacts={contacts} exclude={all} autoFocus={!value.bcc.length} />}
    </div>
  )
}

const readyToSend = (a: AddressState) => {
  const everyone = [...a.to, ...a.cc, ...a.bcc]
  return everyone.length > 0 && everyone.every((p) => isEmail(p.email))
}

/** A hidden file picker for pictures, and the button that opens it. */
function AddPicture({ editor }: { editor: RefObject<RichEditorHandle | null> }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <IconButton icon={ImageIcon} label="Add a picture (or paste one)" size={20} onClick={() => input.current?.click()} />
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files?.length) editor.current?.addImages(event.target.files)
          event.target.value = ''
        }}
      />
    </>
  )
}

export function ReplyComposer({ thread, all, onDone }: { thread: Thread; all: boolean; onDone: () => void }) {
  const backend = useBackend()
  const notify = useFeedback()
  const send = useSend()
  const me = backend.account.email
  const editor = useRef<RichEditorHandle>(null)
  const [addresses, setAddresses] = useState<AddressState>(() => {
    const { to, cc } = all ? replyAllRecipients(thread, me) : { to: replyRecipients(thread, me), cc: [] }
    return { to, cc, bcc: [], showCc: cc.length > 0, showBcc: false }
  })
  const [value, setValue] = useState<RichValue>(EMPTY)
  const [sending, setSending] = useState(false)
  const sender = replyRecipients(thread, me)
  const many = addresses.to.length + addresses.cc.length > 1

  const submit = async () => {
    if (value.empty || sending || !readyToSend(addresses)) return
    setSending(true)
    try {
      await send({
        to: addresses.to,
        cc: addresses.cc,
        bcc: addresses.bcc,
        subject: /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`,
        text: value.text,
        html: value.html,
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
        void submit()
      }}
    >
      <AddressFields
        value={addresses}
        onChange={setAddresses}
        extra={
          many && sender.length === 1 ? (
            <button type="button" className="text-button" onClick={() => setAddresses({ ...addresses, to: sender, cc: [], showCc: false })} {...tooltip('Reply to the sender only')}>
              Only {sender[0].name.split(' ')[0] || sender[0].email}
            </button>
          ) : null
        }
      />
      <Editor
        ref={editor}
        content=""
        label="Reply"
        placeholder="Write your reply…"
        autoFocus
        className="composer__editor"
        onChange={setValue}
        onSubmit={submit}
        onEscape={() => value.empty && onDone()}
      />
      <div className="composer__actions">
        <AddPicture editor={editor} />
        <span className="composer__spacer" />
        <Button variant="ghost" onClick={onDone}>
          Discard
        </Button>
        <Button variant="accent" type="submit" icon={SendIcon} disabled={value.empty || sending || !readyToSend(addresses)} hint={many ? 'Send to everyone' : 'Send'} shortcut="Mod Enter">
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </form>
  )
}

// New message: a panel in the bottom-right corner (full screen on phones). It stays open while
// you move around the app, and can be folded down to its title bar.

interface ComposeApi {
  open: (prefill?: { to?: Person[]; subject?: string }) => void
}

const ComposeContext = createContext<ComposeApi>({ open: () => {} })
export const useCompose = () => useContext(ComposeContext)

export function ComposeProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ id: number; to: Person[]; subject: string } | null>(null)
  const [folded, setFolded] = useState(false)
  const api: ComposeApi = {
    open: (prefill) => {
      setFolded(false)
      // An open draft stays as it is.
      setSession((current) => current ?? { id: Date.now(), to: prefill?.to ?? [], subject: prefill?.subject ?? '' })
    },
  }
  return (
    <ComposeContext.Provider value={api}>
      {children}
      {session && <ComposePanel key={session.id} initialTo={session.to} initialSubject={session.subject} folded={folded} onFold={setFolded} onClose={() => setSession(null)} />}
    </ComposeContext.Provider>
  )
}

function ComposePanel({
  initialTo,
  initialSubject,
  folded,
  onFold,
  onClose,
}: {
  initialTo: Person[]
  initialSubject: string
  folded: boolean
  onFold: (folded: boolean) => void
  onClose: () => void
}) {
  const notify = useFeedback()
  const send = useSend()
  const mobile = useIsMobile()
  const editor = useRef<RichEditorHandle>(null)
  const [addresses, setAddresses] = useState<AddressState>({ to: initialTo, cc: [], bcc: [], showCc: false, showBcc: false })
  const [subject, setSubject] = useState(initialSubject)
  const [value, setValue] = useState<RichValue>(EMPTY)
  const [sending, setSending] = useState(false)
  const [wide, setWide] = useState(false)
  const touched = !value.empty || !!subject.trim() || addresses.to.length + addresses.cc.length + addresses.bcc.length > initialTo.length

  const discard = () => {
    if (touched && !confirm('Discard this message?')) return
    onClose()
  }

  const submit = async () => {
    if (sending || !readyToSend(addresses)) return
    setSending(true)
    try {
      await send({ to: addresses.to, cc: addresses.cc, bcc: addresses.bcc, subject: subject.trim(), text: value.text, html: value.html })
      invalidate(keys.threads)
      notify('Sent')
      onClose()
    } catch (error) {
      notify(errorText(error), { tone: 'error' })
    } finally {
      setSending(false)
    }
  }

  const title = subject.trim() || 'New message'

  return (
    <section
      className={`compose-panel ${folded ? 'is-folded' : ''} ${wide && !mobile ? 'is-wide' : ''}`}
      aria-label="New message"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented && !folded) {
          event.preventDefault()
          onFold(true)
        }
      }}
    >
      <header className="compose-panel__bar">
        <button type="button" className="compose-panel__title" onClick={() => onFold(!folded)} {...tooltip(folded ? 'Open' : 'Fold down', folded ? undefined : 'Escape')}>
          {title}
        </button>
        {!mobile && !folded && <IconButton icon={wide ? CollapseIcon : ExpandIcon} label={wide ? 'Smaller' : 'Larger'} size={20} onClick={() => setWide((w) => !w)} />}
        <IconButton icon={CloseIcon} label="Discard" size={20} onClick={discard} />
      </header>
      <form
        className="compose-panel__body"
        hidden={folded}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <AddressFields value={addresses} onChange={setAddresses} autoFocus={!initialTo.length} />
        <input
          className="compose-panel__subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Subject"
          aria-label="Subject"
          autoFocus={initialTo.length > 0}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              editor.current?.focus()
            }
          }}
        />
        <Editor
          ref={editor}
          content=""
          label="Message"
          placeholder="Write your message…"
          className="compose-panel__editor"
          onChange={setValue}
          onSubmit={submit}
          onEscape={() => onFold(true)}
        />
        <div className="composer__actions compose-panel__actions">
          <Button variant="accent" type="submit" icon={SendIcon} disabled={sending || !readyToSend(addresses)} hint="Send" shortcut="Mod Enter">
            {sending ? 'Sending…' : 'Send'}
          </Button>
          <AddPicture editor={editor} />
          <span className="composer__spacer" />
          <IconButton icon={TrashIcon} label="Discard" size={20} onClick={discard} />
        </div>
      </form>
    </section>
  )
}
