/** Shared DOM helpers and the element ref registry used by the content script. */

let refCounter = 0
const byRef = new Map<string, { el: WeakRef<Element>; selector: string }>()
const byEl = new WeakMap<Element, string>()

export function getRef(el: Element): string {
  const existing = byEl.get(el)
  if (existing && byRef.has(existing)) return existing
  const ref = `e${++refCounter}`
  byEl.set(el, ref)
  byRef.set(ref, { el: new WeakRef(el), selector: cssPath(el) })
  return ref
}

export function resolveRef(ref: string): Element | null {
  const rec = byRef.get(ref)
  if (!rec) return null
  const alive = rec.el.deref()
  if (alive && alive.isConnected) return alive
  try {
    const found = document.querySelector(rec.selector)
    if (found) {
      rec.el = new WeakRef(found)
      return found
    }
  } catch {
    /* selector no longer valid */
  }
  return null
}

export function isRendered(el: Element): boolean {
  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return true
  if ((el as HTMLElement).hidden) return false
  const style = getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
  if (style.display === 'contents') return true
  return el.getClientRects().length > 0
}

export function isInteractive(el: Element): boolean {
  const tag = el.tagName
  if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'SUMMARY') return true
  if (tag === 'A') return el.hasAttribute('href')
  if (tag === 'INPUT') return (el as HTMLInputElement).type !== 'hidden'
  if ((el as HTMLElement).isContentEditable) return true
  const role = el.getAttribute('role')?.toLowerCase()
  if (role) {
    return INTERACTIVE_ROLES.has(role)
  }
  return false
}

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'combobox', 'listbox', 'textbox', 'searchbox', 'slider', 'spinbutton', 'treeitem',
])

export function implicitRole(el: Element): string | null {
  const attrRole = el.getAttribute('role')?.toLowerCase().trim()
  if (attrRole) return attrRole
  const tag = el.tagName
  if (tag === 'A') return el.hasAttribute('href') ? 'link' : null
  if (tag === 'BUTTON') return 'button'
  if (tag === 'SELECT') return (el as HTMLSelectElement).multiple ? 'listbox' : 'combobox'
  if (tag === 'TEXTAREA') return 'textbox'
  if (tag === 'IMG') return (el as HTMLImageElement).alt ? 'img' : null
  if (tag === 'IFRAME') return 'iframe'
  if (tag === 'FORM') return 'form'
  if (tag === 'NAV') return 'navigation'
  if (tag === 'MAIN') return 'main'
  if (tag === 'HEADER') return 'banner'
  if (tag === 'FOOTER') return 'contentinfo'
  if (tag === 'ASIDE') return 'complementary'
  if (tag === 'DIALOG') return 'dialog'
  if (tag === 'UL' || tag === 'OL') return 'list'
  if (tag === 'LI') return 'listitem'
  if (tag === 'TABLE') return 'table'
  if (tag === 'TR') return 'row'
  if (tag === 'TD') return 'cell'
  if (tag === 'TH') return 'columnheader'
  if (tag === 'SUMMARY') return 'button'
  if (tag === 'DETAILS') return 'group'
  if (tag === 'VIDEO') return 'video'
  if (tag === 'AUDIO') return 'audio'
  if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') return 'heading'
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    switch (type) {
      case 'tel':
      case 'text':
      case 'url':
      case 'email':
      case 'password':
      case 'search':
        return type === 'search' ? 'searchbox' : 'textbox'
      case 'checkbox':
        return 'checkbox'
      case 'radio':
        return 'radio'
      case 'range':
        return 'slider'
      case 'number':
        return 'spinbutton'
      case 'submit':
      case 'button':
      case 'reset':
      case 'image':
      case 'file':
        return 'button'
      default:
        return null
    }
  }
  return null
}

export function cleanText(text: string | null | undefined, max = 160): string {
  if (!text) return ''
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? collapsed.slice(0, max - 1) + '…' : collapsed
}

export function accessibleName(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel?.trim()) return cleanText(ariaLabel)
  const labelledby = el.getAttribute('aria-labelledby')
  if (labelledby) {
    const parts = labelledby.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '')
    const joined = cleanText(parts.join(' '))
    if (joined) return joined
  }
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    const id = el.getAttribute('id')
    if (id) {
      const label = document.querySelector(`label[for="${cssEscape(id)}"]`)
      if (label?.textContent?.trim()) return cleanText(label.textContent, 120)
    }
    const wrapping = el.closest('label')
    if (wrapping?.textContent?.trim()) return cleanText(wrapping.textContent, 120)
  }
  if (tag === 'IMG') {
    const alt = el.getAttribute('alt')
    if (alt?.trim()) return cleanText(alt, 120)
  }
  const placeholder = el.getAttribute('placeholder')
  if (placeholder?.trim() && isInteractive(el)) return cleanText(placeholder, 120)
  const title = el.getAttribute('title')
  if (title?.trim()) return cleanText(title, 120)
  if (isInteractive(el) || implicitRole(el) === 'heading' || tag === 'A' || tag === 'BUTTON') {
    return cleanText(el.textContent ?? '', 120)
  }
  return ''
}

export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)
}

export function cssPath(el: Element): string {
  const parts: string[] = []
  let node: Element | null = el
  let depth = 0
  while (node && node.nodeType === 1 && depth < 6 && node !== document.documentElement) {
    let part = node.tagName.toLowerCase()
    const id = node.getAttribute('id')
    if (id) {
      part = `#${cssEscape(id)}`
      parts.unshift(part)
      break
    }
    const parent = node.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === node!.tagName)
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(node) + 1})`
      }
    }
    parts.unshift(part)
    node = node.parentElement
    depth++
  }
  return parts.join(' > ')
}

export function describeElement(el: Element): string {
  const role = implicitRole(el) ?? el.tagName.toLowerCase()
  const name = accessibleName(el)
  const tag = el.tagName.toLowerCase()
  return name ? `${role} "${name}" <${tag}>` : `<${tag}>`
}

export function queryBySelector(selector: string): Element | null {
  try {
    return document.querySelector(selector)
  } catch {
    return null
  }
}

export function findByText(text: string): Element | null {
  const needle = text.toLowerCase()
  const candidates = Array.from(
    document.querySelectorAll('a,button,input,select,textarea,summary,label,[role],[contenteditable="true"],[onclick]'),
  )
  // exact name match first
  for (const el of candidates) {
    if (!isRendered(el)) continue
    const name = accessibleName(el).toLowerCase()
    if (name === needle) return el
  }
  // then visible text match on interactive-ish nodes
  for (const el of candidates) {
    if (!isRendered(el)) continue
    const own = cleanText(el.textContent, 300).toLowerCase()
    if (own.includes(needle)) return el
  }
  return null
}

export function resolveTarget(params: { ref?: string; selector?: string; text?: string }): Element {
  if (params.ref) {
    const el = resolveRef(params.ref)
    if (!el) throw new Error(`ref ${params.ref} is stale or unknown — take a fresh browser_snapshot and use the new ref`)
    return el
  }
  if (params.selector) {
    const el = queryBySelector(params.selector)
    if (!el) throw new Error(`selector "${params.selector}" matched no element`)
    return el
  }
  if (params.text) {
    const el = findByText(params.text)
    if (!el) throw new Error(`no interactive element found with text "${params.text}"`)
    return el
  }
  throw new Error('provide one of: ref, selector, text')
}
