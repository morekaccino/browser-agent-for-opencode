import { accessibleName, cleanText, describeElement, getRef, resolveTarget, isRendered } from './dom'

function center(el: Element): { x: number; y: number; width: number; height: number } {
  const rect = el.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height }
}

function pointerEvent(type: string, el: Element, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    detail: type === 'pointerdown' || type === 'pointerup' ? 1 : 0,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    ...init,
  })
}

function mouseEvent(type: string, el: Element, init: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    detail: 1,
    button: 0,
    buttons: type === 'mousedown' ? 1 : 0,
    ...init,
  })
}

const WRITE_ACTION = /(?:^|\b)(?:send|submit|post|publish|reply|buy|purchase|pay|checkout|delete|remove|confirm|save|upload|subscribe|unsubscribe|follow|share|withdraw|transfer)(?:\b|$)/i

function actionableTarget(el: Element): Element {
  return (
    el.closest('button, a[href], input[type=button], input[type=submit], input[type=image], [role=button], [role=link]') ??
    el
  )
}

function isFormSubmitControl(el: Element): boolean {
  if (el instanceof HTMLInputElement) return el.type === 'submit' || el.type === 'image'
  if (el instanceof HTMLButtonElement) {
    const type = (el.getAttribute('type') ?? 'submit').toLowerCase()
    return type === 'submit' && !!el.form
  }
  return false
}

function guardReadOnlyClick(el: Element): void {
  const target = actionableTarget(el)
  const visibleValue =
    target instanceof HTMLInputElement && /^(?:button|submit|reset|image)$/.test(target.type)
      ? target.value
      : ''
  const name = cleanText(accessibleName(target) || visibleValue || target.textContent, 160)
  const blocked =
    isFormSubmitControl(target) ||
    WRITE_ACTION.test(name) ||
    (target instanceof HTMLAnchorElement &&
      (target.hasAttribute('download') ||
        /^\s*(?:javascript|mailto|tel|sms):/i.test(target.getAttribute('href') ?? '')))
  if (blocked) {
    throw new Error(
      `read-only workflow blocked click on ${describeElement(target)}. ` +
        'Report what you would do instead, or ask the user to enable "Allow submissions and messages".',
    )
  }
}

export function clickElement(el: Element, options: { readOnly?: boolean } = {}): string {
  if (options.readOnly) guardReadOnlyClick(el)
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior })
  const { x, y } = center(el)
  const opts = { clientX: x, clientY: y }
  el.dispatchEvent(pointerEvent('pointerover', el, opts))
  el.dispatchEvent(pointerEvent('pointerenter', el, { ...opts, bubbles: false }))
  el.dispatchEvent(mouseEvent('mouseover', el, opts))
  el.dispatchEvent(mouseEvent('mouseenter', el, { ...opts, bubbles: false }))
  el.dispatchEvent(pointerEvent('pointermove', el, opts))
  el.dispatchEvent(mouseEvent('mousemove', el, opts))
  el.dispatchEvent(pointerEvent('pointerdown', el, opts))
  el.dispatchEvent(mouseEvent('mousedown', el, opts))
  if (el instanceof HTMLElement) el.focus({ preventScroll: true })
  el.dispatchEvent(pointerEvent('pointerup', el, opts))
  el.dispatchEvent(mouseEvent('mouseup', el, opts))
  el.dispatchEvent(mouseEvent('click', el, opts))
  return `clicked ${describeElement(el)} [ref=${getRef(el)}]`
}

export function centerOf(el: Element): { x: number; y: number; description: string } {
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior })
  const rect = el.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    description: `${describeElement(el)} [ref=${getRef(el)}]`,
  }
}

export function focusElement(el: Element): string {
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior })
  if (!(el instanceof HTMLElement)) throw new Error(`cannot focus ${describeElement(el)}`)
  el.focus({ preventScroll: true })
  if (document.activeElement !== el && !el.isContentEditable) {
    throw new Error(`cannot focus ${describeElement(el)}; click it first or use x,y coordinates`)
  }
  return `${describeElement(el)} [ref=${getRef(el)}]`
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
}

export function typeIntoElement(el: Element, text: string, opts: { clear?: boolean; submit?: boolean } = {}): string {
  const clear = opts.clear !== false
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior })
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus({ preventScroll: true })
    if (el.type === 'file') throw new Error('cannot type into a file input (browser security)')
    const next = clear ? text : el.value + text
    if (clear && el.select) {
      try {
        el.select()
      } catch {
        /* some input types cannot select */
      }
    }
    setNativeValue(el, next)
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: text, inputType: 'insertText' }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (el instanceof HTMLElement && el.isContentEditable) {
    el.focus({ preventScroll: true })
    if (clear) {
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    let inserted = false
    try {
      inserted = document.execCommand('insertText', false, text)
    } catch {
      inserted = false
    }
    if (!inserted) {
      el.textContent = clear ? text : el.textContent + text
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: text, inputType: 'insertText' }))
    }
  } else {
    throw new Error(`cannot type into ${describeElement(el)}: not an input, textarea or contenteditable`)
  }
  let message = `typed ${JSON.stringify(cleanText(text, 80))} into ${describeElement(el)} [ref=${getRef(el)}]`
  if (opts.submit) {
    message += `. ${submitForm(el)}`
  }
  return message
}

function submitForm(el: Element): string {
  const form = el.closest('form')
  if (!form) return 'no form to submit'
  try {
    form.requestSubmit()
    return 'submitted form'
  } catch {
    const submit = form.querySelector<HTMLElement>('button[type=submit],input[type=submit]')
    if (submit) {
      clickElement(submit)
      return 'submitted form (via submit button)'
    }
    return 'form found but could not submit'
  }
}

export function scrollPage(opts: { direction?: string; amount?: number; ref?: string; selector?: string }): string {
  if (opts.ref || opts.selector) {
    const el = resolveTarget({ ref: opts.ref, selector: opts.selector })
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
    return `scrolled ${describeElement(el)} into view`
  }
  const amount = opts.amount ?? 600
  const dir = opts.direction ?? 'down'
  const dx = dir === 'left' ? -amount : dir === 'right' ? amount : 0
  const dy = dir === 'up' ? -amount : dir === 'down' ? amount : 0
  window.scrollBy({ left: dx, top: dy, behavior: 'smooth' })
  const y = Math.round(window.scrollY)
  const max = Math.round(document.documentElement.scrollHeight - window.innerHeight)
  return `scrolled ${dir} ${amount}px (scrollY=${y}, max=${max})`
}

export function selectOption(el: Element, opts: { value?: string; label?: string }): string {
  if (!(el instanceof HTMLSelectElement)) throw new Error(`cannot select option on ${describeElement(el)}: not a <select>`)
  const option = opts.value != null
    ? Array.from(el.options).find((o) => o.value === opts.value)
    : opts.label != null
      ? Array.from(el.options).find((o) => cleanText(o.textContent, 200).toLowerCase() === opts.label!.toLowerCase())
      : undefined
  if (!option) {
    const available = Array.from(el.options).slice(0, 20).map((o) => `${JSON.stringify(o.value)} (${cleanText(o.textContent, 40)})`).join(', ')
    throw new Error(`option not found in ${describeElement(el)}. Available: ${available}`)
  }
  el.focus({ preventScroll: true })
  el.value = option.value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return `selected ${JSON.stringify(cleanText(option.textContent, 40))} in ${describeElement(el)} [ref=${getRef(el)}]`
}

let highlightEl: HTMLElement | null = null

export function highlightElement(el: Element, durationMs = 1500): string {
  highlightEl?.remove()
  const rect = el.getBoundingClientRect()
  const box = document.createElement('div')
  box.style.cssText = [
    'position:fixed',
    `left:${rect.left - 2}px`,
    `top:${rect.top - 2}px`,
    `width:${rect.width + 4}px`,
    `height:${rect.height + 4}px`,
    'border:2px solid #f59e0b',
    'background:rgba(245,158,11,0.15)',
    'border-radius:4px',
    'pointer-events:none',
    'z-index:2147483647',
    'transition:opacity 0.3s ease',
  ].join(';')
  document.documentElement.appendChild(box)
  highlightEl = box
  setTimeout(() => {
    box.style.opacity = '0'
    setTimeout(() => box.remove(), 350)
  }, durationMs)
  return `highlighted ${describeElement(el)} [ref=${getRef(el)}]`
}

export interface WaitForOptions {
  ref?: string
  selector?: string
  text?: string
  timeout_ms?: number
}

export function waitFor(opts: WaitForOptions): Promise<string> {
  const timeout = Math.min(Math.max(opts.timeout_ms ?? 10000, 500), 60000)
  const start = Date.now()
  const needle = opts.text?.toLowerCase()

  const check = (): string | null => {
    if (opts.ref) {
      const el = resolveTarget({ ref: opts.ref })
      if (isRendered(el)) return `element ${describeElement(el)} is visible`
      return null
    }
    if (opts.selector) {
      const el = document.querySelector(opts.selector)
      if (el && isRendered(el)) return `selector "${opts.selector}" matched ${describeElement(el)}`
      return null
    }
    if (needle) {
      const body = document.body?.innerText?.toLowerCase() ?? ''
      if (body.includes(needle)) return `page now contains "${opts.text}"`
      return null
    }
    return 'no condition provided'
  }

  return new Promise((resolve, reject) => {
    const attempt = () => {
      let result: string | null = null
      try {
        result = check()
      } catch (e) {
        reject(e)
        return
      }
      if (result === 'no condition provided') {
        reject(new Error('provide one of: selector, text, ref'))
        return
      }
      if (result) {
        resolve(result)
        return
      }
      if (Date.now() - start >= timeout) {
        reject(new Error(`timed out after ${timeout}ms waiting for ${JSON.stringify({ selector: opts.selector, text: opts.text, ref: opts.ref })}`))
        return
      }
      setTimeout(attempt, 250)
    }
    attempt()
  })
}
