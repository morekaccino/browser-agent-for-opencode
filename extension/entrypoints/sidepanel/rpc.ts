import { browser } from 'wxt/browser'
import type { BridgeStatus } from '../../lib/protocol'
import { bridgeStatusItem } from '../../lib/settings'

let currentWindowId: number | null = null

/** The Chrome window hosting this side panel. */
export async function getWindowId(): Promise<number | null> {
  if (currentWindowId != null) return currentWindowId
  try {
    // A side panel is an extension page hosted by one Chrome window;
    // windows.getCurrent returns that host window, not the last focused one.
    const win = await browser.windows.getCurrent()
    if (win.id != null) {
      currentWindowId = win.id
      return currentWindowId
    }
  } catch {
    /* fall through to the active-tab query */
  }
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (tab?.windowId != null) {
      currentWindowId = tab.windowId
      return currentWindowId
    }
  } catch {
    /* no window yet */
  }
  return null
}

/** Call a method on the background service worker (single source of module state). */
export async function callBackground<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const windowId = await getWindowId()
  const response = (await browser.runtime.sendMessage({
    kind: 'internal',
    method,
    params,
    ...(windowId != null ? { windowId } : {}),
  })) as { ok: true; result: T } | { ok: false; error: string } | undefined
  if (!response) throw new Error('no response from the background worker')
  if (!response.ok) throw new Error(response.error)
  return response.result
}

export { bridgeStatusItem }
export type { BridgeStatus }
