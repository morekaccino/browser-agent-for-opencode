import {
  accessibleName,
  cleanText,
  getRef,
  isInteractive,
  isRendered,
  implicitRole,
} from './dom'

export interface SnapshotResult {
  text: string
  lineCount: number
  refCount: number
  truncated: boolean
}

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'BASE', 'TITLE', 'BR', 'WBR',
])

const STRUCTURAL_TAGS = new Set([
  'MAIN', 'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'FORM', 'DIALOG', 'SECTION', 'ARTICLE', 'UL', 'OL', 'TABLE', 'DETAILS',
  'IMG', 'IFRAME', 'VIDEO', 'AUDIO', 'FIGURE', 'TR',
])

interface RenderLine {
  text: string
  isRef: boolean
}

function renderElement(el: Element): RenderLine | null {
  const tag = el.tagName.toLowerCase()
  if (el instanceof SVGElement) {
    if (el.tagName.toLowerCase() === 'svg') return { text: 'svg', isRef: false }
    return null
  }

  const role = implicitRole(el)
  const name = accessibleName(el)
  const interactive = isInteractive(el)

  if (tag === 'input') {
    const input = el as HTMLInputElement
    const type = input.type
    const bits = [`${role ?? 'input'}${name ? ` "${name}"` : ''}`]
    bits.push(`[ref=${getRef(el)}]`)
    if (type !== 'text' && type !== 'checkbox' && type !== 'radio' && type !== 'button' && type !== 'submit') {
      bits.push(`type=${type}`)
    }
    if (type === 'text' || type === 'password' || type === 'search' || type === 'email' || type === 'url' || type === 'tel' || type === 'number') {
      if (input.value) bits.push(`value="${cleanText(input.value, 60)}"`)
    }
    if (type === 'checkbox' || type === 'radio') bits.push(`checked=${input.checked}`)
    if (input.disabled) bits.push('[disabled]')
    if (input.readOnly) bits.push('[readonly]')
    return { text: bits.join(' '), isRef: true }
  }

  if (tag === 'select') {
    const select = el as HTMLSelectElement
    const bits = [`combobox${name ? ` "${name}"` : ''}`, `[ref=${getRef(el)}]`]
    const selected = select.selectedOptions[0]
    if (selected) bits.push(`value="${cleanText(selected.textContent ?? selected.value, 40)}"`)
    if (select.disabled) bits.push('[disabled]')
    return { text: bits.join(' '), isRef: true }
  }

  if (tag === 'textarea') {
    const ta = el as HTMLTextAreaElement
    const bits = [`textbox${name ? ` "${name}"` : ''}`, `[ref=${getRef(el)}]`]
    if (ta.value) bits.push(`value="${cleanText(ta.value, 60)}"`)
    if (ta.disabled) bits.push('[disabled]')
    return { text: bits.join(' '), isRef: true }
  }

  if (tag === 'a' && el.hasAttribute('href')) {
    const href = el.getAttribute('href') ?? ''
    const shown = href.length > 80 ? href.slice(0, 79) + '…' : href
    return { text: `link${name ? ` "${name}"` : ''} [ref=${getRef(el)}]${shown ? ` href="${shown}"` : ''}`, isRef: true }
  }

  if (interactive) {
    const bits = [`${role ?? tag}${name ? ` "${name}"` : ''}`, `[ref=${getRef(el)}]`]
    if ((el as HTMLElement).isContentEditable) bits.push('[editable]')
    return { text: bits.join(' '), isRef: true }
  }

  if (role === 'heading') {
    const level = tag.charAt(1)
    return { text: `heading "${name}" [level=${level}]`, isRef: false }
  }

  if (tag === 'img') {
    const alt = el.getAttribute('alt')
    return alt ? { text: `img "${cleanText(alt, 120)}"`, isRef: false } : null
  }

  if (tag === 'iframe') {
    const src = el.getAttribute('src') ?? ''
    const shown = src.length > 80 ? src.slice(0, 79) + '…' : src
    return { text: `iframe${name ? ` "${name}"` : ''}${shown ? ` src="${shown}"` : ''}`, isRef: false }
  }

  if (STRUCTURAL_TAGS.has(el.tagName)) {
    const label = name ? ` "${name}"` : ''
    return { text: `${role ?? tag}${label}`, isRef: false }
  }

  return null
}

function directText(el: Element): string {
  let out = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? ''
  }
  return cleanText(out)
}

export function buildSnapshot(maxLines = 2500): SnapshotResult {
  const lines: string[] = []
  let truncated = false
  let refCount = 0

  const walk = (el: Element, depth: number): void => {
    if (truncated) return
    if (lines.length >= maxLines) {
      truncated = true
      return
    }
    if (SKIP_TAGS.has(el.tagName)) return
    if (depth > 60) return

    const rendered = isRendered(el)
    if (!rendered) return

    let printed: RenderLine | null = null
    try {
      printed = renderElement(el)
    } catch {
      printed = null
    }

    const indent = '  '.repeat(Math.min(depth, 40))
    if (printed) {
      lines.push(`${indent}- ${printed.text}`)
      if (printed.isRef) refCount++
    }

    // Interactive elements and headings already carry their accessible name — skip their subtree.
    if (isInteractive(el) || implicitRole(el) === 'heading') return
    if (printed?.text === 'svg') return

    const childDepth = printed ? depth + 1 : depth

    if (!printed) {
      const text = directText(el)
      if (text && text.length > 1) {
        lines.push(`${indent}- "${text}"`)
      }
    }

    if (el.tagName === 'IFRAME') return

    let childCount = 0
    for (const child of Array.from(el.children)) {
      if (childCount > 500) {
        lines.push(`${'  '.repeat(Math.min(childDepth, 40))}- … (${el.children.length - childCount} more children)`)
        break
      }
      walk(child, childDepth)
      childCount++
    }
  }

  const root = document.body ?? document.documentElement
  if (root) walk(root, 0)

  return { text: lines.join('\n'), lineCount: lines.length, refCount, truncated }
}
