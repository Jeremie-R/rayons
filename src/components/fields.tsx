import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { addDays, addMonths, dateKey, formatLongDay, formatMonthYear, isSameDay, parseDate, startOfDay, startOfMonth, startOfWeek } from '../lib/dates'
import { CalendarIcon, ChevronDownIcon, ClockIcon, NextIcon, PrevIcon, SearchIcon } from './icons'
import { Popover } from './overlays'

// Pickers in the style of the tag menu, instead of the browser's own <select>, date and time
// inputs: a button that shows the value, and a small panel to choose (a sheet on phones).

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** The button that opens a picker. Looks like a text field. */
function Trigger({
  button,
  open,
  onOpen,
  label,
  popup,
  lead,
  children,
  disabled,
  chevron = true,
  className = '',
}: {
  button: RefObject<HTMLButtonElement | null>
  open: boolean
  onOpen: () => void
  label: string
  popup: 'listbox' | 'dialog'
  lead?: ReactNode
  children: ReactNode
  disabled?: boolean
  chevron?: boolean
  className?: string
}) {
  return (
    <button
      ref={button}
      type="button"
      className={`select ${className}`}
      aria-haspopup={popup}
      aria-expanded={open}
      aria-label={label}
      disabled={disabled}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      {lead && <span className="select__lead">{lead}</span>}
      <span className="select__value">{children}</span>
      {chevron && <ChevronDownIcon size={16} className="select__chevron" />}
    </button>
  )
}

function usePicker() {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const close = () => {
    setOpen(false)
    button.current?.focus()
  }
  return { open, button, close, toggle: () => setOpen((value) => !value) }
}

// Select ------------------------------------------------------------------------------------

export interface SelectOption<T extends string> {
  value: T
  label: string
  /** A second line, smaller. */
  hint?: string
  /** A dot, swatch or small picture before the label. */
  icon?: ReactNode
  /** Options with a group get a heading when the group changes. */
  group?: string
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  placeholder = 'Choose…',
  searchable,
  disabled,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  label: string
  placeholder?: string
  /** A search box on top, for long lists. */
  searchable?: boolean
  disabled?: boolean
  className?: string
}) {
  const picker = usePicker()
  const current = options.find((option) => option.value === value)
  return (
    <>
      <Trigger
        button={picker.button}
        open={picker.open}
        onOpen={picker.toggle}
        label={`${label}: ${current?.label ?? placeholder}`}
        popup="listbox"
        lead={current?.icon}
        disabled={disabled}
        className={className}
      >
        <span className={current ? '' : 'is-placeholder'}>{current?.label ?? placeholder}</span>
      </Trigger>
      {picker.open && (
        <Popover
          anchor={picker.button.current}
          onClose={picker.close}
          label={label}
          role="listbox"
          matchWidth
          className="picker"
          initialFocus={searchable ? 'input' : '[aria-selected="true"]'}
        >
          <OptionList
            options={options}
            value={value}
            searchable={searchable}
            onPick={(next) => {
              onChange(next)
              picker.close()
            }}
          />
        </Popover>
      )}
    </>
  )
}

function OptionList<T extends string>({ options, value, searchable, onPick }: { options: SelectOption<T>[]; value: T; searchable?: boolean; onPick: (value: T) => void }) {
  const [query, setQuery] = useState('')
  const typed = useRef({ text: '', at: 0 })
  const list = useRef<HTMLDivElement>(null)
  const shown = query.trim() ? options.filter((o) => fold(`${o.label} ${o.hint ?? ''}`).includes(fold(query.trim()))) : options

  // Without a search box, typing jumps to the first option that starts with what was typed.
  const onKeyDown = (event: KeyboardEvent) => {
    if (searchable || event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return
    const now = Date.now()
    typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + event.key.toLowerCase(), at: now }
    const index = options.findIndex((o) => fold(o.label).startsWith(typed.current.text))
    if (index >= 0) list.current?.querySelectorAll<HTMLElement>('[role="option"]')[index]?.focus()
  }

  return (
    <div ref={list} onKeyDown={onKeyDown}>
      {searchable && (
        <label className="picker__search">
          <SearchIcon size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && shown[0]) {
                event.preventDefault()
                onPick(shown[0].value)
              }
            }}
          />
        </label>
      )}
      {shown.map((option, index) => (
        <Fragment key={option.value}>
          {option.group && option.group !== shown[index - 1]?.group && <p className="menu__heading">{option.group}</p>}
          <button
            type="button"
            role="option"
            aria-selected={option.value === value}
            className={`menu__item picker__option ${option.value === value ? 'is-checked' : ''}`}
            onClick={() => onPick(option.value)}
          >
            {option.icon && <span className="picker__icon">{option.icon}</span>}
            <span className="picker__text">
              <span className="menu__label">{option.label}</span>
              {option.hint && <span className="picker__hint">{option.hint}</span>}
            </span>
          </button>
        </Fragment>
      ))}
      {shown.length === 0 && <p className="menu__note">Nothing matches “{query}”.</p>}
    </div>
  )
}

// Date --------------------------------------------------------------------------------------

const shortDay = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const shortDayYear = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

/** "Thu, Nov 26", with the year when it isn't this year. */
export function formatPickedDay(date: Date) {
  return (date.getFullYear() === new Date().getFullYear() ? shortDay : shortDayYear).format(date)
}

export function DateField({ value, onChange, label, min, disabled }: { value: string; onChange: (value: string) => void; label: string; min?: string; disabled?: boolean }) {
  const picker = usePicker()
  const date = parseDate(value)
  return (
    <>
      <Trigger
        button={picker.button}
        open={picker.open}
        onOpen={picker.toggle}
        label={`${label}: ${formatLongDay(date)}`}
        popup="dialog"
        lead={<CalendarIcon size={16} />}
        disabled={disabled}
        chevron={false}
      >
        {formatPickedDay(date)}
      </Trigger>
      {picker.open && (
        <Popover anchor={picker.button.current} onClose={picker.close} label={label} role="dialog" className="picker picker--date" initialFocus=".month-picker__day[tabindex='0']">
          <MonthPicker
            value={value}
            min={min}
            onPick={(next) => {
              onChange(next)
              picker.close()
            }}
          />
        </Popover>
      )}
    </>
  )
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function MonthPicker({ value, min, onPick }: { value: string; min?: string; onPick: (value: string) => void }) {
  const selected = parseDate(value)
  const today = startOfDay(new Date())
  const minDate = min ? parseDate(min) : null
  const [month, setMonth] = useState(() => startOfMonth(selected))
  const [cursor, setCursor] = useState(selected)
  const grid = useRef<HTMLDivElement>(null)
  const first = startOfWeek(month)
  // Always six weeks, so the panel doesn't change height from month to month.
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(first, i)), [first.getTime()])
  const tooEarly = (date: Date) => !!minDate && date < minDate
  // The one day Tab lands on: the cursor, or the 1st when the cursor is in another month.
  const tabDay = days.some((day) => isSameDay(day, cursor)) ? dateKey(cursor) : dateKey(month)

  const moveTo = (target: Date) => {
    setCursor(target)
    if (target.getMonth() !== month.getMonth() || target.getFullYear() !== month.getFullYear()) setMonth(startOfMonth(target))
    requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-day="${dateKey(target)}"]`)?.focus())
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (event.key in steps) {
      event.preventDefault()
      moveTo(addDays(cursor, steps[event.key]))
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      const target = new Date(cursor)
      target.setMonth(target.getMonth() + (event.key === 'PageUp' ? -1 : 1))
      moveTo(target)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      moveTo(addDays(startOfWeek(cursor), event.key === 'Home' ? 0 : 6))
    }
  }

  const quick: [string, Date][] = [
    ['Today', today],
    ['Tomorrow', addDays(today, 1)],
    ['Next Monday', addDays(startOfWeek(today), 7)],
  ]

  return (
    <div className="month-picker">
      <div className="month-picker__quick">
        {quick.map(([text, date]) => (
          <button key={text} type="button" className={`chip-button ${isSameDay(date, selected) ? 'is-active' : ''}`} disabled={tooEarly(date)} onClick={() => onPick(dateKey(date))}>
            {text}
          </button>
        ))}
      </div>
      <div className="month-picker__head">
        <span className="month-picker__title" aria-live="polite">
          {formatMonthYear(month)}
        </span>
        <button type="button" className="month-picker__nav" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
          <PrevIcon size={16} />
        </button>
        <button type="button" className="month-picker__nav" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
          <NextIcon size={16} />
        </button>
      </div>
      <div className="month-picker__grid" role="grid" ref={grid} onKeyDown={onKeyDown}>
        {WEEKDAYS.map((day) => (
          <span key={day} className="month-picker__weekday" aria-hidden="true">
            {day}
          </span>
        ))}
        {days.map((day) => {
          const classes = [
            'month-picker__day',
            day.getMonth() !== month.getMonth() && 'is-outside',
            isSameDay(day, today) && 'is-today',
            isSameDay(day, selected) && 'is-selected',
            (day.getDay() === 0 || day.getDay() === 6) && 'is-weekend',
          ]
          return (
            <button
              key={day.getTime()}
              type="button"
              role="gridcell"
              data-day={dateKey(day)}
              tabIndex={dateKey(day) === tabDay ? 0 : -1}
              className={classes.filter(Boolean).join(' ')}
              aria-selected={isSameDay(day, selected)}
              aria-label={formatLongDay(day)}
              disabled={tooEarly(day)}
              onClick={() => onPick(dateKey(day))}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Time --------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')
const toMinutes = (value: string) => {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}
const fromMinutes = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`

/** "9", "930", "9:30", "9.30", "9h30", "9pm", "21" → "HH:MM" (or null). */
export function parseTime(input: string): string | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, '').replace(/h$/, '')
  const match = text.match(/^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = match[2] ? Number(match[2]) : 0
  const half = match[3]
  if (half) {
    if (hours < 1 || hours > 12) return null
    if (half.startsWith('p') && hours !== 12) hours += 12
    if (half.startsWith('a') && hours === 12) hours = 0
  }
  if (hours > 23 || minutes > 59) return null
  return fromMinutes(hours * 60 + minutes)
}

/** "30 min", "1 h", "1 h 45". */
function duration(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return minutes % 60 ? `${hours} h ${minutes % 60}` : `${hours} h`
}

export function TimeField({
  value,
  onChange,
  label,
  after,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  /** For an end time on the same day: list times after this one, with how long that makes. */
  after?: string
  disabled?: boolean
}) {
  const picker = usePicker()
  return (
    <>
      <Trigger
        button={picker.button}
        open={picker.open}
        onOpen={picker.toggle}
        label={`${label}: ${value}`}
        popup="listbox"
        lead={<ClockIcon size={16} />}
        disabled={disabled}
        chevron={false}
        className="select--time"
      >
        {value}
      </Trigger>
      {picker.open && (
        <Popover anchor={picker.button.current} onClose={picker.close} label={label} role="listbox" className="picker picker--time" initialFocus="input">
          <TimeList
            value={value}
            after={after}
            onPick={(next) => {
              onChange(next)
              picker.close()
            }}
          />
        </Popover>
      )}
    </>
  )
}

function TimeList({ value, after, onPick }: { value: string; after?: string; onPick: (value: string) => void }) {
  const [typed, setTyped] = useState('')
  const parsed = parseTime(typed)
  const start = after ? toMinutes(after) : null
  const slots = useMemo(() => {
    const from = start === null ? 0 : start + 15
    const list: number[] = []
    for (let m = from - (from % 15); m < 24 * 60; m += 15) if (m >= from) list.push(m)
    const current = toMinutes(value)
    if (!list.includes(current) && (start === null || current > start)) list.push(current)
    return list.sort((a, b) => a - b)
  }, [start, value])
  const list = useRef<HTMLDivElement>(null)

  // Show the chosen time in the middle when the list opens.
  useEffect(() => {
    const frame = requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'center' }))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div ref={list}>
      <label className="picker__search">
        <ClockIcon size={16} />
        <input
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value)
            list.current?.closest('.menu')?.scrollTo({ top: 0 })
          }}
          placeholder="Type a time, e.g. 930"
          aria-label="Type a time"
          inputMode="numeric"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (parsed) onPick(parsed)
            }
          }}
        />
      </label>
      {typed && (
        <button type="button" role="option" aria-selected={false} className="menu__item picker__option picker__typed" disabled={!parsed} onClick={() => parsed && onPick(parsed)}>
          <span className="picker__text">
            <span className="menu__label">{parsed ? `Use ${parsed}` : 'Not a time yet'}</span>
            {parsed && start !== null && toMinutes(parsed) > start && <span className="picker__hint">{duration(toMinutes(parsed) - start)}</span>}
          </span>
        </button>
      )}
      {slots.map((minutes) => {
        const time = fromMinutes(minutes)
        const chosen = time === value
        return (
          <button
            key={minutes}
            type="button"
            role="option"
            aria-selected={chosen}
            className={`menu__item picker__option picker__time ${chosen ? 'is-checked' : ''} ${minutes % 60 === 0 ? 'is-hour' : ''}`}
            onClick={() => onPick(time)}
          >
            <span className="menu__label">{time}</span>
            {start !== null && <span className="picker__hint">{duration(minutes - start)}</span>}
          </button>
        )
      })}
    </div>
  )
}
