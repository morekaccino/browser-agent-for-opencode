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
    }
  })
}

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    installHooks()
    try {
      const raw = marked.parse(text, { async: false }) as string
      return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
    } catch {
      return DOMPurify.sanitize(text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c))
    }
  }, [text])
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
}
