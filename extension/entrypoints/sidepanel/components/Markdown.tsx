import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: true })

let hooksInstalled = false
function installHooks() {
  if (hooksInstalled) return
  hooksInstalled = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof Element && node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
      node.removeAttribute('ping')
    }
  })
}

/**
 * Markdown is model output (often derived from an untrusted page). Keep it to
 * formatting and ordinary links: media tags can fetch remote URLs from the
 * side panel without a user click, and form controls can post data.
 */
const ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'kbd',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]
const ALLOWED_ATTR = ['colspan', 'href', 'rel', 'rowspan', 'start', 'target', 'title']

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    installHooks()
    try {
      const raw = marked.parse(text, { async: false }) as string
      return DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR })
    } catch {
      return DOMPurify.sanitize(
        text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c),
        { ALLOWED_TAGS, ALLOWED_ATTR },
      )
    }
  }, [text])
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
}
