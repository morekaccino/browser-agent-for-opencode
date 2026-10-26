import { browser } from 'wxt/browser'
import type { ConsoleEntry, TabInfo } from './protocol'
import { clearConsole, formatConsole, pushConsole, readConsole } from './console-buffer'
import {
  clickPoint,
  detachIfEphemeral,
  ensureAttached,
  evaluate,
  hoverPoint,
  insertTextAtFocus,
  isAttached,
  pressKeyCdp,
  screenshot as debuggerScreenshot,
  selectAllAtFocus,
  snapshotFrames,
} from './debugger'
import { ensureContentScript } from './inject'
import { windowForSession } from './routing'
import { agentGroupIdsItem, settings } from './settings'
import { haloCloudColors, resolveMode } from './theme'
import { handleWorkflowRequest } from './workflows/api'

const CONSOLE_TAIL = 25

export interface RequestContext {
  sessionID?: string
  windowId?: number
  /** Workflow run whose "Allow submissions and messages" switch is off. */
  readOnly?: boolean
}

function readOnlyBlocked(action: string): never {
  throw new Error(
    `Read-only workflow: ${action} is blocked. Report what you would do instead, ` +
      'or ask the user to enable "Allow submissions and messages" for this workflow.',
  )
}

function isScriptUrl(value: string): boolean {
  return /^\s*(?:javascript|data|vbscript):/i.test(value)
}

/** Agent state is per Chrome window so two windows never share a working tab or group. */
const agentTabByWindow = new Map<number, number>()
const agentOwnedTabs = new Set<number>()

/** A short, meaningful group title for a tab — its site name. */
function titleForTab(tab: Browser.tabs.Tab): string {
  try {
    if (tab.url) {
      const host = new URL(tab.url).hostname.replace(/^www\./, '')
      if (host) return host
    }
  } catch {
    /* not a URL */
  }
  return 'ai tabs'
}

async function sendHalo(tabId: number, active: boolean): Promise<void> {
  let colors: [string, string, string, string] | undefined
  if (active) {
    try {
      const [seed, mode] = await Promise.all([settings.themeSeed.getValue(), settings.themeMode.getValue()])
      colors = haloCloudColors(seed, resolveMode(mode))
    } catch {
      /* defaults */
    }
  }
  await browser.tabs
    .sendMessage(tabId, { kind: 'page', op: 'halo', params: { active, colors } })
    .catch(() => {})
}

function agentTabFor(windowId?: number): number | undefined {
  return windowId != null ? agentTabByWindow.get(windowId) : undefined
}

async function getAgentGroupId(windowId: number): Promise<number | null> {
  const map = await agentGroupIdsItem.getValue().catch((): Record<string, number> => ({}))
  const groupId = map[String(windowId)]
  return typeof groupId === 'number' ? groupId : null
}

let groupWrite: Promise<void> = Promise.resolve()

async function setAgentGroupId(windowId: number, groupId: number | null): Promise<void> {
  // Serialize read-modify-write updates when two windows create groups at once.
  const task = groupWrite.then(async () => {
    const map = { ...(await agentGroupIdsItem.getValue().catch((): Record<string, number> => ({}))) }
    if (groupId == null) delete map[String(windowId)]
    else map[String(windowId)] = groupId
    await agentGroupIdsItem.setValue(map).catch(() => {})
  })
  groupWrite = task.catch(() => {})
  await task
}

/** Rename (and possibly re-group) the agent's tabs — the agent names it after the task. */
async function nameAgentGroup(title: string, tabIdParam?: number, windowId?: number): Promise<string> {
  const tab = await resolveTab(tabIdParam ?? agentTabFor(windowId), windowId)
  if (tab.id == null) throw new Error('tab has no id')
  if (tab.windowId == null) throw new Error('tab has no window')
  const tabWindowId = tab.windowId
  const none = browser.tabGroups.TAB_GROUP_ID_NONE
  let groupId: number | null = null
  if (tab.groupId != null && tab.groupId !== none) {
    const group = await browser.tabGroups.get(tab.groupId).catch(() => null)
    const ours = group?.windowId === tabWindowId && (await getAgentGroupId(tabWindowId)) === group.id
    if (!ours) {
      throw new Error('that tab is in the user’s tab group; open a new tab for this task instead')
    }
    groupId = group?.id ?? null
  } else {
    const stored = await getAgentGroupId(tabWindowId)
    const storedGroup = stored != null ? await browser.tabGroups.get(stored).catch(() => null) : null
    groupId = storedGroup?.windowId === tabWindowId ? storedGroup.id : null
    if (groupId == null) {
      groupId = await browser.tabs.group({ tabIds: [tab.id] }).catch(() => null)
      if (groupId == null) throw new Error('could not create a tab group')
      await setAgentGroupId(tabWindowId, groupId)
    } else {
      await browser.tabs.group({ tabIds: [tab.id], groupId }).catch(() => {})
    }
  }
  await browser.tabGroups.update(groupId, { title })
  return `tab group ${groupId} named "${title}"`
}

/** Light the halo (page + tab bar) on the tab the agent is working on; at most one per window. */
async function markAgentTab(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId).catch(() => null)
  if (!tab || tab.id == null || tab.windowId == null) return
  const windowId = tab.windowId
  const previous = agentTabByWindow.get(windowId)
  agentTabByWindow.set(windowId, tabId)
  void sendHalo(tabId, true)
  if (previous != null && previous !== tabId) void sendHalo(previous, false)

  // "follow the AI": switch the user's view to the working tab (opt-in).
  // Deliberately no window focus change — never steal focus from other windows/apps.
  void (async () => {
    try {
      if (!(await settings.followAgent.getValue())) return
      const latest = await browser.tabs.get(tabId)
      if (latest.id == null) return
      await browser.tabs.update(latest.id, { active: true }).catch(() => {})
    } catch {
      /* tab gone */
    }
  })()
}

/** Tabs the agent opens join one shared group per window, named after the first site it touched. */
async function groupAgentTab(tabId: number): Promise<void> {
  try {
    agentOwnedTabs.add(tabId)
    const tab = await browser.tabs.get(tabId).catch(() => null)
    if (!tab || tab.windowId == null) return
    const windowId = tab.windowId
    const stored = await getAgentGroupId(windowId)
    const storedGroup = stored != null ? await browser.tabGroups.get(stored).catch(() => null) : null
    const groupId = storedGroup?.windowId === windowId ? storedGroup.id : null
    if (groupId == null) {
      const created = await browser.tabs.group({ tabIds: [tabId] }).catch(() => null)
      if (created == null) return
      await setAgentGroupId(windowId, created)
      await browser.tabGroups.update(created, { title: titleForTab(tab), color: 'blue' }).catch(() => {})
    } else {
      await browser.tabs.group({ tabIds: [tabId], groupId }).catch(() => {})
    }
  } catch {
    /* tabGroups unavailable */
  }
}

/** Drop per-window agent state when its Chrome window closes. */
export function forgetAgentWindow(windowId: number): void {
  const tabId = agentTabByWindow.get(windowId)
  if (tabId != null) agentOwnedTabs.delete(tabId)
  agentTabByWindow.delete(windowId)
  void setAgentGroupId(windowId, null)
}

export function forgetTab(tabId: number): void {
  agentOwnedTabs.delete(tabId)
  for (const [windowId, id] of agentTabByWindow) {
    if (id === tabId) agentTabByWindow.delete(windowId)
  }
}

/** Agent run finished — kill the page halo immediately. */
export async function clearAgentActivity(windowId?: number): Promise<void> {
  const windows = windowId != null ? [windowId] : Array.from(agentTabByWindow.keys())
  for (const win of windows) {
    const tabId = agentTabByWindow.get(win)
    agentTabByWindow.delete(win)
    if (tabId != null) void sendHalo(tabId, false)
  }
}

export async function resolveTab(tabId?: number, windowId?: number): Promise<Browser.tabs.Tab> {
  if (tabId != null) {
    const tab = await browser.tabs.get(tabId).catch(() => null)
    if (!tab) throw new Error(`tab ${tabId} does not exist`)
    if (windowId != null && tab.windowId !== windowId) {
      throw new Error(`tab ${tabId} is in another Chrome window; this session is scoped to window ${windowId}`)
    }
    return tab
  }
  if (windowId != null) {
    const [active] = await browser.tabs.query({ active: true, windowId })
    if (active) return active
  }
  const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true })
  if (!active) {
    const [any] = await browser.tabs.query({ active: true })
    if (!any) throw new Error('no active tab found')
    return any
  }
  return active
}

function tabInfo(tab: Browser.tabs.Tab): TabInfo {
  return {
    id: tab.id ?? -1,
    title: tab.title ?? '',
    url: tab.url ?? '',
    active: tab.active ?? false,
    windowId: tab.windowId ?? -1,
  }
}

export function formatTabList(tabs: Browser.tabs.Tab[]): string {
  if (tabs.length === 0) return '(no tabs)'
  return tabs.map((t) => `- tab ${t.id}${t.active ? ' (active)' : ''}: ${t.title ?? ''} — ${t.url ?? ''}`).join('\n')
}

async function activateTab(tab: Browser.tabs.Tab): Promise<Browser.tabs.Tab> {
  if (tab.id == null) throw new Error('tab has no id')
  if (tab.active) return tab
  await browser.tabs.update(tab.id, { active: true })
  await sleep(150)
  const fresh = await browser.tabs.get(tab.id).catch(() => null)
  if (!fresh?.active) throw new Error(`could not activate tab ${tab.id} for capture`)
  return fresh
}

/**
 * Capture the visible tab through Chrome's normal screenshot API. This does
 * not attach the debugger, so it does not show the "started debugging" bar or
 * change the page viewport. Full-page captures still use CDP and are opt-in.
 */
async function captureViewport(tab: Browser.tabs.Tab): Promise<string> {
  const fresh = await activateTab(tab)
  if (fresh.windowId == null) throw new Error('tab has no window')
  const dataUrl = await browser.tabs.captureVisibleTab(fresh.windowId, { format: 'png' })
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl)
  if (!match?.[1]) throw new Error('captureVisibleTab returned no PNG data')
  return match[1]
}

async function sendToContent<T = any>(tabId: number, op: string, params: Record<string, unknown> = {}): Promise<T> {
  const attempt = async (): Promise<T> => {
    const response = (await browser.tabs.sendMessage(tabId, { kind: 'page', op, params })) as
      | { ok: true; result: T }
      | { ok: false; error: string }
      | undefined
    if (!response) throw new Error('no response from page')
    if (!response.ok) throw new Error(response.error)
    return response.result
  }

  try {
    return await attempt()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')) {
      // tab was open before the extension loaded/updated — inject on demand, then retry once
      const injected = await ensureContentScript(tabId)
      if (injected) {
        await sleep(100)
        try {
          return await attempt()
        } catch (retryError) {
          throw friendlyContentError(tabId, retryError)
        }
      }
      throw friendlyContentError(tabId, error)
    }
    throw error
  }
}

function friendlyContentError(tabId: number, error: unknown): Error {
  const msg = error instanceof Error ? error.message : String(error)
  if (msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')) {
    return new Error(
      `the content script can't run in tab ${tabId}. ` +
        'Chrome does not allow scripting on chrome:// pages, the Chrome Web Store and PDF viewers — switch to a normal web page and retry.',
    )
  }
  return error instanceof Error ? error : new Error(msg)
}

async function waitForLoad(tabId: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const tab = await browser.tabs.get(tabId).catch(() => null)
    if (!tab) throw new Error(`tab ${tabId} disappeared`)
    if (tab.status === 'complete') return
    await sleep(250)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function composeSnapshot(tab: Browser.tabs.Tab, page: { text: string; truncated: boolean; lineCount: number }, includeConsole: boolean): string {
  const sections: string[] = []
  sections.push(`# ${tab.title || '(untitled)'}`)
  sections.push(`URL: ${tab.url ?? ''}`)
  sections.push(`Tab id: ${tab.id}`)
  if (includeConsole) {
    const entries = readConsole(tab.id ?? -1, CONSOLE_TAIL)
    if (entries.length > 0) {
      sections.push('')
      sections.push(`[console — last ${entries.length} of ${readConsole(tab.id ?? -1, 0).length} entries]`)
      sections.push(formatConsole(entries, 12000))
    } else {
      sections.push('')
      sections.push('[console is empty]')
    }
  }
  sections.push('')
  sections.push('[page snapshot]')
  sections.push(page.text || '(empty page)')
  if (page.truncated) sections.push('\n(snapshot truncated — page is very large)')
  return sections.join('\n')
}

export interface ScreenshotResult {
  base64: string
  mime: 'image/png'
  tab: TabInfo
}

export async function handleRequest(
  method: string,
  params: Record<string, any> = {},
  context: RequestContext = {},
): Promise<unknown> {
  if (method.startsWith('workflows.')) return handleWorkflowRequest(method, params)

  const tabIdParam: number | undefined = typeof params.tab_id === 'number' ? params.tab_id : undefined
  const windowId = context.windowId
  const readOnly = context.readOnly === true
  const resolve = (tabId?: number) => resolveTab(tabId, windowId)

  switch (method) {
    case 'ping':
      return 'pong'

    case 'tabs.list': {
      // A session without a window must not be shown the user's tabs.
      if (windowId == null && context.sessionID) return '(no tabs yet)'
      const tabs = await browser.tabs.query(windowId != null ? { windowId } : {})
      return formatTabList(tabs)
    }

    case 'tabs.new': {
      const url = typeof params.url === 'string' && params.url ? params.url : 'about:blank'
      if (readOnly && isScriptUrl(url)) readOnlyBlocked('opening a script URL in a new tab')
      const tab = await browser.tabs.create({
        url,
        active: params.active !== false,
        ...(windowId != null ? { windowId } : {}),
      })
      if (tab.id != null) void groupAgentTab(tab.id)
      if (tab.id != null && tab.status !== 'complete') await waitForLoad(tab.id)
      const fresh = tab.id != null ? await browser.tabs.get(tab.id).catch(() => tab) : tab
      return `opened tab ${fresh.id}: ${fresh.title ?? ''} — ${fresh.url ?? ''}`
    }

    case 'tabs.close': {
      const tab = await resolve(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      forgetTab(tab.id)
      await browser.tabs.remove(tab.id)
      return `closed tab ${tab.id}`
    }

    case 'tabs.activate': {
      const tab = await resolve(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      // Do not raise the window: activating a tab in the agent's window must
      // not pull focus away from the window the user is working in.
      await browser.tabs.update(tab.id, { active: true })
      return `activated tab ${tab.id}: ${tab.title ?? ''}`
    }

    case 'agent.reveal': {
      const sessionID = typeof params.sessionID === 'string' ? params.sessionID : context.sessionID
      const boundWindow = sessionID ? ((await windowForSession(sessionID)) ?? windowId) : windowId
      const tabId = agentTabFor(boundWindow)
      if (tabId == null) throw new Error('the agent is not working on a tab right now')
      const tab = await browser.tabs.get(tabId).catch(() => null)
      if (!tab || tab.id == null) throw new Error('the agent tab was closed')
      await browser.tabs.update(tab.id, { active: true })
      if (tab.windowId != null) await browser.windows.update(tab.windowId, { focused: true }).catch(() => {})
      return `revealed tab ${tab.id}: ${tab.title ?? ''}`
    }

    case 'tabs.group': {
      const title = String(params.title ?? '').trim()
      if (!title) throw new Error('title is required (a short, meaningful name for the group)')
      // Never fall back to the user's active tab for group naming. That would
      // move their tab into a group and change the tab-strip/page size.
      const targetTab = tabIdParam ?? agentTabFor(windowId)
      if (targetTab == null || !agentOwnedTabs.has(targetTab)) {
        throw new Error('pass the tab_id of a tab the agent opened before naming its group')
      }
      return nameAgentGroup(title.slice(0, 40), targetTab, windowId)
    }

    case 'upload': {
      if (readOnly) readOnlyBlocked('attaching local files to a page')
      const tab = await resolve(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      const paths = Array.isArray(params.paths) ? params.paths.map((p: unknown) => String(p)) : []
      if (paths.length === 0) throw new Error('paths is required (absolute file paths on this machine)')
      let selector: string
      let isFileInput = true
      if (params.selector) {
        selector = String(params.selector)
      } else {
        const info = await sendToContent<{ selector: string; isFileInput: boolean; accept: string }>(tab.id, 'selector_for', params)
        selector = info.selector
        isFileInput = info.isFileInput
      }
      if (!isFileInput) throw new Error(`target is not a file input (<input type=file>) — got ${selector}`)
      try {
        await ensureAttached(tab.id)
        const probe: any = await browser.debugger.sendCommand({ tabId: tab.id }, 'Runtime.evaluate', {
          expression: `document.querySelector(${JSON.stringify(selector)})`,
        })
        const objectId = probe?.result?.objectId
        if (!objectId) throw new Error(`file input not found for selector ${selector}`)
        await browser.debugger.sendCommand({ tabId: tab.id }, 'DOM.setFileInputFiles', { files: paths, objectId })
      } finally {
        await detachIfEphemeral(tab.id)
      }
      return `attached ${paths.length} file(s) to the file input (${selector}): ${paths.join(', ')}. The page's change event has fired; continue with the next step (e.g. click submit).`
    }

    case 'downloads.list': {
      const limit = typeof params.limit === 'number' ? Math.min(Math.max(params.limit, 1), 50) : 10
      const items = await browser.downloads.search({ limit, orderBy: ['-startTime'] })
      if (items.length === 0) return '(no downloads yet)'
      return items
        .map((d) => {
          const state = d.state === 'in_progress' ? `downloading${d.paused ? ' (paused)' : ''}` : d.state
          return `- ${state}: ${d.filename}  ← ${String(d.url ?? '').slice(0, 100)}`
        })
        .join('\n')
    }

    case 'snapshot': {
      const tab = await resolve(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      await markAgentTab(tab.id)
      const page = await sendToContent<{ text: string; truncated: boolean; lineCount: number }>(tab.id, 'snapshot')
      let iframeSection = ''
      if (params.include_iframes === true) {
        try {
          const frames = await sendToContent<Array<{ src: string; x: number; y: number; w: number; h: number }>>(tab.id, 'iframes')
          if (frames.length > 0) {
            try {
              await ensureAttached(tab.id)
              const snaps = await snapshotFrames(tab.id)
              if (snaps.length > 0) {
                const lines: string[] = [
                  '',
                  '[iframes — read via debugger; act with browser_click/type using x,y viewport coordinates]',
                ]
                let printed = 0
                snaps.forEach((frame) => {
                  const outer = frames[frame.index]
                  if (!outer || outer.w <= 0 || outer.h <= 0) return
                  printed++
                  const ox = Math.round(outer.x)
                  const oy = Math.round(outer.y)
                  const size = ` at (${ox}, ${oy}) ${Math.round(outer.w)}×${Math.round(outer.h)}`
                  lines.push(`- iframe ${frame.index}${size}: ${frame.title || frame.url}`)
                  if (frame.text) lines.push(`  text: ${frame.text.slice(0, 400)}`)
                  for (const item of frame.interactive.slice(0, 12)) {
                    lines.push(`  ${item.tag} "${item.name}" @ (${ox + item.x}, ${oy + item.y})`)
                  }
                })
                if (printed > 0) iframeSection = '\n' + lines.join('\n')
              }
            } catch {
              iframeSection = '\n\n[iframes are present but inaccessible — close DevTools on this tab or switch the console engine to debugger]'
            } finally {
              await detachIfEphemeral(tab.id)
            }
          }
        } catch {
          /* frame scan failed */
        }
      }
      return composeSnapshot(tab, page, params.include_console !== false) + iframeSection
    }

    case 'navigate': {
      const tab = await resolve(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      await markAgentTab(tab.id)
      let url = String(params.url ?? '').trim()
      if (!url) throw new Error('url is required')
      if (readOnly && !['back', 'forward', 'reload'].includes(url) && isScriptUrl(url)) {
        readOnlyBlocked('navigating to a script URL')
      }
      if (url === 'back') {
        await browser.tabs.goBack(tab.id)
      } else if (url === 'forward') {
        await browser.tabs.goForward(tab.id)
      } else if (url === 'reload') {
        await browser.tabs.reload(tab.id)
      } else {
        if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`
        await browser.tabs.update(tab.id, { url })
      }
      await waitForLoad(tab.id)
      const fresh = await browser.tabs.get(tab.id).catch(() => tab)
      return `navigated to ${fresh.title ?? ''} — ${fresh.url ?? ''}`
    }

    case 'click':
    case 'highlight':
    case 'select':
    case 'scroll':
    case 'wait_for': {
      const tab = await resolve(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      const coordinateClick = method === 'click' && typeof params.x === 'number' && typeof params.y === 'number'
      if (coordinateClick && readOnly) {
        readOnlyBlocked('coordinate clicks, because the target cannot be inspected')
      }
      await markAgentTab(tab.id)
      if (coordinateClick) {
        try {
          await clickPoint(tab.id, params.x, params.y)
        } finally {
          await detachIfEphemeral(tab.id)
        }
        return `clicked with a real mouse event at viewport (${Math.round(params.x)}, ${Math.round(params.y)}) — works inside iframes`
      }
      const contentParams = method === 'click' && readOnly ? { ...params, read_only: true } : params
      const result = await sendToContent<string>(tab.id, method, contentParams)
      return result
    }

    case 'hover': {
      const tab = await resolve(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      await markAgentTab(tab.id)
      const real = params.real === true
      if (!real && !(typeof params.x === 'number' && typeof params.y === 'number')) {
        return await sendToContent<string>(tab.id, 'hover', params)
      }
      let x: number
      let y: number
      let description = ''
      if (typeof params.x === 'number' && typeof params.y === 'number') {
        x = params.x
        y = params.y
      } else {
        const point = await sendToContent<{ x: number; y: number; description: string }>(tab.id, 'center', params)
        x = point.x
        y = point.y
        description = point.description
      }
      try {
        await hoverPoint(tab.id, x, y)
      } finally {
        await detachIfEphemeral(tab.id)
      }
      return `hovered${description ? ` ${description}` : ''} at viewport (${Math.round(x)}, ${Math.round(y)})`
    }

    case 'type': {
      const tab = await resolve(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      if (readOnly && params.submit) readOnlyBlocked('submitting a form')
      await markAgentTab(tab.id)
      if (typeof params.x === 'number' && typeof params.y === 'number') {
        const text = String(params.text ?? '')
        const clear = params.clear !== false
        try {
          await clickPoint(tab.id, params.x, params.y)
          await sleep(50)
          if (clear) await selectAllAtFocus(tab.id)
          await insertTextAtFocus(tab.id, text)
          if (params.submit) {
            await sleep(50)
            await pressKeyCdp(tab.id, 'Enter')
          }
        } finally {
          await detachIfEphemeral(tab.id)
        }
        return (
          `clicked at viewport (${Math.round(params.x)}, ${Math.round(params.y)}) and ` +
          `${clear ? 'replaced the field content with' : 'typed'} ${JSON.stringify(text.slice(0, 80))}` +
          `${params.submit ? ' then pressed Enter' : ''} — works inside iframes`
        )
      }
      return await sendToContent<string>(tab.id, method, params)
    }

    case 'press': {
      const tab = await resolve(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      const rawKey = String(params.key ?? 'Enter')
      const key = rawKey === 'Space' || rawKey === 'Spacebar' ? ' ' : rawKey
      if (readOnly && (key === 'Enter' || key === ' ')) {
        readOnlyBlocked(`pressing ${JSON.stringify(key)}, because it can submit or activate a control`)
      }
      await markAgentTab(tab.id)
      const real = params.real === true
      if (!real && !(typeof params.x === 'number' && typeof params.y === 'number')) {
        return await sendToContent<string>(tab.id, 'press', { ...params, key })
      }
      try {
        if (typeof params.x === 'number' && typeof params.y === 'number') {
          await clickPoint(tab.id, params.x, params.y)
          await sleep(50)
          await pressKeyCdp(tab.id, key)
          return `pressed "${key}" after clicking at viewport (${Math.round(params.x)}, ${Math.round(params.y)}) — works inside iframes`
        }
        let focusMessage = ''
        if (params.ref || params.selector || params.text) {
          focusMessage = ` on ${await sendToContent<string>(tab.id, 'focus', params)}`
        }
        await pressKeyCdp(tab.id, key)
        return `pressed "${key}"${focusMessage}`
      } finally {
        await detachIfEphemeral(tab.id)
      }
    }

    case 'console.read': {
      const tab = await resolve(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      let warning: string | null = null
      if ((await settings.consoleEngine.getValue()) === 'debugger' && !isAttached(tab.id)) {
        try {
          await ensureAttached(tab.id)
        } catch (error) {
          warning = `(could not attach debugger: ${error instanceof Error ? error.message : String(error)})`
        }
      }
      if (params.clear) clearConsole(tab.id)
      const entries = readConsole(tab.id, typeof params.limit === 'number' ? params.limit : 100)
      const header = warning ? `${warning}\n` : ''
      return header + formatConsole(entries)
    }

    case 'console.clear': {
      const tab = await resolve(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      clearConsole(tab.id)
      await sendToContent(tab.id, 'clear_hook').catch(() => {})
      return 'console buffer cleared'
    }

    case 'console.exec': {
      if (readOnly) readOnlyBlocked('executing JavaScript')
      const tab = await resolve(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      const expression = String(params.expression ?? '')
      if (!expression) throw new Error('expression is required')

      // Agent-supplied JavaScript is only ever executed through the Debugger
      // API (Runtime.evaluate). This is the documented MV3 exemption for
      // remote logic; never fall back to eval() in a content script.
      try {
        const result = await evaluate(tab.id, expression)
        const prefix = result.isError ? '[console error] ' : ''
        // mirror the evaluation into the console buffer so it shows up in reads
        pushConsole(tab.id, {
          level: result.isError ? 'error' : 'log',
          text: `> ${expression}\n${result.text}`.slice(0, 4000),
          ts: Date.now(),
          source: 'console',
        } satisfies ConsoleEntry)
        return prefix + result.text
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
          `console.exec failed: ${message}. Close DevTools for this tab (the debugger cannot attach while it is open) and retry.`,
        )
      } finally {
        // In the default hook engine, don't leave the debugger attached.
        await detachIfEphemeral(tab.id)
      }
    }

    case 'screenshot': {
      const tab = await resolve(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      // Automatic page context always uses the debugger-free viewport path,
      // even if an older client sends full_page:true.
      const fullPage = params.full_page === true && params.context_only !== true

      if (!fullPage) {
        try {
          const base64 = await captureViewport(tab)
          const fresh = await browser.tabs.get(tab.id).catch(() => tab)
          return { base64, mime: 'image/png', tab: tabInfo(fresh) } satisfies ScreenshotResult
        } catch (error) {
          throw new Error(
            `viewport screenshot failed: ${error instanceof Error ? error.message : String(error)}. ` +
              'Keep the tab window visible, or use full_page=true (which briefly attaches the debugger).',
          )
        }
      }

      let fresh: Browser.tabs.Tab
      try {
        fresh = await activateTab(tab)
      } catch {
        fresh = tab
      }
      if (fresh.id == null) throw new Error('tab has no id')
      try {
        const base64 = await debuggerScreenshot(fresh.id, true)
        return { base64, mime: 'image/png', tab: tabInfo(fresh) } satisfies ScreenshotResult
      } catch (error) {
        throw new Error(
          `full-page screenshot failed: ${error instanceof Error ? error.message : String(error)}. Close DevTools for this tab and retry.`,
        )
      } finally {
        await detachIfEphemeral(fresh.id)
      }
    }

    default:
      throw new Error(`unknown method: ${method}`)
  }
}
