import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { SignOutIcon } from '../components/icons'
import { useFeedback } from '../components/overlays'
import { ShortcutList } from '../components/GlobalShortcuts'
import { Avatar, Button, Segmented, TagChip } from '../components/ui'
import { useTheme } from '../lib/theme'
import { languageName, LANGUAGES, setTargetLanguage, targetLanguage } from '../lib/translate'
import { TAG_INFO } from '../lib/tags'
import { TAGS } from '../lib/types'
import { ContactsPanel } from './ContactsPanel'

export function YouScreen() {
  const { state, backend, liveEnabled, signIn, leaveDemo, resetDemoData, signOut, disconnectGoogle } = useAuth()
  const notify = useFeedback()
  const theme = useTheme()
  const [translateTo, setTranslateTo] = useState(targetLanguage)
  const account = backend?.account
  const demo = state.status === 'demo'

  return (
    <main className="page">
      <header className="page__header">
        <h1>You</h1>
      </header>
      <div className="page__body">
        <section className="panel">
          <h2 className="panel__title">Account</h2>
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
              <p className="muted">
                You are trying Rayons with made-up mail, events and projects, kept in this browser only. Changes you make stay here until you reset them.
              </p>
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
                {liveEnabled && <Button variant="ghost" onClick={leaveDemo}>Leave the demo</Button>}
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

        <ContactsPanel />

        <section className="panel">
          <h2 className="panel__title">Tags</h2>
          <p className="muted">Four tags sort your mail and events. Anything untagged counts as “other”. In Gmail they appear as labels under “Rayons”.</p>
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

        <section className="panel">
          <h2 className="panel__title">Appearance</h2>
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

        <section className="panel">
          <h2 className="panel__title">Translation</h2>
          <div className="panel__row">
            <label className="field field--inline">
              <span className="field__label">Translate mail into</span>
              <select
                className="field__input"
                value={translateTo}
                onChange={(event) => {
                  setTargetLanguage(event.target.value)
                  setTranslateTo(event.target.value)
                }}
              >
                {[...new Set([translateTo, ...LANGUAGES])].map((code) => (
                  <option key={code} value={code}>
                    {languageName(code)}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted">Press <kbd>t</kbd> in a conversation to translate it.</span>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel__title">Keyboard</h2>
          <p className="muted">
            Press <kbd>?</kbd> anywhere for this list. Hover a button to see its shortcut.
          </p>
          <ShortcutList />
        </section>

        <section className="panel">
          <h2 className="panel__title">About</h2>
          <p className="muted">
            Rayons {__APP_VERSION__}. Open source under the MIT licence. Your mail and events are read from Google each time and are not copied to our database; only projects, notes and uploaded files are stored.
          </p>
        </section>
      </div>
    </main>
  )
}
