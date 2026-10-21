import { browser } from 'wxt/browser'
import type { BridgeStatus } from '../../lib/protocol'
import { bridgeStatusItem } from '../../lib/settings'

/** Call a method on the background service worker (single source of module state). */
export async function callBackground<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const response = (await browser.runtime.sendMessage({ kind: 'internal', method, params })) as
    | { ok: true; result: T }
    | { ok: false; error: string }
    | undefined
  if (!response) throw new Error('no response from the background worker')
  if (!response.ok) throw new Error(response.error)
  return response.result
}

export { bridgeStatusItem }
export type { BridgeStatus }
