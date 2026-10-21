import type { ConsoleEntry } from './protocol'

const MAX_ENTRIES = 1000

const buffers = new Map<number, ConsoleEntry[]>()

export function pushConsole(tabId: number, entry: ConsoleEntry): void {
  let buf = buffers.get(tabId)
  if (!buf) {
    buf = []
    buffers.set(tabId, buf)
  }
  if (entry.level === 'clear') {
    buf.length = 0
    return
  }
  buf.push(entry)
  if (buf.length > MAX_ENTRIES) buf.splice(0, buf.length - MAX_ENTRIES)
}

export function readConsole(tabId: number, limit = 100): ConsoleEntry[] {
  const buf = buffers.get(tabId) ?? []
  return limit <= 0 ? [...buf] : buf.slice(-limit)
}

export function clearConsole(tabId: number): void {
  buffers.delete(tabId)
}

export function formatConsole(entries: ConsoleEntry[], maxChars = 20000): string {
  if (entries.length === 0) return '(console is empty)'
  const lines: string[] = []
  let total = 0
  let truncated = false
  for (const e of entries) {
    const time = new Date(e.ts).toISOString().slice(11, 23)
    const tag = e.source === 'exception' ? 'exception' : e.source === 'browser' ? 'browser' : e.level
    const loc = e.url ? ` (${e.url}${e.line != null ? `:${e.line + 1}` : ''})` : ''
    const line = `[${time}] ${tag}: ${e.text}${loc}`
    total += line.length + 1
    if (total > maxChars) {
      truncated = true
      break
    }
    lines.push(line)
  }
  if (truncated) lines.push(`… (${entries.length - lines.length} more entries truncated)`)
  return lines.join('\n')
}
