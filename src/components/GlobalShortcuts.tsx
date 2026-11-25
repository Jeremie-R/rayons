import { useState } from 'react'
import { useNavigate } from 'react-router'
import { keyCaps, SHORTCUTS, useShortcut } from '../lib/shortcuts'
import { Dialog } from './overlays'

/** g then i/c/p/s to move around, ? for the list of shortcuts. */
export function GlobalShortcuts() {
  const navigate = useNavigate()
  const [help, setHelp] = useState(false)
  useShortcut('g i', () => navigate('/inbox'))
  useShortcut('g c', () => navigate('/calendar'))
  useShortcut('g p', () => navigate('/projects'))
  useShortcut('g s', () => navigate('/you'))
  useShortcut('?', () => setHelp(true))
  return (
    <Dialog open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts" wide>
      <ShortcutList />
    </Dialog>
  )
}

export function ShortcutList() {
  return (
    <div className="shortcut-groups">
      {SHORTCUTS.map((group) => (
        <section key={group.group} className="shortcut-group">
          <h3>{group.group}</h3>
          <dl className="shortcuts">
            {group.items.map(([keys, what]) => (
              <div key={keys}>
                <dt>
                  {keyCaps(keys).map((cap, index) => (
                    <kbd key={index}>{cap}</kbd>
                  ))}
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
