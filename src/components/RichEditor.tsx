import Image from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import { NodeSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { EditorContent, Extension, InputRule, useEditor, useEditorState, type ChainedCommands, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { shrinkImage } from '../lib/images'
import {
  BoldIcon,
  BulletListIcon,
  HeadingIcon,
  ItalicIcon,
  LinkIcon,
  NumberedListIcon,
  OpenLinkIcon,
  QuoteIcon,
  StrikeIcon,
  SubheadingIcon,
  UnderlineIcon,
  UnlinkIcon,
} from './icons'
import { tooltip, type IconComponent } from './ui'

// One editor for mail and notes. It writes HTML. Markdown works as a shortcut while typing:
// "# ", "## ", "### " make headings, "- " and "1. " lists, "> " a quote, "---" a line,
// **bold**, *italic*, ~~strike~~, `code` and [text](link). Selecting text shows a small bar
// to change its style. Pictures can be pasted or dropped in; they are made smaller first.

export interface RichValue {
  html: string
  text: string
  empty: boolean
}

export interface RichEditorHandle {
  focus: () => void
  clear: () => void
  addImages: (files: ArrayLike<File>) => void
}

export interface RichEditorProps {
  /** HTML to start with. Later changes are ignored: give the editor a new `key` to load other content. */
  content: string
  label: string
  placeholder?: string
  autoFocus?: boolean
  className?: string
  onChange?: (value: RichValue) => void
  /** ⌘/Ctrl + Enter. */
  onSubmit?: () => void
  /** Escape while no link is being edited. */
  onEscape?: () => void
}

/** "example.com" → https://example.com, "sam@x.com" → mailto:. */
export function normalizeHref(value: string) {
  const href = value.trim()
  if (!href) return ''
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(href)) return `mailto:${href}`
  return `https://${href.replace(/^\/+/, '')}`
}

const MarkdownLink = Extension.create({
  name: 'markdownLink',
  addInputRules() {
    return [
      new InputRule({
        find: /\[([^\]]+)\]\(([^)\s]+)\)$/,
        handler: ({ state, range, match }) => {
          const link = state.schema.marks.link
          if (!link) return null
          state.tr.replaceWith(range.from, range.to, state.schema.text(match[1], [link.create({ href: normalizeHref(match[2]) })])).removeStoredMark(link)
        },
      }),
    ]
  },
})

const Keys = Extension.create<{ submit: () => boolean; link: () => boolean; escape: () => boolean }>({
  name: 'rayonsKeys',
  addOptions: () => ({ submit: () => false, link: () => false, escape: () => false }),
  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => this.options.submit(),
      'Mod-k': () => this.options.link(),
      Escape: () => this.options.escape(),
    }
  },
})

/** Inserts pictures where the cursor is (or at `at`). Returns false when there are none. */
function insertImages(view: EditorView, files: ArrayLike<File> | null | undefined, at?: number) {
  const images = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'))
  if (!images.length) return false
  void (async () => {
    let position = at
    for (const file of images) {
      const src = await shrinkImage(file)
      const node = view.state.schema.nodes.image.create({ src, alt: file.name?.replace(/\.[a-z0-9]+$/i, '') ?? '' })
      const tr = position === undefined ? view.state.tr.replaceSelectionWith(node) : view.state.tr.insert(position, node)
      view.dispatch(tr)
      if (position !== undefined) position += node.nodeSize
    }
  })()
  return true
}

/** Text copied from Word or a web page often comes with a picture of itself: keep the text. */
function pastedRichText(data: DataTransfer | null) {
  const html = data?.getData('text/html')
  if (!html) return !!data?.getData('text/plain')?.trim()
  return !!new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim()
}

const valueOf = (editor: Editor): RichValue => {
  // Drop the empty paragraph the editor keeps at the end for typing after a list or picture.
  const html = editor.getHTML().replace(/(<p><\/p>)+$/, '')
  const text = editor.getText({ blockSeparator: '\n\n' }).trim()
  const empty = !text && !/<(img|hr)\b/.test(html)
  return { html: empty ? '' : html, text, empty }
}

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(function RichEditor(
  { content, label, placeholder = '', autoFocus, className = '', onChange, onSubmit, onEscape },
  ref,
) {
  const changeRef = useRef(onChange)
  changeRef.current = onChange
  const submitRef = useRef(onSubmit)
  submitRef.current = onSubmit
  const escapeRef = useRef(onEscape)
  escapeRef.current = onEscape
  const [linking, setLinking] = useState(false)
  const linkingRef = useRef(false)
  const openLinkRef = useRef<() => boolean>(() => false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // A click on a link opens it in a new tab; the bar over it offers to change or remove it.
        link: { openOnClick: true, autolink: true, linkOnPaste: true, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
      }),
      Image.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder }),
      MarkdownLink,
      Keys.configure({
        submit: () => (submitRef.current ? (submitRef.current(), true) : false),
        link: () => openLinkRef.current(),
        escape: () => (escapeRef.current ? (escapeRef.current(), true) : false),
      }),
    ],
    content,
    autofocus: autoFocus ? 'end' : false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: 'rich', 'aria-label': label, 'aria-multiline': 'true', role: 'textbox' },
      handlePaste: (view, event) => !pastedRichText(event.clipboardData) && insertImages(view, event.clipboardData?.files),
      handleDrop: (view, event, _slice, moved) => !moved && insertImages(view, event.dataTransfer?.files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos),
    },
    onUpdate: ({ editor }) => changeRef.current?.(valueOf(editor)),
  })

  openLinkRef.current = () => {
    linkingRef.current = true
    setLinking(true)
    editor.view.dispatch(editor.state.tr.setMeta('bubbleMenu', 'show'))
    return true
  }

  const closeLink = (refocus: boolean) => {
    linkingRef.current = false
    setLinking(false)
    if (refocus) editor.commands.focus()
    const keep = !editor.state.selection.empty || editor.isActive('link')
    editor.view.dispatch(editor.state.tr.setMeta('bubbleMenu', keep && refocus ? 'updatePosition' : 'hide'))
  }

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor.commands.focus('end'),
      clear: () => {
        editor.commands.clearContent(true)
      },
      addImages: (files) => {
        editor.commands.focus()
        insertImages(editor.view, files)
      },
    }),
    [editor],
  )

  const shouldShow = useCallback(({ editor, view, state, from, to, element }: { editor: Editor; view: EditorView; state: Editor['state']; from: number; to: number; element: HTMLElement }) => {
    if (linkingRef.current) return true
    if (!editor.isEditable || !(view.hasFocus() || element.contains(document.activeElement))) return false
    if (state.selection instanceof NodeSelection) return false
    if (from === to) return editor.isActive('link')
    return state.doc.textBetween(from, to).trim().length > 0
  }, [])

  return (
    <div className={`rich-editor ${className}`}>
      <EditorContent editor={editor} />
      <BubbleMenu editor={editor} shouldShow={shouldShow} updateDelay={120} options={{ placement: 'top', offset: 8, flip: true, shift: { padding: 8 } }} className="format-bar" data-blocks-shortcuts="">
        {linking ? <LinkField editor={editor} onDone={closeLink} /> : <FormatButtons editor={editor} onLink={() => openLinkRef.current()} />}
      </BubbleMenu>
    </div>
  )
})

function FormatButton({ icon: Icon, label, keys, active, onClick }: { icon: IconComponent; label: string; keys?: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="format-bar__button"
      aria-label={label}
      aria-pressed={active}
      {...tooltip(label, keys)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Icon size={16} />
    </button>
  )
}

function FormatButtons({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const on = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      empty: e.state.selection.empty,
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      quote: e.isActive('blockquote'),
      bullets: e.isActive('bulletList'),
      numbers: e.isActive('orderedList'),
      link: e.isActive('link'),
      href: String(e.getAttributes('link').href ?? ''),
    }),
  })
  const run = (command: (chain: ChainedCommands) => ChainedCommands) => command(editor.chain().focus()).run()

  // The cursor is in a link: show where it goes.
  if (on.empty && on.link) {
    return (
      <>
        <a className="format-bar__href" href={on.href} target="_blank" rel="noopener noreferrer" {...tooltip('Open the link')}>
          <OpenLinkIcon size={14} />
          <span>{on.href.replace(/^mailto:/, '').replace(/^https?:\/\//, '')}</span>
        </a>
        <span className="format-bar__divider" />
        <FormatButton icon={LinkIcon} label="Edit link" keys="Mod k" onClick={onLink} />
        <FormatButton icon={UnlinkIcon} label="Remove link" onClick={() => run((c) => c.extendMarkRange('link').unsetLink())} />
      </>
    )
  }

  return (
    <>
      <FormatButton icon={BoldIcon} label="Bold" keys="Mod b" active={on.bold} onClick={() => run((c) => c.toggleBold())} />
      <FormatButton icon={ItalicIcon} label="Italic" keys="Mod i" active={on.italic} onClick={() => run((c) => c.toggleItalic())} />
      <FormatButton icon={UnderlineIcon} label="Underline" keys="Mod u" active={on.underline} onClick={() => run((c) => c.toggleUnderline())} />
      <FormatButton icon={StrikeIcon} label="Strikethrough" active={on.strike} onClick={() => run((c) => c.toggleStrike())} />
      <span className="format-bar__divider" />
      <FormatButton icon={HeadingIcon} label="Title (# )" active={on.h1} onClick={() => run((c) => c.toggleHeading({ level: 1 }))} />
      <FormatButton icon={SubheadingIcon} label="Heading (## )" active={on.h2} onClick={() => run((c) => c.toggleHeading({ level: 2 }))} />
      <FormatButton icon={QuoteIcon} label="Quote (> )" active={on.quote} onClick={() => run((c) => c.toggleBlockquote())} />
      <FormatButton icon={BulletListIcon} label="Bulleted list (- )" active={on.bullets} onClick={() => run((c) => c.toggleBulletList())} />
      <FormatButton icon={NumberedListIcon} label="Numbered list (1. )" active={on.numbers} onClick={() => run((c) => c.toggleOrderedList())} />
      <span className="format-bar__divider" />
      <FormatButton icon={LinkIcon} label={on.link ? 'Edit link' : 'Add a link'} keys="Mod k" active={on.link} onClick={onLink} />
    </>
  )
}

function LinkField({ editor, onDone }: { editor: Editor; onDone: (refocus: boolean) => void }) {
  const [value, setValue] = useState(() => String(editor.getAttributes('link').href ?? ''))
  const apply = () => {
    const href = normalizeHref(value)
    const chain = editor.chain().focus()
    if (!href) chain.extendMarkRange('link').unsetLink().run()
    else if (editor.state.selection.empty && !editor.isActive('link')) {
      chain
        .insertContent({ type: 'text', text: value.trim(), marks: [{ type: 'link', attrs: { href } }] })
        .unsetMark('link')
        .run()
    } else chain.extendMarkRange('link').setLink({ href }).run()
    onDone(true)
  }
  return (
    <form
      className="format-bar__link"
      onSubmit={(event) => {
        event.preventDefault()
        apply()
      }}
    >
      <input
        className="format-bar__input"
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Paste or type a link"
        aria-label="Link address"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onDone(true)
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.form?.contains(event.relatedTarget as Node | null)) onDone(false)
        }}
      />
      <button type="submit" className="format-bar__apply">
        {value.trim() ? 'Apply' : 'Remove'}
      </button>
    </form>
  )
}
