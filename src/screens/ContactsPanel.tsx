import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { takeSignInFollowUp } from '../auth/followUp'
import { CloseIcon, ContactsIcon, SearchIcon } from '../components/icons'
import { useFeedback } from '../components/overlays'
import { Avatar, Button, IconButton } from '../components/ui'
import { CONTACT_SCOPES } from '../data/config'
import { invalidate, keys, useBackend, updateCached } from '../data/store'
import { suggestContacts } from '../lib/contacts'
import type { Contact } from '../lib/types'
import { errorText } from '../mail/actions'
import { useContacts } from '../mail/Recipients'

const PAGE = 40

/** Most used first: people you write to, then people you hear from, then the rest by name. */
const byUse = (a: Contact, b: Contact) => b.sent * 4 + b.seen - (a.sent * 4 + a.seen) || (a.name || a.email).localeCompare(b.name || b.email)

export function ContactsPanel() {
  const backend = useBackend()
  const { signIn } = useAuth()
  const notify = useFeedback()
  const contacts = useContacts()
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [importing, setImporting] = useState(false)
  const fromGoogle = contacts.filter((c) => c.source === 'google').length

  const list = useMemo(() => (query.trim() ? suggestContacts(contacts, query, [], 200) : [...contacts].sort(byUse)), [contacts, query])

  const importFromGoogle = async () => {
    setImporting(true)
    try {
      const { count } = await backend.importContacts()
      invalidate(keys.contacts)
      notify(count ? `${count} contacts from Google are ready to suggest` : 'Google had no contacts with an email address')
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === 'needs_contacts_scope' || code === 'needs_scope') {
        // Google asks once; this page imports when it comes back.
        await signIn({ scopes: CONTACT_SCOPES, then: 'import-contacts' })
        return
      }
      notify(errorText(error), { tone: 'error' })
    } finally {
      setImporting(false)
    }
  }

  useEffect(() => {
    if (takeSignInFollowUp() === 'import-contacts') void importFromGoogle()
  }, [])

  const clearAll = async () => {
    if (!confirm(`Delete all ${contacts.length} contacts from Rayons? Your Google Contacts are not touched; you can import them again.`)) return
    updateCached<Contact[]>(keys.contacts, () => [])
    try {
      await backend.clearContacts()
      notify('Contacts cleared')
    } catch (error) {
      notify(errorText(error), { tone: 'error' })
    } finally {
      invalidate(keys.contacts)
    }
  }

  const forget = async (contact: Contact) => {
    updateCached<Contact[]>(keys.contacts, (data) => data.filter((c) => c.email !== contact.email))
    try {
      await backend.forgetContact(contact.email)
    } catch (error) {
      notify(errorText(error), { tone: 'error' })
      invalidate(keys.contacts)
    }
  }

  return (
    <section className="panel">
      <h2 className="panel__title">Contacts</h2>
      <p className="muted">
        When you type in To, Cc or Bcc, Rayons suggests people from your Google contacts and people from mail you open or write. They are kept in your Rayons
        account, not shared.
      </p>
      <div className="panel__row">
        <Button icon={ContactsIcon} onClick={importFromGoogle} disabled={importing}>
          {importing ? 'Importing…' : fromGoogle ? 'Import again from Google' : 'Import from Google'}
        </Button>
        <span className="muted">
          {contacts.length} {contacts.length === 1 ? 'person' : 'people'}
          {fromGoogle ? `, ${fromGoogle} from Google` : ''}
        </span>
        {contacts.length > 0 && (
          <Button variant="ghost" className="panel__end" onClick={clearAll}>
            Clear contacts
          </Button>
        )}
      </div>
      {contacts.length > 0 && (
        <>
          <label className="contacts-search">
            <SearchIcon size={16} />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setShown(PAGE)
              }}
              placeholder="Find someone"
              aria-label="Find a contact"
            />
          </label>
          <ul className="contacts" role="list">
            {list.slice(0, shown).map((contact) => (
              <li key={contact.email} className="contact">
                <Avatar person={contact} photo={contact.photo} />
                <span className="contact__text">
                  <span className="contact__name">{contact.name || contact.email}</span>
                  {contact.name && <span className="contact__email muted">{contact.email}</span>}
                </span>
                <span className="contact__source muted">{contact.source === 'google' ? 'Google' : contact.sent ? `Wrote ${contact.sent}×` : 'From mail'}</span>
                <IconButton icon={CloseIcon} label="Stop suggesting" size={20} onClick={() => forget(contact)} />
              </li>
            ))}
          </ul>
          {list.length > shown && (
            <Button variant="ghost" onClick={() => setShown((n) => n + PAGE * 3)}>
              Show more ({list.length - shown})
            </Button>
          )}
          {query && list.length === 0 && <p className="muted">Nobody matches “{query}”.</p>}
        </>
      )}
    </section>
  )
}
