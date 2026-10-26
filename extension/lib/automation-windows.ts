import { browser } from 'wxt/browser'
import { storage } from 'wxt/utils/storage'
import { forgetWindow } from './routing'

/**
 * Chrome windows that the bridge created for sessions without a side panel.
 * They are not the user's windows, so they can be closed when the session ends.
 * Session storage matches the lifetime of those windows: a browser restart
 * removes both.
 */
const automationWindowsItem = storage.defineItem<Record<string, number>>('session:automationWindows', {
  fallback: {},
})

let chain: Promise<unknown> = Promise.resolve()

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn)
  chain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

export async function markAutomationWindow(sessionID: string, windowId: number): Promise<void> {
  if (!sessionID || !Number.isInteger(windowId)) return
  await withLock(async () => {
    const map = (await automationWindowsItem.getValue()) ?? {}
    map[sessionID] = windowId
    await automationWindowsItem.setValue(map)
  }).catch(() => {})
}

export async function forgetAutomationWindow(windowId: number): Promise<void> {
  if (!Number.isInteger(windowId)) return
  await withLock(async () => {
    const map = (await automationWindowsItem.getValue()) ?? {}
    let changed = false
    for (const [sessionID, boundWindow] of Object.entries(map)) {
      if (boundWindow !== windowId) continue
      delete map[sessionID]
      changed = true
    }
    if (changed) await automationWindowsItem.setValue(map)
  }).catch(() => {})
}

/**
 * Close the background window created for a session. Side-panel sessions are
 * never registered here, so this cannot close the window the user is using.
 * If it is the only window left, leave it alone rather than exiting Chrome.
 */
export async function closeAutomationWindow(sessionID: string): Promise<void> {
  if (!sessionID) return
  const windowId = await withLock(async () => {
    const map = (await automationWindowsItem.getValue()) ?? {}
    const bound = map[sessionID]
    if (bound == null) return null
    // Do not exit Chrome if this happens to be the only window left. Keep the
    // registry entry so a later attempt can still clean it up.
    const windows = await browser.windows.getAll().catch(() => [])
    if (windows.length <= 1) return null
    delete map[sessionID]
    await automationWindowsItem.setValue(map)
    return bound
  }).catch(() => null)
  if (windowId == null) return

  await browser.windows.remove(windowId).catch(() => {})
  await forgetWindow(windowId)
}
