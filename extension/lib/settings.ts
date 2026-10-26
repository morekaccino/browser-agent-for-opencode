import { storage } from 'wxt/utils/storage'
import type { BridgeStatus, OpencodeEndpoint } from './protocol'

export const PRIVACY_VERSION = 1
export const PRIVACY_URL = 'https://morekaccino.github.io/browser-agent-for-opencode/privacy.html'

export const settings = {
  /** Base port to scan for the plugin bridge. */
  bridgePort: storage.defineItem<number>('local:bridgePort', { fallback: 8767 }),
  /** Auto-paired from the plugin; only required when browser-bridge.json sets requireToken. */
  bridgeToken: storage.defineItem<string>('local:bridgeToken', { fallback: '' }),
  /** How console messages are captured. */
  consoleEngine: storage.defineItem<'hook' | 'debugger'>('local:consoleEngine', { fallback: 'hook' }),
  /**
   * opencode server URL the side panel talks to.
   * Uses `localhost`, not `127.0.0.1`: newer Chrome gates requests to IP-literal
   * loopback addresses behind the Local Network Access permission (which can stall
   * fetch() indefinitely), while `localhost` is exempt.
   */
  opencodeUrl: storage.defineItem<string>('local:opencodeUrl', {
    fallback: 'http://localhost:4096',
    version: 2,
    migrations: {
      2: (value: unknown) =>
        typeof value === 'string' ? value.replace(/^(https?:\/\/)127\.0\.0\.1/, '$1localhost') : value,
    },
  }),
  /** Basic auth credentials (OPENCODE_SERVER_USERNAME / OPENCODE_SERVER_PASSWORD). */
  opencodeUsername: storage.defineItem<string>('local:opencodeUsername', { fallback: '' }),
  opencodePassword: storage.defineItem<string>('local:opencodePassword', { fallback: '' }),
  /**
   * Prefer the local opencode service discovered by the plugin bridge.
   * When on, the bridge's welcome message overwrites URL/auth above.
   */
  opencodeAutoDiscover: storage.defineItem<boolean>('local:opencodeAutoDiscover', { fallback: true }),
  /** Last endpoint reported by the plugin bridge (also used for project directory). */
  opencodeEndpoint: storage.defineItem<(OpencodeEndpoint & { at: number }) | null>('local:opencodeEndpoint', {
    fallback: null,
  }),
  /** Version of the privacy disclosure the user accepted (0 = not yet). */
  privacyConsentVersion: storage.defineItem<number>('local:privacyConsentVersion', { fallback: 0 }),
  /** Whether the welcome/connect flow has been completed. */
  onboardingComplete: storage.defineItem<boolean>('local:onboardingComplete', { fallback: false }),
  /** Prepend a page snapshot to every prompt sent from the panel. */
  includePageContext: storage.defineItem<boolean>('local:includePageContext', { fallback: true }),
  /** Switch the user's view to whichever tab the agent is working on. */
  followAgent: storage.defineItem<boolean>('local:followAgent', { fallback: false }),
  /** Last model used in the side panel. */
  lastModel: storage.defineItem<{ providerID: string; modelID: string } | null>('local:lastModel', { fallback: null }),
  /** Last opencode agent used in the side panel (build / plan / …). */
  lastAgent: storage.defineItem<string>('local:lastAgent', { fallback: 'build' }),
  /** Chosen reasoning/context variant per model key `${providerID}/${modelID}`. */
  variantByModel: storage.defineItem<Record<string, string>>('local:variantByModel', { fallback: {} }),
  /** M3 seed color for the panel theme (and the AI halo). */
  themeSeed: storage.defineItem<string>('local:themeSeed', { fallback: '#6750A4' }),
  /** Theme mode: follow the system or force light/dark. */
  themeMode: storage.defineItem<'auto' | 'light' | 'dark'>('local:themeMode', { fallback: 'auto' }),
}

export const bridgeStatusItem = storage.defineItem<BridgeStatus>('local:bridgeStatus', {
  fallback: { state: 'disconnected' },
})

/** Chrome tab-group id per window for the "tabs the agent opened" group. */
export const agentGroupIdsItem = storage.defineItem<Record<string, number>>('session:agentGroupIds', {
  fallback: {},
})
