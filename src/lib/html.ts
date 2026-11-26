// Small helpers for the HTML that notes and outgoing mail are written in.

export const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Notes written before the editor were plain text. */
export const looksLikeHtml = (value: string) => /^\s*<(p|h[1-6]|ul|ol|blockquote|pre|hr|img|div)[\s>/]/i.test(value)

/** Plain text → paragraphs, keeping single line breaks. */
export function textToHtml(text: string) {
  if (!text.trim()) return ''
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** What the editor should open: HTML as is, older plain text converted. */
export const asEditorHtml = (value: string) => (looksLikeHtml(value) ? value : textToHtml(value))

/** HTML → readable text, for previews (one line per block). */
export function htmlToText(value: string) {
  if (!looksLikeHtml(value)) return value
  const doc = new DOMParser().parseFromString(value, 'text/html')
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  doc.querySelectorAll('p, h1, h2, h3, h4, li, blockquote, pre, hr').forEach((block) => block.append('\n'))
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}
