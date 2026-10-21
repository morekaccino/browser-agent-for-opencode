import { browser } from 'wxt/browser'
import type { ConsoleEntry, TabInfo } from './protocol'
import { clearConsole, formatConsole, pushConsole, readConsole } from './console-buffer'
import {
  clickPoint,
  detachIfEphemeral,
  ensureAttached,
  evaluate,
  insertTextAtFocus,
  isAttached,
  pressKeyCdp,
  screenshot as debuggerScreenshot,
  snapshotFrames,
} from './debugger'
import { ensureContentScript } from './inject'
import { agentGroupIdItem, settings } from './settings'
import { haloCloudColors, resolveMode } from './theme'
import { handleWorkflowRequest } from './workflows/api'

const CONSOLE_TAIL = 25

let agentTabId: number | null = null
const agentOwnedTabs = new Set<number>()
let highlight: { kind: 'opencode' | 'temp'; groupId: number; tabId: number } | null = null

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

async function cleanupHighlight(): Promise<void> {
  const current = highlight
  highlight = null
  if (!current) return
  try {
    if (current.kind === 'temp') {
      await browser.tabs.ungroup([current.tabId])
    } else {
      await browser.tabGroups.update(current.groupId, { color: 'blue' }).catch(() => {})
    }
  } catch {
    /* tab or group already gone */
  }
}

/** Give the working tab a visible tab-bar treatment (via its tab group). */
async function applyHighlight(tabId: number): Promise<void> {
  try {
    const tab = await browser.tabs.get(tabId)
    if (tab.id == null) return
    const none = browser.tabGroups.TAB_GROUP_ID_NONE
    if (tab.groupId != null && tab.groupId !== none) {
      const group = await browser.tabGroups.get(tab.groupId).catch(() => null)
      const ours = group ? (await agentGroupIdItem.getValue()) === group.id : false
      if (ours) {
        await browser.tabGroups.update(tab.groupId, { color: 'orange' }).catch(() => {})
        highlight = { kind: 'opencode', groupId: tab.groupId, tabId }
      }
      return // user's own group — don't touch it
    }
    const groupId = await browser.tabs.group({ tabIds: [tabId] })
    if (groupId == null) return
    await browser.tabGroups.update(groupId, { title: `${titleForTab(tab)} · working`, color: 'orange' }).catch(() => {})
    highlight = { kind: 'temp', groupId, tabId }
  } catch {
    /* tab groups unavailable — page halo still applies */
  }
}

/** Rename (and possibly re-group) the agent's tabs — the agent names it after the task. */
async function nameAgentGroup(title: string, tabIdParam?: number): Promise<string> {
  const tab = await resolveTab(tabIdParam ?? agentTabId ?? undefined)
  if (tab.id == null) throw new Error('tab has no id')
  const none = browser.tabGroups.TAB_GROUP_ID_NONE
  let groupId: number | null = null
  if (tab.groupId != null && tab.groupId !== none) {
    groupId = tab.groupId
  } else {
    const stored = await agentGroupIdItem.getValue()
    groupId = stored != null ? ((await browser.tabGroups.get(stored).catch(() => null))?.id ?? null) : null
    if (groupId == null) {
      groupId = await browser.tabs.group({ tabIds: [tab.id] }).catch(() => null)
      if (groupId == null) throw new Error('could not create a tab group')
      await agentGroupIdItem.setValue(groupId)
    } else {
      await browser.tabs.group({ tabIds: [tab.id], groupId }).catch(() => {})
    }
  }
  await browser.tabGroups.update(groupId, { title })
  return `tab group ${groupId} named "${title}"`
}

/** Light the halo (page + tab bar) on the tab the agent is working on; at most one at a time. */
async function markAgentTab(tabId: number): Promise<void> {
  const previous = agentTabId
  agentTabId = tabId
  void sendHalo(tabId, true)
  if (previous != null && previous !== tabId) void sendHalo(previous, false)

  if (previous !== tabId) {
    void (async () => {
      if (highlight && highlight.tabId !== tabId) await cleanupHighlight()
      if (!highlight || highlight.tabId !== tabId) await applyHighlight(tabId)
    })()
  }

  // "follow the AI": switch the user's view to the working tab (opt-in).
  // Deliberately no window focus change — never steal focus from other windows/apps.
  void (async () => {
    try {
      if (!(await settings.followAgent.getValue())) return
      const tab = await browser.tabs.get(tabId)
      if (tab.id == null) return
      await browser.tabs.update(tab.id, { active: true }).catch(() => {})
    } catch {
      /* tab gone */
    }
  })()
}

/** Tabs the agent opens join one shared group, named after the first site it touched. */
async function groupAgentTab(tabId: number): Promise<void> {
  try {
    agentOwnedTabs.add(tabId)
    const stored = await agentGroupIdItem.getValue()
    let groupId = stored != null ? ((await browser.tabGroups.get(stored).catch(() => null))?.id ?? null) : null
    if (groupId == null) {
      const created = await browser.tabs.group({ tabIds: [tabId] }).catch(() => null)
      if (created == null) return
      groupId = created
      await agentGroupIdItem.setValue(groupId)
      const tab = await browser.tabs.get(tabId).catch(() => null)
      await browser.tabGroups.update(groupId, { title: tab ? titleForTab(tab) : 'ai tabs', color: 'blue' }).catch(() => {})
    } else {
      await browser.tabs.group({ tabIds: [tabId], groupId }).catch(() => {})
    }
  } catch {
    /* tabGroups unavailable */
  }
}

export function forgetTab(tabId: number): void {
  agentOwnedTabs.delete(tabId)
  if (agentTabId === tabId) agentTabId = null
  if (highlight?.tabId === tabId) {
    const current = highlight
    highlight = null
    void (async () => {
      try {
        if (current.kind === 'opencode') await browser.tabGroups.update(current.groupId, { color: 'blue' }).catch(() => {})
      } catch {
        /* group already gone */
      }
    })()
  }
}

/** Agent run finished — kill the halo and tab-bar highlight immediately. */
export async function clearAgentActivity(): Promise<void> {
  const tabId = agentTabId
  agentTabId = null
  if (tabId != null) void sendHalo(tabId, false)
  await cleanupHighlight()
}

export async function resolveTab(tabId?: number): Promise<Browser.tabs.Tab> {
  if (tabId != null) {
    try {
      return await browser.tabs.get(tabId)
    } catch {
      throw new Error(`tab ${tabId} does not exist`)
    }
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

export async function handleRequest(method: string, params: Record<string, any> = {}): Promise<unknown> {
  if (method.startsWith('workflows.')) return handleWorkflowRequest(method, params)

  const tabIdParam: number | undefined = typeof params.tab_id === 'number' ? params.tab_id : undefined

  switch (method) {
    case 'ping':
      return 'pong'

    case 'tabs.list': {
      const tabs = await browser.tabs.query({})
      return formatTabList(tabs)
    }

    case 'tabs.new': {
      const tab = await browser.tabs.create({
        url: typeof params.url === 'string' && params.url ? params.url : 'about:blank',
        active: params.active !== false,
      })
      if (tab.id != null) void groupAgentTab(tab.id)
      if (tab.id != null && tab.status !== 'complete') await waitForLoad(tab.id)
      const fresh = tab.id != null ? await browser.tabs.get(tab.id).catch(() => tab) : tab
      return `opened tab ${fresh.id}: ${fresh.title ?? ''} — ${fresh.url ?? ''}`
    }

    case 'tabs.close': {
      const tab = await resolveTab(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      forgetTab(tab.id)
      await browser.tabs.remove(tab.id)
      return `closed tab ${tab.id}`
    }

    case 'tabs.activate': {
      const tab = await resolveTab(tabIdParam)
      if (tab.id == null || tab.windowId == null) throw new Error('tab has no id')
      await browser.tabs.update(tab.id, { active: true })
      await browser.windows.update(tab.windowId, { focused: true }).catch(() => {})
      return `activated tab ${tab.id}: ${tab.title ?? ''}`
    }

    case 'agent.reveal': {
      if (agentTabId == null) throw new Error('the agent is not working on a tab right now')
      const tab = await browser.tabs.get(agentTabId).catch(() => null)
      if (!tab || tab.id == null) throw new Error('the agent tab was closed')
      await browser.tabs.update(tab.id, { active: true })
      if (tab.windowId != null) await browser.windows.update(tab.windowId, { focused: true }).catch(() => {})
      return `revealed tab ${tab.id}: ${tab.title ?? ''}`
    }

    case 'tabs.group': {
      const title = String(params.title ?? '').trim()
      if (!title) throw new Error('title is required (a short, meaningful name for the group)')
      return nameAgentGroup(title.slice(0, 40), tabIdParam)
    }

    case 'upload': {
      const tab = await resolveTab(tabIdParam)
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
      const tab = await resolveTab(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      await markAgentTab(tab.id)
      const page = await sendToContent<{ text: string; truncated: boolean; lineCount: number }>(tab.id, 'snapshot')
      let iframeSection = ''
      if (params.include_iframes !== false) {
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
      const tab = await resolveTab(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      await markAgentTab(tab.id)
      let url = String(params.url ?? '').trim()
      if (!url) throw new Error('url is required')
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
    case 'hover':
    case 'highlight':
    case 'select':
    case 'scroll':
    case 'wait_for': {
      const tab = await resolveTab(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      await markAgentTab(tab.id)
      if (method === 'click' && typeof params.x === 'number' && typeof params.y === 'number') {
        try {
          await clickPoint(tab.id, params.x, params.y)
        } finally {
          await detachIfEphemeral(tab.id)
        }
        return `clicked with a real mouse event at viewport (${Math.round(params.x)}, ${Math.round(params.y)}) — works inside iframes`
      }
      const result = await sendToContent<string>(tab.id, method, params)
      return result
    }

    case 'type': {
      const tab = await resolveTab(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      await markAgentTab(tab.id)
      if (typeof params.x === 'number' && typeof params.y === 'number') {
        try {
          await clickPoint(tab.id, params.x, params.y)
          await insertTextAtFocus(tab.id, String(params.text ?? ''))
        } finally {
          await detachIfEphemeral(tab.id)
        }
        return `clicked at viewport (${Math.round(params.x)}, ${Math.round(params.y)}) and typed ${JSON.stringify(String(params.text ?? '').slice(0, 80))} — works inside iframes`
      }
      return await sendToContent<string>(tab.id, method, params)
    }

    case 'press': {
      const tab = await resolveTab(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      await markAgentTab(tab.id)
      if (typeof params.x === 'number' && typeof params.y === 'number') {
        try {
          await clickPoint(tab.id, params.x, params.y)
          await pressKeyCdp(tab.id, String(params.key ?? 'Enter'))
        } finally {
          await detachIfEphemeral(tab.id)
        }
        return `pressed "${String(params.key ?? 'Enter')}" after clicking at viewport (${Math.round(params.x)}, ${Math.round(params.y)}) — works inside iframes`
      }
      return await sendToContent<string>(tab.id, method, params)
    }

    case 'console.read': {
      const tab = await resolveTab(tabIdParam)
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
      const tab = await resolveTab(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      clearConsole(tab.id)
      await sendToContent(tab.id, 'clear_hook').catch(() => {})
      return 'console buffer cleared'
    }

    case 'console.exec': {
      const tab = await resolveTab(tabIdParam)
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
      const tab = await resolveTab(tabIdParam)
      if (tab.id == null) throw new Error('tab has no id')
      const fullPage = params.full_page === true

      // Bring a background tab forward if necessary, but never change the
      // browser window state. Calling windows.update(state: 'normal') would
      // unmaximize/resize the user's window every time page context is sent.
      try {
        if (!tab.active) {
          await browser.tabs.update(tab.id, { active: true })
          await sleep(150)
        }
      } catch {
        /* focusing is best effort */
      }

      // Use the debugger for every screenshot. tabs.captureVisibleTab and
      // clip-based CDP captures can hang on Windows when the window is not
      // focused or under automation; a full-page capture + canvas crop is
      // reliable in those cases.
      try {
        const base64 = await debuggerScreenshot(tab.id, fullPage)
        return { base64, mime: 'image/png', tab: tabInfo(tab) } satisfies ScreenshotResult
      } catch (error) {
        throw new Error(
          `screenshot failed: ${error instanceof Error ? error.message : String(error)}. Close DevTools for this tab and retry.`,
        )
      } finally {
        await detachIfEphemeral(tab.id)
      }
    }

    default:
      throw new Error(`unknown method: ${method}`)
  }
}
