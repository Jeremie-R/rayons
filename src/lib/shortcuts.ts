import { useEffect, useRef } from 'react'

// Keyboard shortcuts, following Gmail and Google Calendar where they have one.
// Keys are written as `event.key` values: 'e', 'U' (shift+u), '#', '?', 'Escape', 'ArrowLeft'.
// A space makes a sequence: 'g i' is g then i, within 1.2 seconds.
// The most recently mounted handler for a key wins, so a dialog can override a screen.

interface Entry {
  keys: string
  run: { current: () => void }
  enabled: { current: boolean }
}

const entries: Entry[] = []
let prefix: string | null = null
let prefixTimer: number | undefined
let installed = false

function editable(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return !!element?.closest?.('input, textarea, select, [contenteditable="true"], iframe')
}

function onKeyDown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return
  if (editable(event.target)) return
  // Menus and dialogs handle their own keys; an open popover only lets Escape through.
  if (document.querySelector('dialog[open], .menu')) return
  const key = event.key
  if (key !== 'Escape' && document.querySelector('[data-blocks-shortcuts]')) return

  const combo = prefix ? `${prefix} ${key}` : key
  const match = [...entries].reverse().find((entry) => entry.keys === combo && entry.enabled.current)
  window.clearTimeout(prefixTimer)
  if (match) {
    event.preventDefault()
    prefix = null
    match.run.current()
    return
  }
  if (!prefix && entries.some((entry) => entry.enabled.current && entry.keys.startsWith(`${key} `))) {
    prefix = key
    prefixTimer = window.setTimeout(() => (prefix = null), 1200)
    return
  }
  prefix = null
}

export function useShortcut(keys: string, handler: () => void, enabled = true) {
  const run = useRef(handler)
  run.current = handler
  const on = useRef(enabled)
  on.current = enabled
  useEffect(() => {
    if (!installed) {
      window.addEventListener('keydown', onKeyDown)
      installed = true
    }
    const entry: Entry = { keys, run, enabled: on }
    entries.push(entry)
    return () => {
      entries.splice(entries.indexOf(entry), 1)
    }
  }, [keys])
}

/** Every shortcut, for the help sheet (?) and the You screen. */
export const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'Everywhere',
    items: [
      ['g i', 'Go to inbox'],
      ['g c', 'Go to calendar'],
      ['g p', 'Go to projects'],
      ['g s', 'Go to settings'],
      ['Mod k', 'Command bar'],
      ['?', 'Show shortcuts'],
    ],
  },
  {
    group: 'Mail',
    items: [
      ['c', 'New message'],
      ['/', 'Search'],
      ['j', 'Next conversation'],
      ['k', 'Previous conversation'],
      ['u', 'Back to the list'],
      ['r', 'Reply'],
      ['e', 'Archive'],
      ['#', 'Move to trash'],
      ['!', 'Report spam'],
      ['l', 'Tag'],
      ['p', 'Add to project'],
      ['v', 'Add to calendar'],
      ['I', 'Mark as read'],
      ['U', 'Mark as unread'],
    ],
  },
  {
    group: 'Calendar',
    items: [
      ['c', 'New event'],
      ['t', 'Today'],
      ['j', 'Next period'],
      ['k', 'Previous period'],
      ['a', 'Schedule'],
      ['d', 'Day'],
      ['w', 'Week'],
      ['m', 'Month'],
      ['y', 'Year'],
    ],
  },
  {
    group: 'Projects',
    items: [
      ['c', 'New project'],
      ['j', 'Next project'],
      ['k', 'Previous project'],
    ],
  },
]

/** 'U' → ['⇧', 'U'], 'g i' → ['G', 'I'], '#' → ['#']. For key caps. */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function keyCaps(keys: string) {
  return keys.split(' ').flatMap((key) => {
    if (key === 'Mod') return [isMac ? '⌘' : 'Ctrl']
    if (key === 'Shift') return ['⇧']
    if (key === 'Escape') return ['Esc']
    if (key === 'Enter') return ['↵']
    if (key === 'ArrowLeft') return ['←']
    if (key === 'ArrowRight') return ['→']
    if (/^[A-Z]$/.test(key)) return ['⇧', key]
    return [key.toUpperCase()]
  })
}
