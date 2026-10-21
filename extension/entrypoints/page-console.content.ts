/**
 * MAIN-world console hook. Runs at document_start in the page's own JS context,
 * wraps console.* and window error handlers, and forwards entries to the isolated
 * content script (which relays them to the background console buffer).
 *
 * This file must stay dependency-free: it runs in the page context.
 */

interface HookEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'clear'
  text: string
  ts: number
  source?: 'console' | 'exception'
  url?: string
  line?: number
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*', 'file:///*'],
  runAt: 'document_start',
  world: 'MAIN',
  allFrames: false,

  main() {
    const w = window as any
    if (w.__ocbHookInstalled) return
    w.__ocbHookInstalled = true

    const MAX_PENDING = 1000
    let acked = false
    const pending: HookEntry[] = []

    const post = (kind: string, entry?: HookEntry) => {
      try {
        window.postMessage({ source: 'ocb-hook', kind, entry }, '*')
      } catch {
        /* ignore */
      }
    }

    const push = (entry: HookEntry) => {
      if (acked) {
        post('console', entry)
      } else {
        pending.push(entry)
        if (pending.length > MAX_PENDING) pending.splice(0, pending.length - MAX_PENDING)
      }
    }

    window.addEventListener('message', (event) => {
      const data = event.data
      if (!data || data.source !== 'ocb-content') return
      if (data.type === 'ready') {
        acked = true
        post('ack')
        for (const entry of pending) post('console', entry)
        pending.length = 0
      } else if (data.type === 'clear') {
        pending.length = 0
      }
    })

    const fmt = (value: unknown, seen: Set<object> = new Set(), depth = 0): string => {
      try {
        if (value === undefined) return 'undefined'
        if (value === null) return 'null'
        const t = typeof value
        if (t === 'string') return depth === 0 ? (value as string) : JSON.stringify(value)
        if (t === 'number' || t === 'boolean' || t === 'bigint') return String(value)
        if (t === 'symbol') return String(value)
        if (t === 'function') return `ƒ ${(value as any).name || 'anonymous'}()`
        if (value instanceof Error) return String(value.stack || `${value.name}: ${value.message}`)
        if (typeof Element !== 'undefined' && value instanceof Element) {
          const tag = value.tagName.toLowerCase()
          return `<${tag}${value.id ? `#${value.id}` : ''}>`
        }
        if (depth > 4) return Array.isArray(value) ? '[…]' : '{…}'
        const obj = value as object
        if (seen.has(obj)) return '[Circular]'
        seen.add(obj)
        if (Array.isArray(value)) {
          const items = value.slice(0, 50).map((v) => fmt(v, seen, depth + 1)).join(', ')
          return `[${items}${value.length > 50 ? ', …' : ''}]`
        }
        const keys = Object.keys(obj)
        const shown = keys.slice(0, 30)
        const body = shown.map((k) => `${k}: ${fmt((obj as any)[k], seen, depth + 1)}`).join(', ')
        return `{${body}${keys.length > 30 ? ', …' : ''}}`
      } catch {
        return '[unserializable]'
      }
    }

    const stackTail = (): string => {
      try {
        const stack = String(new Error().stack ?? '')
        const lines = stack.split('\n').slice(2).filter((l) => l.trim()).slice(0, 5)
        return lines.length ? `\n    ${lines.map((l) => l.trim()).join('\n    ')}` : ''
      } catch {
        return ''
      }
    }

    const serializeArgs = (args: unknown[]): string => {
      let text = args.map((a) => fmt(a)).join(' ')
      if (text.length > 4000) text = text.slice(0, 4000) + '…'
      return text
    }

    for (const level of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
      const original = (console as any)[level] as (...args: unknown[]) => void
      ;(console as any)[level] = function (...args: unknown[]) {
        try {
          let text = serializeArgs(args)
          if (level === 'error' || level === 'warn' || level === 'trace') text += stackTail()
          push({ level, text, ts: Date.now(), source: 'console', url: location.href })
        } catch {
          /* never break the page */
        }
        return original.apply(console, args)
      }
    }

    const originalClear = console.clear.bind(console)
    console.clear = function () {
      try {
        push({ level: 'clear', text: '', ts: Date.now(), source: 'console' })
      } catch {
        /* ignore */
      }
      return originalClear()
    }

    window.addEventListener(
      'error',
      (event: ErrorEvent) => {
        if (event.target && event.target !== window) return // resource load error
        try {
          const stack = event.error instanceof Error ? `\n${String(event.error.stack ?? '').slice(0, 1200)}` : ''
          const location_ = event.filename ? ` at ${event.filename}:${event.lineno}:${event.colno}` : ''
          push({ level: 'error', source: 'exception', text: `${event.message}${location_}${stack}`, ts: Date.now(), url: location.href })
        } catch {
          /* ignore */
        }
      },
      true,
    )

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      try {
        push({ level: 'error', source: 'exception', text: `Unhandled promise rejection: ${fmt(event.reason)}`, ts: Date.now(), url: location.href })
      } catch {
        /* ignore */
      }
    })
  },
})
