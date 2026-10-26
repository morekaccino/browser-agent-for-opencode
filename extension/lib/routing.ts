import { browser } from 'wxt/browser'
import { storage } from 'wxt/utils/storage'

/**
 * Session <-> Chrome window bindings.
 *
 * A side panel owns one window. When it switches opencode sessions it binds
 * the new session to its window, so bridge tool calls from that session know
 * which window to act on. Sessions with no side panel (scheduled workflows,
 * desktop-app sessions) get an automation window instead of the user's focus.
 */
const sessionWindowsItem = storage.defineItem<Record<string, number>>('session:sessionWindows', {
  fallback: {},
})
const windowSessionsItem = storage.defineItem<Record<string, string>>('session:windowSessions', {
  fallback: {},
})

export async function bindSessionWindow(sessionID: string, windowId: number): Promise<void> {
  if (!sessionID || !Number.isInteger(windowId)) return
  const [sessionWindows, windowSessions] = await Promise.all([
    sessionWindowsItem.getValue().catch((): Record<string, number> => ({})),
    windowSessionsItem.getValue().catch((): Record<string, string> => ({})),
  ])

  // Never pull a live session out of another window. This is what keeps two
  // side panels (or a workflow's automation window) from fighting over the
  // same agent run. If the old window is gone, the rebind is allowed.
  const previousWindow = sessionWindows[sessionID]
  if (previousWindow != null && previousWindow !== windowId) {
    const existing = await browser.windows.get(previousWindow).catch(() => null)
    if (existing?.id != null) return
  }
  if (previousWindow != null) delete windowSessions[String(previousWindow)]
  const previousSession = windowSessions[String(windowId)]
  if (previousSession) delete sessionWindows[previousSession]

  sessionWindows[sessionID] = windowId
  windowSessions[String(windowId)] = sessionID

  await Promise.all([
    sessionWindowsItem.setValue(sessionWindows).catch(() => {}),
    windowSessionsItem.setValue(windowSessions).catch(() => {}),
  ])
}

export async function windowForSession(sessionID?: string): Promise<number | undefined> {
  if (!sessionID) return undefined
  const map = await sessionWindowsItem.getValue().catch((): Record<string, number> => ({}))
  const windowId = map[sessionID]
  return typeof windowId === 'number' ? windowId : undefined
}

export async function sessionForWindow(windowId?: number | null): Promise<string | undefined> {
  if (windowId == null) return undefined
  const map = await windowSessionsItem.getValue().catch((): Record<string, string> => ({}))
  return map[String(windowId)] || undefined
}

/** True when this session is still owned by a different, live Chrome window. */
export async function sessionOwnedByOtherWindow(sessionID: string, windowId: number): Promise<boolean> {
  const bound = await windowForSession(sessionID)
  if (bound == null || bound === windowId) return false
  const existing = await browser.windows.get(bound).catch(() => null)
  return existing?.id != null
}

/** Sessions already owned by a different live window; a new panel skips these. */
export async function sessionsBoundToOtherWindows(windowId: number): Promise<Set<string>> {
  const map = await sessionWindowsItem.getValue().catch((): Record<string, number> => ({}))
  return new Set(
    Object.entries(map)
      .filter(([, boundWindow]) => boundWindow !== windowId)
      .map(([sessionID]) => sessionID),
  )
}

export async function forgetSession(sessionID: string): Promise<void> {
  const [sessionWindows, windowSessions] = await Promise.all([
    sessionWindowsItem.getValue().catch((): Record<string, number> => ({})),
    windowSessionsItem.getValue().catch((): Record<string, string> => ({})),
  ])
  const windowId = sessionWindows[sessionID]
  if (windowId != null) delete windowSessions[String(windowId)]
  delete sessionWindows[sessionID]
  await Promise.all([
    sessionWindowsItem.setValue(sessionWindows).catch(() => {}),
    windowSessionsItem.setValue(windowSessions).catch(() => {}),
  ])
}

export async function forgetWindow(windowId: number): Promise<void> {
  const [sessionWindows, windowSessions] = await Promise.all([
    sessionWindowsItem.getValue().catch((): Record<string, number> => ({})),
    windowSessionsItem.getValue().catch((): Record<string, string> => ({})),
  ])
  delete windowSessions[String(windowId)]
  for (const [sessionID, boundWindow] of Object.entries(sessionWindows)) {
    if (boundWindow === windowId) delete sessionWindows[sessionID]
  }
  await Promise.all([
    sessionWindowsItem.setValue(sessionWindows).catch(() => {}),
    windowSessionsItem.setValue(windowSessions).catch(() => {}),
  ])
}
