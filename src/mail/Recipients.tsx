import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import { CloseIcon } from '../components/icons'
import { Avatar, tooltip } from '../components/ui'
import { keys, useBackend, useQuery } from '../data/store'
import { rememberPhotos } from '../lib/avatars'
import { isEmail, parseAddress, suggestContacts } from '../lib/contacts'
import type { Contact, Person } from '../lib/types'

// To, Cc and Bcc: each address becomes a chip once you press Enter (or a comma, or Tab, or
// leave the field). Click a chip to edit it; Backspace in an empty field takes the last one
// back for editing. Typing a name suggests people from your contacts.

const NONE: Contact[] = []

export function useContacts() {
  const backend = useBackend()
  const contacts = useQuery(keys.contacts, () => backend.listContacts()).data ?? NONE
  useEffect(() => rememberPhotos(contacts), [contacts])
  return contacts
}

/** Splits pasted or typed text into addresses ("a@x.com, Sam <s@y.com>; …"). */
function splitAddresses(text: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  for (const char of text) {
    if (char === '"') quoted = !quoted
    if (!quoted && (char === ',' || char === ';' || char === '\n')) {
      if (current.trim()) parts.push(current.trim())
      current = ''
    } else current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

const toPerson = (text: string): Person => parseAddress(text) ?? { name: '', email: text.trim() }
const asText = (person: Person) => (person.name ? `${person.name} <${person.email}>` : person.email)

export function RecipientField({
  label,
  people,
  onChange,
  contacts,
  autoFocus,
  exclude = [],
  aside,
}: {
  label: string
  people: Person[]
  onChange: (people: Person[]) => void
  contacts: Contact[]
  autoFocus?: boolean
  /** Addresses not to suggest (already in another field). */
  exclude?: string[]
  /** Shown at the end of the row (the Cc / Bcc buttons). */
  aside?: ReactNode
}) {
  const [text, setText] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [focused, setFocused] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const suggestions = useMemo(
    () => (focused ? suggestContacts(contacts, text, [...people.map((p) => p.email), ...exclude]) : []),
    [contacts, text, people, exclude, focused],
  )
  const open = suggestions.length > 0

  const add = (more: Person[]) => {
    const known = new Set(people.map((p) => p.email.toLowerCase()))
    const fresh = more.filter((p) => p.email && !known.has(p.email.toLowerCase()) && known.add(p.email.toLowerCase()))
    if (fresh.length) onChange([...people, ...fresh])
  }

  /** Turns what was typed into chips. */
  const commit = (value = text) => {
    const parts = splitAddresses(value)
    if (!parts.length) return false
    add(parts.map(toPerson))
    setText('')
    setHighlight(0)
    return true
  }

  const pick = (contact: Contact) => {
    add([{ name: contact.name, email: contact.email }])
    setText('')
    setHighlight(0)
    input.current?.focus()
  }

  const edit = (index: number) => {
    const person = people[index]
    const rest = people.filter((_, i) => i !== index)
    // Keep what was being typed as a chip of its own.
    const typed = splitAddresses(text).map(toPerson)
    onChange([...rest, ...typed.filter((p) => !rest.some((r) => r.email.toLowerCase() === p.email.toLowerCase()))])
    setText(asText(person))
    requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.select()
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      setHighlight((h) => (h + (event.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length)
      return
    }
    if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey && text.trim())) {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) return // Send.
      if (open && suggestions[highlight] && !isEmail(text)) {
        event.preventDefault()
        pick(suggestions[highlight])
        return
      }
      if (text.trim()) {
        event.preventDefault()
        commit()
      }
      return
    }
    if ((event.key === ',' || event.key === ';') && text.trim() && !/^"[^"]*$/.test(text.trim())) {
      event.preventDefault()
      if (open && suggestions[highlight] && !isEmail(text)) pick(suggestions[highlight])
      else commit()
      return
    }
    if (event.key === 'Backspace' && !text && people.length) {
      event.preventDefault()
      edit(people.length - 1)
      return
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setFocused(false)
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text')
    if (splitAddresses(pasted).length > 1) {
      event.preventDefault()
      commit(`${text}${pasted}`)
    }
  }

  return (
    <div className="recipients" onClick={(event) => event.target === event.currentTarget && input.current?.focus()}>
      <label className="recipients__label" htmlFor={`${listId}-input`}>
        {label}
      </label>
      <div className="recipients__chips" onClick={(event) => event.target === event.currentTarget && input.current?.focus()}>
        {people.map((person, index) => {
          const valid = isEmail(person.email)
          return (
            <span key={person.email + index} className={`recipient-chip ${valid ? '' : 'is-invalid'}`}>
              <button type="button" className="recipient-chip__text" onClick={() => edit(index)} {...tooltip(valid ? `${person.email} · click to edit` : 'Not an email address · click to edit')}>
                {person.name || person.email}
              </button>
              <button type="button" className="recipient-chip__remove" aria-label={`Remove ${person.name || person.email}`} onClick={() => onChange(people.filter((_, i) => i !== index))}>
                <CloseIcon size={12} />
              </button>
            </span>
          )
        })}
        <span className="recipients__input-wrap">
          <input
            ref={input}
            id={`${listId}-input`}
            className="recipients__input"
            type="text"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus={autoFocus}
            value={text}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open ? `${listId}-${highlight}` : undefined}
            onChange={(event) => {
              setText(event.target.value)
              setHighlight(0)
              setFocused(true)
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false)
              if (isEmail(toPerson(text).email)) commit()
            }}
          />
          {open && (
            <ul className="suggestions" id={listId} role="listbox" aria-label="Suggestions">
              {suggestions.map((contact, index) => (
                <li
                  key={contact.email}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === highlight}
                  className={`suggestion ${index === highlight ? 'is-active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(contact)}
                >
                  <Avatar person={contact} photo={contact.photo} />
                  <span className="suggestion__text">
                    <span className="suggestion__name">{contact.name || contact.email}</span>
                    {contact.name && <span className="suggestion__email">{contact.email}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </span>
      </div>
      {aside && <div className="recipients__aside">{aside}</div>}
    </div>
  )
}
