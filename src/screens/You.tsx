import { useState, type ComponentType, type ReactNode, type SVGProps } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { Select } from '../components/fields'
import { Illustration } from '../components/Illustration'
import { ShortcutList } from '../components/GlobalShortcuts'
import { AppearanceIcon, BackIcon, ContactsIcon, InfoIcon, KeyboardIcon, NextIcon, SignOutIcon, TagIcon, TranslateIcon, UserIcon } from '../components/icons'
import { useFeedback } from '../components/overlays'
import { Avatar, Button, IconButton, Segmented, TagChip } from '../components/ui'
import { useIsMobile } from '../lib/hooks'
import { TAG_INFO } from '../lib/tags'
import { useTheme } from '../lib/theme'
import { languageName, LANGUAGES, setTargetLanguage, targetLanguage } from '../lib/translate'
import { TAGS } from '../lib/types'
import { ContactsPanel } from './ContactsPanel'

// Settings, in sections: a list on the left, the chosen section on the right (/you/<section>).
// On a phone the list comes first and a section opens on its own screen.

interface Section {
  id: string
  label: string
  /** Under the title. */
  about: string
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
  render: () => ReactNode
}

const SECTIONS: Section[] = [
  { id: 'account', label: 'Account', about: 'Who is signed in, and the Google account Rayons reads from.', icon: UserIcon, render: () => <AccountSection /> },
  { id: 'contacts', label: 'Contacts', about: 'People Rayons suggests when you write.', icon: ContactsIcon, render: () => <ContactsPanel /> },
  { id: 'appearance', label: 'Appearance', about: 'How Rayons looks on this device.', icon: AppearanceIcon, render: () => <AppearanceSection /> },
  { id: 'translation', label: 'Translation', about: 'The language mail is translated into.', icon: TranslateIcon, render: () => <TranslationSection /> },
  { id: 'tags', label: 'Tags', about: 'The four tags that sort mail and events.', icon: TagIcon, render: () => <TagsSection /> },
  { id: 'keyboard', label: 'Keyboard', about: 'Every shortcut. Press ? anywhere to see them.', icon: KeyboardIcon, render: () => <ShortcutList /> },
  { id: 'about', label: 'About', about: 'Rayons, and what it keeps.', icon: InfoIcon, render: () => <AboutSection /> },
]

export function YouScreen() {
  const { section: sectionId } = useParams()
  const mobile = useIsMobile()
  const navigate = useNavigate()
  const { backend, state } = useAuth()
  const account = backend?.account
  const section = SECTIONS.find((s) => s.id === sectionId) ?? (mobile ? null : SECTIONS[0])

  return (
    <div className="split settings">
      {(!mobile || !section) && (
        <section className="list-pane settings__list" aria-label="Settings">
          <header className="list-pane__header list-pane__header--compact">
            <div className="list-pane__title">
              <h1>Settings</h1>
            </div>
            {account && (
              <div className="settings__who">
                <Avatar person={account} self photo={account.picture} />
                <span className="settings__who-text">
                  <span className="medium">{account.name}</span>
                  <span className="muted">{state.status === 'demo' ? 'Demo' : account.email}</span>
                </span>
              </div>
            )}
          </header>
          <nav className="list-pane__body">
            {SECTIONS.map((s) => (
              <NavLink key={s.id} to={`/you/${s.id}`} replace={!mobile} className={`settings-row ${section?.id === s.id ? 'is-selected' : ''}`} aria-current={section?.id === s.id ? 'page' : undefined}>
                <s.icon size={18} />
                <span className="settings-row__label">{s.label}</span>
                {mobile && <NextIcon size={16} className="settings-row__chevron" />}
              </NavLink>
            ))}
            <Illustration kind="sidebar" className="list-art" />
          </nav>
        </section>
      )}
      {section && (
        <main className="detail-pane page settings__detail">
          <header className="page__header settings__header">
            {mobile && <IconButton icon={BackIcon} label="All settings" size={24} onClick={() => navigate('/you')} />}
            <div>
              <h1>{section.label}</h1>
              <p className="muted">{section.about}</p>
            </div>
          </header>
          <div className="page__body">{section.render()}</div>
        </main>
      )}
    </div>
  )
}

function AccountSection() {
  const { state, backend, liveEnabled, signIn, leaveDemo, resetDemoData, signOut, disconnectGoogle } = useAuth()
  const notify = useFeedback()
  const account = backend?.account
  const demo = state.status === 'demo'
  return (
    <section className="panel">
      {account && (
        <div className="account">
          <Avatar person={account} self photo={account.picture} />
          <div>
            <p className="medium">{account.name}</p>
            <p className="muted">{account.email}</p>
          </div>
          <span className={`status-pill ${demo ? '' : 'is-live'}`}>{demo ? 'Demo' : 'Gmail and Calendar connected'}</span>
        </div>
      )}
      {demo ? (
        <>
          <p className="muted">You are trying Rayons with made-up mail, events and projects, kept in this browser only. Changes you make stay here until you reset them.</p>
          <div className="panel__actions">
            {liveEnabled && (
              <Button
                variant="accent"
                onClick={() => {
                  leaveDemo()
                  void signIn()
                }}
              >
                Use my Google account
              </Button>
            )}
            <Button
              onClick={() => {
                resetDemoData()
                notify('Demo data reset')
              }}
            >
              Reset demo data
            </Button>
            {liveEnabled && (
              <Button variant="ghost" onClick={leaveDemo}>
                Leave the demo
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="panel__actions">
          <Button icon={SignOutIcon} onClick={signOut}>
            Sign out
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm('Disconnect Google? Rayons will stop reading your mail and calendar. Your projects, notes and files are kept.')) return
              await disconnectGoogle()
            }}
          >
            Disconnect Google
          </Button>
        </div>
      )}
    </section>
  )
}

function AppearanceSection() {
  const theme = useTheme()
  return (
    <section className="panel">
      <div className="panel__row">
        <Segmented
          label="Theme"
          value={theme.preference}
          onChange={theme.setPreference}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <span className="muted">{theme.preference === 'system' ? `Following your device (${theme.resolved} now).` : 'Kept on this device.'}</span>
      </div>
    </section>
  )
}

function TranslationSection() {
  const [translateTo, setTranslateTo] = useState(targetLanguage)
  return (
    <section className="panel">
      <div className="panel__row">
        <div className="field field--inline">
          <span className="field__label">Translate mail into</span>
          <Select
            label="Translate mail into"
            searchable
            value={translateTo}
            onChange={(code) => {
              setTargetLanguage(code)
              setTranslateTo(code)
            }}
            options={[...new Set([translateTo, ...LANGUAGES])].map((code) => ({ value: code, label: languageName(code), hint: code }))}
          />
        </div>
        <span className="muted">
          Press <kbd>t</kbd> in a conversation to translate it.
        </span>
      </div>
    </section>
  )
}

function TagsSection() {
  return (
    <section className="panel">
      <p className="muted">Anything untagged counts as “other”. In Gmail the tags appear as labels under “Rayons”.</p>
      <ul className="tag-legend" role="list">
        {TAGS.map((tag) => (
          <li key={tag}>
            <TagChip tag={tag} />
            <span>{TAG_INFO[tag].meaning}</span>
          </li>
        ))}
        <li>
          <TagChip tag={null} />
          <span>Everything else. Most mail never needs a tag.</span>
        </li>
      </ul>
    </section>
  )
}

function AboutSection() {
  return (
    <section className="panel">
      <p className="muted">
        Rayons {__APP_VERSION__}. Open source under the MIT licence. Your mail and events are read from Google each time and are not copied to our database; only projects,
        notes, uploaded files and your contacts list are stored.
      </p>
      <p>
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
          Privacy
        </a>
      </p>
    </section>
  )
}
