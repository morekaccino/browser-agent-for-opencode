/**
 * Wire protocol between the Chrome extension and this plugin bridge.
 * Keep in sync with extension/lib/protocol.ts.
 */

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'clear'

export interface ConsoleEntry {
  level: ConsoleLevel
  text: string
  ts: number
  source?: 'console' | 'exception' | 'browser'
  url?: string
  line?: number
}

export interface TabInfo {
  id: number
  title: string
  url: string
  active: boolean
  windowId: number
}

export interface HelloMessage {
  type: 'hello'
  role: 'extension' | 'producer'
  token: string
  version: string
  /** chrome.runtime.id; lets the bridge remember this specific extension. */
  extensionId?: string
}

/** Local opencode service info discovered by the plugin from service.json. */
export interface OpencodeEndpoint {
  url: string
  username: string
  password: string
  version?: string
  directory?: string
}

export interface WelcomeMessage {
  type: 'welcome'
  server: string
  relay?: boolean
  /** Present for extension connections; lets the panel auto-pair without pasting a token. */
  token?: string
  opencode?: OpencodeEndpoint
}

/** Sent when the opencode service URL/password appears or changes. */
export interface OpencodeEndpointMessage {
  type: 'opencode-endpoint'
  opencode: OpencodeEndpoint
}

export interface ErrorMessage {
  type: 'error'
  message: string
}

export interface PingMessage {
  type: 'ping'
}

export interface PongMessage {
  type: 'pong'
}

export interface RequestMessage {
  type: 'request'
  id: string
  method: string
  params?: Record<string, unknown>
}

export interface ResponseMessage {
  type: 'response'
  id: string
  ok: boolean
  result?: unknown
  error?: string
}

export interface ScreenshotResult {
  base64: string
  mime: 'image/png'
  tab: TabInfo
}

/** Sent to the extension when an agent run stops using the browser. */
export interface AgentStateMessage {
  type: 'agent-state'
  state: 'idle' | 'busy'
  sessionID?: string
}
