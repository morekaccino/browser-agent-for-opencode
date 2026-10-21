import { browser } from 'wxt/browser'

/** Content script files derived from the manifest, split by world. */
function scriptFiles(): { isolated: string[]; mainWorld: string[] } {
  const scripts = browser.runtime.getManifest().content_scripts ?? []
  const isolated: string[] = []
  const mainWorld: string[] = []
  for (const entry of scripts) {
    const files = entry.js ?? []
    if ((entry as { world?: string }).world === 'MAIN') mainWorld.push(...files)
    else isolated.push(...files)
  }
  return { isolated, mainWorld }
}

/**
 * Inject our content scripts into a tab that doesn't have them (tabs that were
 * open before the extension loaded/updated are never back-filled by Chrome).
 * Safe to call repeatedly: both scripts guard against double installation.
 */
export async function ensureContentScript(tabId: number): Promise<boolean> {
  const { isolated, mainWorld } = scriptFiles()
  try {
    if (mainWorld.length > 0) {
      await (browser.scripting.executeScript as any)({ target: { tabId }, world: 'MAIN', files: mainWorld })
    }
    if (isolated.length > 0) {
      await (browser.scripting.executeScript as any)({ target: { tabId }, files: isolated })
    }
    return true
  } catch {
    return false
  }
}

/** Inject into every open http(s)/file tab — used right after an install/update. */
export async function healOpenTabs(): Promise<void> {
  const tabs = await browser.tabs.query({})
  for (const tab of tabs) {
    if (tab.id == null || !tab.url || tab.discarded) continue
    if (!/^(https?|file):/i.test(tab.url)) continue
    await ensureContentScript(tab.id)
  }
}
