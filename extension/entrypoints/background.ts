import { browser } from 'wxt/browser'
import { forgetAutomationWindow } from '../lib/automation-windows'
import { ensureBridgeConnected, initBridge, restartBridge } from '../lib/bridge'
import { clearConsole, pushConsole } from '../lib/console-buffer'
import { detachAll, initDebugger, isAttached } from '../lib/debugger'
import { forgetAgentWindow, forgetTab, handleRequest } from '../lib/handlers'
import { forgetWindow } from '../lib/routing'
import { healOpenTabs } from '../lib/inject'
import type { ConsoleEntry } from '../lib/protocol'
import { settings } from '../lib/settings'
import { initWorkflowRunner } from '../lib/workflows/runner'

export default defineBackground(() => {
  initDebugger()
  initBridge()
  initWorkflowRunner()

  // Clicking the toolbar icon opens the side panel.
  try {
    void browser.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true })?.catch?.(() => {})
  } catch {
    /* older Chrome */
  }

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    const msg = message as {
      kind?: string
      method?: string
      params?: Record<string, unknown>
      windowId?: number
      entry?: ConsoleEntry
    }
    if (!msg || typeof msg !== 'object') return undefined

    // console entries relayed from content scripts (hook mode)
    if (msg.kind === 'console') {
      const tabId = sender.tab?.id
      if (tabId != null && msg.entry && !isAttached(tabId)) {
        pushConsole(tabId, msg.entry)
      }
      return undefined
    }

    // internal calls from the side panel (single module state lives here in the SW)
    if (msg.kind === 'internal' && typeof msg.method === 'string') {
      if (msg.method === 'bridge.reconnect') {
        restartBridge()
        sendResponse({ ok: true, result: 'reconnecting' })
        return undefined
      }
      const context = typeof msg.windowId === 'number' ? { windowId: msg.windowId } : {}
      handleRequest(msg.method, msg.params ?? {}, context).then(
        (result) => sendResponse({ ok: true, result }),
        (error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      )
      return true
    }

    return undefined
  })

  browser.tabs.onRemoved.addListener((tabId) => {
    clearConsole(tabId)
    forgetTab(tabId)
  })

  browser.windows.onRemoved.addListener((windowId) => {
    forgetAgentWindow(windowId)
    void forgetAutomationWindow(windowId)
    void forgetWindow(windowId)
  })

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') clearConsole(tabId)
  })

  settings.consoleEngine.watch((engine) => {
    if (engine === 'hook') void detachAll()
  })

  // Keep retrying the bridge connection even after the service worker was suspended
  // (e.g. Chrome opened long before the opencode plugin started listening).
  browser.alarms.create('bridge-tick', { periodInMinutes: 0.5 }).catch(() => {})
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'bridge-tick') ensureBridgeConnected()
  })

  // Tabs open before an install/update never get content scripts back-filled by Chrome —
  // inject them so the agent can act immediately without reloading tabs.
  browser.runtime.onInstalled.addListener(() => {
    void healOpenTabs()
  })
})
