import { useEffect, useMemo, useRef, useState, type ComponentType, type SVGProps } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { keys as cacheKeys, useBackend, useQuery } from '../data/store'
import { useCompose } from '../mail/Composer'
import { isMac, keyCaps } from '../lib/shortcuts'
import { setThemePreference } from '../lib/theme'
import {
  AddEventIcon,
  AddToProjectIcon,
  ArchiveIcon,
  CalendarIcon,
  ComposeIcon,
  FolderIcon,
  InboxIcon,
  ProjectsIcon,
  SearchIcon,
  SettingsIcon,
  SpamIcon,
  UserIcon,
} from './icons'

// ⌘K: a list of places and actions, ready without typing. Arrow keys and Enter (or a click)
// run one; typing narrows the list. Each line shows its own shortcut, to learn the faster way.

interface Command {
  id: string
  label: string
  group: 'Go to' | 'Create' | 'Projects' | 'Appearance'
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
  keys?: string
  /** Extra words that should find it. */
  words?: string
  run: () => void
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export function CommandBar() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(isMac ? event.metaKey : event.ctrlKey) || event.shiftKey || event.altKey) return
      // In the text editor ⌘K adds a link.
      if ((event.target as HTMLElement | null)?.closest?.('[contenteditable="true"]')) return
      event.preventDefault()
      setOpen((value) => !value)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return open ? <CommandPanel onClose={() => setOpen(false)} /> : null
}

function CommandPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const compose = useCompose()
  const backend = useBackend()
  const { data: projects } = useQuery(cacheKeys.projects, () => backend.listProjects())
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  const restore = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null)

  const { pathname, search } = useLocation()
  const here = pathname + search
  const go = (path: string) => () => navigate(path)
  const commands = useMemo<Command[]>(() => {
    const active = (projects ?? []).filter((p) => p.status === 'active').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    // Most used first: making something, then recent projects, then places.
    const order: Command['group'][] = ['Create', 'Projects', 'Go to', 'Appearance']
    const all: Command[] = [
      { id: 'inbox', label: 'Inbox', group: 'Go to', icon: InboxIcon, keys: 'g i', words: 'mail', run: go('/inbox') },
      { id: 'calendar', label: 'Calendar', group: 'Go to', icon: CalendarIcon, keys: 'g c', words: 'events agenda', run: go('/calendar') },
      { id: 'projects', label: 'Projects', group: 'Go to', icon: ProjectsIcon, keys: 'g p', run: go('/projects') },
      { id: 'you', label: 'You', group: 'Go to', icon: UserIcon, keys: 'g s', words: 'settings contacts account profile', run: go('/you') },
      { id: 'archived', label: 'Archived mail', group: 'Go to', icon: ArchiveIcon, run: go('/inbox?box=archived') },
      { id: 'sent', label: 'Sent mail', group: 'Go to', icon: ComposeIcon, run: go('/inbox?box=sent') },
      { id: 'spam', label: 'Spam', group: 'Go to', icon: SpamIcon, run: go('/inbox?box=spam') },
      { id: 'new-message', label: 'New message', group: 'Create', icon: ComposeIcon, keys: 'c', words: 'write compose email mail', run: () => compose.open() },
      { id: 'new-event', label: 'New event', group: 'Create', icon: AddEventIcon, words: 'meeting appointment calendar', run: go('/calendar?new=1') },
      { id: 'new-project', label: 'New project', group: 'Create', icon: AddToProjectIcon, run: go('/projects?new=1') },
      ...active.map<Command>((project) => ({ id: `project:${project.id}`, label: project.name, group: 'Projects', icon: FolderIcon, words: 'project', run: go(`/projects/${project.id}`) })),
      { id: 'theme-light', label: 'Light theme', group: 'Appearance', icon: SettingsIcon, words: 'appearance mode', run: () => setThemePreference('light') },
      { id: 'theme-dark', label: 'Dark theme', group: 'Appearance', icon: SettingsIcon, words: 'appearance mode night', run: () => setThemePreference('dark') },
      { id: 'theme-system', label: 'Theme like this device', group: 'Appearance', icon: SettingsIcon, words: 'appearance mode system auto', run: () => setThemePreference('system') },
    ]
    const path = (id: string) => ({ inbox: '/inbox', calendar: '/calendar', projects: '/projects', you: '/you', archived: '/inbox?box=archived', sent: '/inbox?box=sent', spam: '/inbox?box=spam' })[id]
    return all
      .filter((c) => path(c.id) !== here && !(c.id.startsWith('project:') && pathname.startsWith(`/projects/${c.id.slice(8)}`)))
      .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group))
  }, [projects, here, pathname])

  const shown = useMemo(() => {
    const q = fold(query.trim())
    if (!q) {
      // Without a search: places, actions and the five most recent projects.
      let projectsShown = 0
      return commands.filter((c) => c.group !== 'Appearance' && (c.group !== 'Projects' || projectsShown++ < 5))
    }
    const words = q.split(/\s+/)
    return commands.filter((c) => {
      const text = fold(`${c.label} ${c.words ?? ''} ${c.group}`)
      return words.every((word) => text.split(/\s+/).some((part) => part.startsWith(word)) || (word.length > 2 && text.includes(word)))
    })
  }, [commands, query])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const close = (refocus = true) => {
    onClose()
    if (refocus) restore.current?.focus?.()
  }
  const run = (command: Command | undefined) => {
    if (!command) return
    close(false)
    command.run()
  }

  return createPortal(
    <div className="command-scrim" onPointerDown={(event) => event.target === event.currentTarget && close()}>
      <div className="command" role="dialog" aria-label="Command bar" data-blocks-shortcuts="">
        <label className="command__search">
          <SearchIcon size={18} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Go to, create, or find a project…"
            aria-label="Command"
            aria-controls="command-list"
            aria-activedescendant={shown[active] ? `command-${shown[active].id}` : undefined}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                if (!shown.length) return
                setActive((i) => (i + (event.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length)
              } else if (event.key === 'Enter') {
                event.preventDefault()
                run(shown[active])
              } else if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                close()
              }
            }}
          />
          <kbd className="command__hint">{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </label>
        <ul className="command__list" id="command-list" role="listbox" ref={list}>
          {shown.map((command, index) => (
            <li key={command.id} role="presentation">
              {command.group !== shown[index - 1]?.group && <p className="command__group">{command.group}</p>}
              <button
                type="button"
                id={`command-${command.id}`}
                role="option"
                aria-selected={index === active}
                data-index={index}
                className={`command__item ${index === active ? 'is-active' : ''}`}
                onPointerMove={() => setActive(index)}
                onClick={() => run(command)}
                tabIndex={-1}
              >
                <command.icon size={16} />
                <span className="command__label">{command.label}</span>
                {command.keys && (
                  <span className="command__keys">
                    {keyCaps(command.keys).map((cap, i) => (
                      <kbd key={i}>{cap}</kbd>
                    ))}
                  </span>
                )}
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="command__empty">Nothing matches “{query}”.</li>}
        </ul>
        <p className="command__footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>↵</kbd> to open
          </span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
        </p>
      </div>
    </div>,
    document.body,
  )
}
