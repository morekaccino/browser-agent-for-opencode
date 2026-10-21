import { browser } from 'wxt/browser'
import { buildSnapshot } from '../lib/page/snapshot'
import {
  clickElement,
  highlightElement,
  hoverElement,
  pressKey,
  scrollPage,
  selectOption,
  typeIntoElement,
  waitFor,
} from '../lib/page/actions'
import { cssPath, resolveTarget } from '../lib/page/dom'
import { setHalo } from '../lib/page/halo'

interface PageOp {
  kind: 'page'
  op: string
  params?: Record<string, any>
}

function handleAction(kind: string, params: Record<string, any>): string | Promise<string> {
  switch (kind) {
    case 'click':
      return clickElement(resolveTarget(params))
    case 'hover':
      return hoverElement(resolveTarget(params))
    case 'highlight':
      return highlightElement(resolveTarget(params))
    case 'type':
      return typeIntoElement(resolveTarget(params), String(params.text ?? ''), { clear: params.clear, submit: params.submit })
    case 'press': {
      const target = params.ref || params.selector || params.text ? resolveTarget(params) : null
      return pressKey(target, String(params.key ?? 'Enter'))
    }
    case 'select':
      return selectOption(resolveTarget(params), { value: params.value, label: params.label })
    case 'scroll':
      return scrollPage({ direction: params.direction, amount: params.amount, ref: params.ref, selector: params.selector })
    case 'wait_for':
      return waitFor(params)
    default:
      throw new Error(`unknown action: ${kind}`)
  }
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*', 'file:///*'],
  runAt: 'document_start',
  allFrames: false,

  main() {
    const g = globalThis as any
    if (g.__ocbContentInstalled) return
    g.__ocbContentInstalled = true

    // --- console hook <-> background plumbing -------------------------------------------
    window.addEventListener('message', (event) => {
      if (event.source !== window) return
      const data = event.data as { source?: string; kind?: string; entry?: unknown } | null
      if (!data || data.source !== 'ocb-hook') return
      if (data.kind === 'console') {
        browser.runtime.sendMessage({ kind: 'console', entry: data.entry }).catch(() => {})
      }
    })

    // handshake with the MAIN-world hook so nothing is lost before this script is up
    let acked = false
    const sendReady = (attempt = 0) => {
      if (acked) return
      window.postMessage({ source: 'ocb-content', type: 'ready' }, '*')
      if (attempt < 10 && !acked) setTimeout(() => sendReady(attempt + 1), 500)
    }
    window.addEventListener('message', (event) => {
      const data = event.data as { source?: string; kind?: string } | null
      if (data?.source === 'ocb-hook' && data.kind === 'ack') acked = true
    })
    sendReady()

    // --- agent operations -----------------------------------------------------------------
    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const msg = message as PageOp
      if (!msg || msg.kind !== 'page') return undefined

      const params = msg.params ?? {}

      ;(async () => {
        try {
          if (msg.op === 'snapshot') {
            const result = buildSnapshot()
            sendResponse({ ok: true, result })
          } else if (msg.op === 'halo') {
            const result = setHalo(params.active === true, params.colors as [string, string, string, string] | undefined)
            sendResponse({ ok: true, result })
          } else if (msg.op === 'selector_for') {
            const el = resolveTarget(params)
            const findFileInput = (target: Element): HTMLInputElement | null => {
              if (target instanceof HTMLInputElement && target.type === 'file') return target
              if (target instanceof HTMLLabelElement) {
                const control = target.control
                if (control instanceof HTMLInputElement && control.type === 'file') return control
              }
              const inner = target.querySelector('input[type=file]')
              if (inner instanceof HTMLInputElement) return inner
              const near = target.parentElement?.querySelector('input[type=file]')
              if (near instanceof HTMLInputElement) return near
              const all = document.querySelectorAll('input[type=file]')
              if (all.length === 1 && all[0] instanceof HTMLInputElement) return all[0]
              return null
            }
            const input = findFileInput(el)
            sendResponse({
              ok: true,
              result: {
                selector: cssPath(input ?? el),
                isFileInput: !!input,
                accept: input?.accept ?? '',
              },
            })
          } else if (msg.op === 'iframes') {
            // Keep every iframe (including hidden/zero-size ones) so indices
            // line up with the CDP iframe list; the caller filters by size.
            const frames = Array.from(document.querySelectorAll('iframe')).map((frame) => {
              const rect = frame.getBoundingClientRect()
              return { src: frame.src ?? '', x: rect.left, y: rect.top, w: rect.width, h: rect.height }
            })
            sendResponse({ ok: true, result: frames })
          } else if (msg.op === 'clear_hook') {
            window.postMessage({ source: 'ocb-content', type: 'clear' }, '*')
            sendResponse({ ok: true, result: 'cleared' })
          } else if (msg.op === 'page_info') {
            sendResponse({
              ok: true,
              result: { url: location.href, title: document.title, readyState: document.readyState },
            })
          } else {
            const result = await handleAction(msg.op, params)
            sendResponse({ ok: true, result })
          }
        } catch (error) {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      })()

      return true
    })
  },
})
