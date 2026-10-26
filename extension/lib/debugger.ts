import { browser } from 'wxt/browser'
import type { ConsoleEntry, ConsoleLevel } from './protocol'
import { pushConsole } from './console-buffer'
import { settings } from './settings'

const attached = new Set<number>()

export function isAttached(tabId: number): boolean {
  return attached.has(tabId)
}

export async function ensureAttached(tabId: number): Promise<void> {
  if (attached.has(tabId)) return
  try {
    await browser.debugger.attach({ tabId }, '1.3')
  } catch (error) {
    const ok = await probe(tabId)
    if (!ok) {
      throw new Error(
        `could not attach the debugger to tab ${tabId}: ${message(error)}. ` +
          'Close DevTools for that tab (or use hook console mode instead).',
      )
    }
  }
  attached.add(tabId)
  await browser.debugger.sendCommand({ tabId }, 'Runtime.enable')
  await browser.debugger.sendCommand({ tabId }, 'Log.enable')
  await browser.debugger.sendCommand({ tabId }, 'Page.enable')
}

async function probe(tabId: number): Promise<boolean> {
  try {
    await browser.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' })
    return true
  } catch {
    return false
  }
}

export async function detach(tabId: number): Promise<void> {
  if (!attached.has(tabId)) return
  attached.delete(tabId)
  try {
    await browser.debugger.detach({ tabId })
  } catch {
    /* already gone */
  }
}

export async function detachAll(): Promise<void> {
  for (const tabId of Array.from(attached)) await detach(tabId)
}

/**
 * One-off CDP work (iframe scans, x/y input, uploads, screenshots) should not
 * leave the debugger attached in the default hook engine. In debugger mode the
 * attachment is intentional (console capture), so keep it.
 */
export async function detachIfEphemeral(tabId: number): Promise<void> {
  try {
    if ((await settings.consoleEngine.getValue()) !== 'debugger') await detach(tabId)
  } catch {
    /* settings/storage unavailable */
  }
}

function mapLevel(type: string): ConsoleLevel {
  if (type === 'warning') return 'warn'
  if (type === 'log' || type === 'info' || type === 'warn' || type === 'error' || type === 'debug') return type
  return 'log'
}

function remoteObjectToString(obj: any): string {
  if (!obj) return 'undefined'
  try {
    if ('value' in obj && obj.value !== undefined) {
      if (typeof obj.value === 'string') return obj.value
      return JSON.stringify(obj.value)
    }
    if (obj.preview) {
      const props = (obj.preview.properties ?? []).map((p: any) => `${p.name}: ${p.value}`)
      if (props.length) return `${obj.description ?? obj.preview.description ?? obj.preview.subtype ?? obj.type} {${props.join(', ')}}`
    }
    if (obj.unserializableValue) return String(obj.unserializableValue)
    return obj.description ?? obj.type ?? 'unknown'
  } catch {
    return obj.description ?? String(obj.type ?? 'unknown')
  }
}

export function initDebugger(): void {
  browser.debugger.onEvent.addListener((source, method, params: any) => {
    const tabId = source.tabId
    if (tabId == null || params == null) return
    try {
      if (method === 'Runtime.consoleAPICalled') {
        pushConsole(tabId, {
          level: mapLevel(String(params.type)),
          text: (params.args ?? []).map(remoteObjectToString).join(' ').slice(0, 4000),
          ts: params.timestamp ?? Date.now(),
          source: 'console',
        })
      } else if (method === 'Runtime.exceptionThrown') {
        const details = params.exceptionDetails ?? {}
        const description = details.exception?.description ?? details.text ?? 'Uncaught error'
        const loc = details.url ? ` at ${details.url}:${(details.lineNumber ?? 0) + 1}` : ''
        pushConsole(tabId, {
          level: 'error',
          text: `${description}${loc}`.slice(0, 4000),
          ts: Date.now(),
          source: 'exception',
          url: details.url,
          line: details.lineNumber,
        })
      } else if (method === 'Log.entryAdded') {
        const entry = params.entry ?? {}
        const level: ConsoleLevel =
          entry.level === 'warning' ? 'warn' : entry.level === 'verbose' ? 'debug' : entry.level === 'info' || entry.level === 'error' ? entry.level : 'log'
        pushConsole(tabId, {
          level,
          text: String(entry.text ?? '').slice(0, 3000),
          ts: entry.timestamp ?? Date.now(),
          source: 'browser',
          url: entry.url,
          line: entry.lineNumber,
        })
      }
    } catch {
      /* never crash on a malformed CDP event */
    }
  })

  browser.debugger.onDetach.addListener((source) => {
    if (source.tabId != null) attached.delete(source.tabId)
  })
}

export interface EvalResult {
  text: string
  isError: boolean
}

export async function evaluate(tabId: number, expression: string): Promise<EvalResult> {
  await ensureAttached(tabId)
  const response: any = await browser.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  })
  if (response?.exceptionDetails) {
    const details = response.exceptionDetails
    const description = details.exception?.description ?? details.text ?? 'evaluation error'
    return { text: String(description).slice(0, 8000), isError: true }
  }
  const result = response?.result
  if (!result) return { text: 'undefined', isError: false }
  try {
    if ('value' in result && result.value !== undefined) {
      if (typeof result.value === 'string') return { text: result.value, isError: false }
      return { text: JSON.stringify(result.value, null, 2)?.slice(0, 8000) ?? String(result.value), isError: false }
    }
    if (result.unserializableValue) return { text: String(result.unserializableValue), isError: false }
    return { text: String(result.description ?? result.type ?? 'undefined').slice(0, 8000), isError: false }
  } catch {
    return { text: String(result.description ?? 'undefined').slice(0, 8000), isError: false }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

/**
 * Capture the viewport by taking a reliable full-page CDP capture and cropping
 * it in an OffscreenCanvas. Chrome's clipped/clip-based screenshot commands can
 * hang on Windows when the window is occluded or under automation.
 */
export async function screenshot(tabId: number, fullPage: boolean): Promise<string> {
  await ensureAttached(tabId)

  let metrics: any = null
  if (!fullPage) {
    try {
      metrics = await browser.debugger.sendCommand({ tabId }, 'Page.getLayoutMetrics')
    } catch {
      /* fall back to the full capture */
    }
  }

  const response: any = await browser.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
  })
  const data = response?.data
  if (!data) throw new Error('screenshot failed: no data returned')
  if (fullPage || !metrics) return String(data)

  try {
    const viewport = metrics.cssVisualViewport ?? metrics.cssLayoutViewport
    const content = metrics.cssContentSize ?? metrics.contentSize
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob()
    const bitmap = await createImageBitmap(blob)
    const scaleX = content?.width ? bitmap.width / content.width : 1
    const scaleY = content?.height ? bitmap.height / content.height : 1
    const sx = Math.max(0, Math.round((viewport?.pageX ?? 0) * scaleX))
    const sy = Math.max(0, Math.round((viewport?.pageY ?? 0) * scaleY))
    const sw = Math.max(1, Math.min(bitmap.width - sx, Math.round((viewport?.clientWidth ?? bitmap.width) * scaleX)))
    const sh = Math.max(1, Math.min(bitmap.height - sy, Math.round((viewport?.clientHeight ?? bitmap.height) * scaleY)))
    const canvas = new OffscreenCanvas(sw, sh)
    const context = canvas.getContext('2d')
    if (!context) return String(data)
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)
    const out = await canvas.convertToBlob({ type: 'image/png' })
    return bytesToBase64(new Uint8Array(await out.arrayBuffer()))
  } catch {
    return String(data)
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/* ------------------------------------------------------------------------------------------
 * Real input events via CDP — routed through the browser's input pipeline, so they work
 * inside cross-origin/OOPIF iframes where content scripts cannot reach.
 * Coordinates are CSS pixels relative to the tab's viewport.
 * ---------------------------------------------------------------------------------------- */

export async function clickPoint(tabId: number, x: number, y: number): Promise<void> {
  await ensureAttached(tabId)
  const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, modifiers: 0 }
  await browser.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mouseMoved', ...base })
  await browser.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...base, buttons: 1 })
  await browser.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...base, buttons: 0 })
}

/** Move the real pointer so CSS :hover and pointer handlers run. */
export async function hoverPoint(tabId: number, x: number, y: number): Promise<void> {
  await ensureAttached(tabId)
  await browser.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: Math.round(x),
    y: Math.round(y),
    button: 'none',
    buttons: 0,
    modifiers: 0,
  })
}

export async function insertTextAtFocus(tabId: number, text: string): Promise<void> {
  await ensureAttached(tabId)
  await browser.debugger.sendCommand({ tabId }, 'Input.insertText', { text })
}

/** Select the focused field's contents without relying on an OS-specific modifier. */
export async function selectAllAtFocus(tabId: number): Promise<void> {
  await ensureAttached(tabId)
  const base = {
    key: 'a',
    code: 'KeyA',
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 0,
  }
  await browser.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    ...base,
    commands: ['selectAll'],
  })
  await browser.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base })
}

const KEYS: Record<string, { code: string; vk: number; text?: string }> = {
  Enter: { code: 'Enter', vk: 13, text: '\r' },
  Tab: { code: 'Tab', vk: 9 },
  Escape: { code: 'Escape', vk: 27 },
  Backspace: { code: 'Backspace', vk: 8 },
  Delete: { code: 'Delete', vk: 46 },
  ArrowUp: { code: 'ArrowUp', vk: 38 },
  ArrowDown: { code: 'ArrowDown', vk: 40 },
  ArrowLeft: { code: 'ArrowLeft', vk: 37 },
  ArrowRight: { code: 'ArrowRight', vk: 39 },
  Home: { code: 'Home', vk: 36 },
  End: { code: 'End', vk: 35 },
  PageUp: { code: 'PageUp', vk: 33 },
  PageDown: { code: 'PageDown', vk: 34 },
  ' ': { code: 'Space', vk: 32, text: ' ' },
}

export async function pressKeyCdp(tabId: number, key: string): Promise<void> {
  const named = KEYS[key]
  if (!named && key.length !== 1) throw new Error(`unsupported key: ${key}`)
  await ensureAttached(tabId)

  let info = named
  if (!info) {
    const upper = key.toUpperCase()
    const code = /[A-Z]/.test(upper) ? `Key${upper}` : /[0-9]/.test(upper) ? `Digit${upper}` : key
    info = { code, vk: key.charCodeAt(0), text: key }
  }

  const base = { key, code: info.code, windowsVirtualKeyCode: info.vk, nativeVirtualKeyCode: info.vk }
  await browser.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base })
  if (info.text) {
    await browser.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
      type: 'char',
      ...base,
      text: info.text,
      unmodifiedText: info.text,
    })
  }
  await browser.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base })
}

export interface FrameSnapshot {
  /** Index of the iframe in document order (matches the content script's list). */
  index: number
  frameId: string
  url: string
  title: string
  text: string
  interactive: Array<{ tag: string; name: string; x: number; y: number }>
}

/** Read the DOM of cross-origin child frames via CDP and collect their interactive elements. */
export async function snapshotFrames(tabId: number): Promise<FrameSnapshot[]> {
  await ensureAttached(tabId)
  const doc: any = await browser.debugger.sendCommand({ tabId }, 'DOM.getDocument', { depth: -1 })
  const rootId = doc?.root?.nodeId
  if (!rootId) return []
  const found: FrameSnapshot[] = []
  try {
    const { nodeIds = [] } = (await browser.debugger.sendCommand({ tabId }, 'DOM.querySelectorAll', {
      nodeId: rootId,
      selector: 'iframe',
    })) as { nodeIds: number[] }
    for (let index = 0; index < nodeIds.length; index++) {
      const nodeId = nodeIds[index]
      if (nodeId == null) continue
      let frameId: string | undefined
      let targetAttached = false
      try {
        const described: any = await browser.debugger.sendCommand({ tabId }, 'DOM.describeNode', { nodeId })
        frameId = described?.node?.frameId
        if (!frameId) continue
        // Same-site frames live in the current target; cross-site iframes are
        // out-of-process (OOPIF) and need their own debugger session.
        let evaluatedOn: number | 'target' = tabId
        let contextId: number | undefined
        try {
          const world: any = await browser.debugger.sendCommand({ tabId }, 'Page.createIsolatedWorld', {
            frameId,
            worldName: 'ocb-snapshot',
          })
          contextId = world?.executionContextId
        } catch {
          /* OOPIF — not visible from the tab target */
        }
        if (contextId == null) {
          try {
            await browser.debugger.attach({ targetId: frameId }, '1.3')
            targetAttached = true
            evaluatedOn = 'target'
            const world: any = await browser.debugger.sendCommand({ targetId: frameId }, 'Page.createIsolatedWorld', {
              frameId,
              worldName: 'ocb-snapshot',
            })
            contextId = world?.executionContextId
          } catch {
            continue
          }
        }
        const session = evaluatedOn === 'target' ? { targetId: frameId } : { tabId }
        const evalRes: any = await browser.debugger.sendCommand(session, 'Runtime.evaluate', {
          contextId,
          returnByValue: true,
          awaitPromise: false,
          expression: `(() => {
            const clean = (t) => (t || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
            const sensitive = (el) => {
              if (String(el.type || '').toLowerCase() === 'password') return true
              const autocomplete = String(el.getAttribute('autocomplete') || '').toLowerCase()
              if (/(^|\\s)(current-password|new-password|one-time-code|cc-number|cc-csc|cc-exp|cc-exp-month|cc-exp-year)(\\s|$)/.test(autocomplete)) return true
              const hint = [
                el.getAttribute('name'),
                el.getAttribute('id'),
                el.getAttribute('placeholder'),
                el.getAttribute('aria-label'),
              ].filter(Boolean).join(' ').toLowerCase()
              return /pass(word|code)?|otp|one[- ]?time|2fa|mfa|totp|cvv|cvc|card[- ]?(number|no)|credit[- ]?card|debit[- ]?card|security[- ]?code|ssn|social[- ]?security|tax[- ]?id|iban|account[- ]?number|routing[- ]?number|secret|token/.test(hint)
            }
            const labelOf = (el) => {
              const direct = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title')
              if (direct) return clean(direct)
              if (el instanceof HTMLSelectElement) {
                return clean((el.selectedOptions[0] && el.selectedOptions[0].textContent) || '')
              }
              if (el instanceof HTMLInputElement) {
                if (el.type === 'password') return 'password field'
                if (sensitive(el)) return 'sensitive field'
                if (el.type === 'file') return 'file input'
                if (el.type === 'checkbox' || el.type === 'radio') {
                  return clean((el.name || el.type) + ' ' + (el.checked ? 'checked' : 'unchecked'))
                }
                return clean(el.value || el.type)
              }
              if (el instanceof HTMLTextAreaElement) return sensitive(el) ? 'sensitive field' : clean(el.value || 'text area')
              return clean(el.innerText || '')
            }
            const items = []
            const nodes = document.querySelectorAll('input, button, a[href], select, textarea, [role=button], [contenteditable=true]')
            for (const el of Array.from(nodes).slice(0, 40)) {
              const r = el.getBoundingClientRect()
              if (r.width < 4 || r.height < 4) continue
              if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue
              const name = labelOf(el)
              items.push({ tag: el.tagName.toLowerCase(), name, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) })
            }
            return {
              url: location.href,
              title: document.title,
              text: clean((document.body && document.body.innerText) || '').slice(0, 1200),
              interactive: items,
            }
          })()`,
        })
        const value = evalRes?.result?.value
        if (value) {
          found.push({
            index,
            frameId,
            url: value.url ?? '',
            title: value.title ?? '',
            text: value.text ?? '',
            interactive: value.interactive ?? [],
          })
        }
      } catch {
        /* frame unavailable */
      } finally {
        if (targetAttached && frameId) {
          await browser.debugger.detach({ targetId: frameId }).catch(() => {})
        }
      }
    }
  } catch {
    /* no iframes or DOM unavailable */
  }
  return found
}
