import { cleanText, describeElement, getRef, resolveTarget, isRendered } from './dom'

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

export function clickElement(el: Element): string {
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

export function hoverElement(el: Element): string {
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior })
  const { x, y } = center(el)
  const opts = { clientX: x, clientY: y }
  el.dispatchEvent(pointerEvent('pointerover', el, opts))
  el.dispatchEvent(pointerEvent('pointerenter', el, { ...opts, bubbles: false }))
  el.dispatchEvent(mouseEvent('mouseover', el, opts))
  el.dispatchEvent(mouseEvent('mouseenter', el, { ...opts, bubbles: false }))
  el.dispatchEvent(pointerEvent('pointermove', el, opts))
  el.dispatchEvent(mouseEvent('mousemove', el, opts))
  return `hovered ${describeElement(el)} [ref=${getRef(el)}]`
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

const KEY_CODES: Record<string, { code: string; keyCode: number }> = {
  Enter: { code: 'Enter', keyCode: 13 },
  Tab: { code: 'Tab', keyCode: 9 },
  Escape: { code: 'Escape', keyCode: 27 },
  Backspace: { code: 'Backspace', keyCode: 8 },
  Delete: { code: 'Delete', keyCode: 46 },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { code: 'ArrowRight', keyCode: 39 },
  Home: { code: 'Home', keyCode: 36 },
  End: { code: 'End', keyCode: 35 },
  PageUp: { code: 'PageUp', keyCode: 33 },
  PageDown: { code: 'PageDown', keyCode: 34 },
  ' ': { code: 'Space', keyCode: 32 },
}

function keyInfo(key: string): { code: string; keyCode: number; printable: boolean } {
  const named = KEY_CODES[key]
  if (named) return { ...named, printable: key === ' ' }
  const upper = key.toUpperCase()
  if (upper.length === 1) {
    const isLetter = upper >= 'A' && upper <= 'Z'
    const isDigit = upper >= '0' && upper <= '9'
    return { code: isLetter ? `Key${upper}` : isDigit ? `Digit${upper}` : key, keyCode: upper.charCodeAt(0), printable: true }
  }
  return { code: key, keyCode: 0, printable: false }
}

export function pressKey(el: Element | null, key: string): string {
  const target: EventTarget = el ?? document.activeElement ?? document.body
  if (el instanceof HTMLElement) el.focus({ preventScroll: true })
  const info = keyInfo(key)
  const init: KeyboardEventInit = {
    key,
    code: info.code,
    keyCode: info.keyCode,
    which: info.keyCode,
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
  }
  const down = new KeyboardEvent('keydown', init)
  const notCancelled = target.dispatchEvent(down)
  if (info.printable || key === 'Enter') {
    target.dispatchEvent(new KeyboardEvent('keypress', init))
  }
  target.dispatchEvent(new KeyboardEvent('keyup', init))
  let message = `pressed "${key}"`
  if (el) message += ` on ${describeElement(el)}`
  if (key === 'Enter' && notCancelled) {
    const form = el instanceof HTMLElement ? el.closest('form') : (document.activeElement as HTMLElement | null)?.closest('form')
    if (form) {
      message += `. ${submitForm(form)}`
    }
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
