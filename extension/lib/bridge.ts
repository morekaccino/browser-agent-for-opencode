import { browser } from 'wxt/browser'
import { clearAgentActivity, handleRequest } from './handlers'
import type { BridgeStatus, InboundMessage, OpencodeEndpoint } from './protocol'
import { bridgeStatusItem, settings } from './settings'
import { notifyAgentIdle } from './workflows/runner'

const PORT_ATTEMPTS = 10
const PING_INTERVAL = 20000
const BACKOFF = [1000, 2000, 5000, 10000]
const HOSTS = ['localhost', '127.0.0.1']

let socket: WebSocket | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let attempt = 0
let portOffset = 0
let hostIndex = 0
let stopped = true
let connecting = false
let generation = 0
let lastMessageAt = 0
let applyingToken = false

async function setStatus(status: BridgeStatus): Promise<void> {
  await bridgeStatusItem.setValue(status).catch(() => {})
}

export async function startBridge(): Promise<void> {
  if (!stopped) return
  stopped = false
  try {
    await connect()
  } catch {
    /* retries are scheduled internally */
  }
}

export function stopBridge(): void {
  stopped = true
  generation++
  if (pingTimer) clearInterval(pingTimer)
  pingTimer = null
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  try {
    socket?.close()
  } catch {
    /* ignore */
  }
  socket = null
}

async function connect(): Promise<void> {
  if (stopped || connecting || socket) return
  connecting = true
  const gen = generation
  let retry = true
  try {
    const basePort = await settings.bridgePort.getValue()
    const token = await settings.bridgeToken.getValue()
    if (gen !== generation || stopped) return
    const port = basePort + portOffset
    const host = HOSTS[hostIndex % HOSTS.length]!
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      retry = false
      await setStatus({ state: 'error', detail: `invalid bridge port: ${port}` })
      return
    }
    await setStatus({ state: 'connecting', port, detail: `connecting to ws://${host}:${port}` })
    if (gen !== generation || stopped) return

    let ws: WebSocket
    try {
      ws = new WebSocket(`ws://${host}:${port}`)
    } catch (error) {
      await setStatus({
        state: 'error',
        detail: `could not open the bridge socket: ${error instanceof Error ? error.message : String(error)}`,
      })
      return
    }
    socket = ws

    const opened = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 4000)
      ws.onopen = () => {
        clearTimeout(timer)
        resolve(true)
      }
      ws.onerror = () => {
        clearTimeout(timer)
        resolve(false)
      }
      ws.onclose = () => {
        clearTimeout(timer)
        resolve(false)
      }
    })

    if (gen !== generation || stopped) {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      if (socket === ws) socket = null
      return
    }

    if (!opened) {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      if (socket === ws) socket = null
      await setStatus({ state: 'disconnected', detail: 'could not reach the plugin bridge' })
      hostIndex++
      scheduleReconnect()
      return
    }

    ws.onmessage = (event) => {
      if (gen !== generation) return
      lastMessageAt = Date.now()
      void onMessage(String(event.data))
    }

    ws.onclose = () => {
      if (gen !== generation) return
      if (socket === ws) socket = null
      if (pingTimer) clearInterval(pingTimer)
      pingTimer = null
      if (!stopped) {
        void setStatus({ state: 'disconnected', detail: 'bridge connection closed' })
        scheduleReconnect()
      }
    }

    ws.onerror = () => {
      /* onclose will follow */
    }

    ws.send(
      JSON.stringify({
        type: 'hello',
        role: 'extension',
        token,
        version: browser.runtime.getManifest().version,
        extensionId: browser.runtime.id,
      }),
    )
    lastMessageAt = Date.now()

    pingTimer = setInterval(() => {
      if (!socket) return
      if (Date.now() - lastMessageAt > 60_000) {
        // half-dead socket: no pong/request for a minute — force a clean reconnect
        try {
          socket.close()
        } catch {
          /* ignore */
        }
        return
      }
      try {
        socket.send(JSON.stringify({ type: 'ping' }))
      } catch {
        /* ignore */
      }
    }, PING_INTERVAL)
  } catch (error) {
    await setStatus({
      state: 'error',
      detail: error instanceof Error ? error.message : String(error),
    }).catch(() => {})
  } finally {
    connecting = false
    if (!stopped && !socket) {
      if (gen !== generation) {
        // A restart was requested while this attempt was in flight.
        void connect()
      } else if (retry && !reconnectTimer) {
        scheduleReconnect()
      }
    }
  }
}

function scheduleReconnect(resetPort = false): void {
  if (stopped || reconnectTimer) return
  portOffset = resetPort ? 0 : (portOffset + 1) % PORT_ATTEMPTS
  const delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)]
  attempt++
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (stopped) return
    void connect()
  }, delay)
}

function normalizeLoopback(url: string): string {
  return url.replace(/^(https?:\/\/)127\.0\.0\.1(?=[:/]|$)/, '$1localhost').replace(/\/$/, '')
}

/** Store the discovered service and (in auto mode) point the panel at it. */
async function applyOpencodeEndpoint(endpoint: OpencodeEndpoint): Promise<void> {
  const normalized: OpencodeEndpoint & { at: number } = {
    ...endpoint,
    url: normalizeLoopback(endpoint.url),
    at: Date.now(),
  }
  await settings.opencodeEndpoint.setValue(normalized).catch(() => {})
  if (!(await settings.opencodeAutoDiscover.getValue().catch(() => true))) return
  await Promise.all([
    settings.opencodeUrl.setValue(normalized.url).catch(() => {}),
    settings.opencodeUsername.setValue(normalized.username || '').catch(() => {}),
    settings.opencodePassword.setValue(normalized.password || '').catch(() => {}),
  ])
}

async function syncPairedToken(token: string | undefined): Promise<void> {
  if (!token) return
  const current = await settings.bridgeToken.getValue().catch(() => '')
  if (current === token) return
  applyingToken = true
  try {
    await settings.bridgeToken.setValue(token)
  } catch {
    /* storage unavailable */
  } finally {
    applyingToken = false
  }
}

async function onMessage(raw: string): Promise<void> {
  let msg: InboundMessage
  try {
    msg = JSON.parse(raw) as InboundMessage
  } catch {
    return
  }

  switch (msg.type) {
    case 'welcome': {
      attempt = 0
      portOffset = 0
      hostIndex = 0
      const port = socket ? portFromSocket(socket) : undefined
      const discovered = msg.opencode ? ` · opencode ${msg.opencode.version ?? 'local'}` : ''
      await syncPairedToken(msg.token)
      await setStatus({ state: 'connected', port, detail: msg.server + discovered })
      if (msg.opencode) void applyOpencodeEndpoint(msg.opencode)
      break
    }
    case 'opencode-endpoint': {
      void applyOpencodeEndpoint(msg.opencode)
      break
    }
    case 'error': {
      await setStatus({ state: 'error', detail: msg.message })
      if (/invalid bridge token/i.test(msg.message)) {
        // The plugin token changed; drop ours and retry so the bridge can
        // auto-pair again (unless the plugin requires a token).
        applyingToken = true
        await settings.bridgeToken.setValue('').catch(() => {})
        applyingToken = false
      }
      try {
        socket?.close()
      } catch {
        /* ignore */
      }
      socket = null
      // A token/version rejection will repeat on every port — retry the base port.
      scheduleReconnect(true)
      break
    }
    case 'request': {
      void handleIncomingRequest(msg.id, msg.method, msg.params ?? {})
      break
    }
    case 'agent-state': {
      if (msg.state === 'idle') {
        void clearAgentActivity()
        notifyAgentIdle(msg.sessionID)
      }
      break
    }
    case 'pong':
      break
  }
}

async function handleIncomingRequest(id: string, method: string, params: Record<string, unknown>): Promise<void> {
  try {
    const result = await handleRequest(method, params)
    send({ type: 'response', id, ok: true, result })
  } catch (error) {
    send({ type: 'response', id, ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

function send(message: unknown): void {
  try {
    socket?.send(JSON.stringify(message))
  } catch {
    /* ignore */
  }
}

function portFromSocket(ws: WebSocket): number | undefined {
  const match = /:(\d+)$/.exec(ws.url)
  return match ? Number(match[1]) : undefined
}

export function restartBridge(): void {
  stopBridge()
  stopped = false
  portOffset = 0
  hostIndex = 0
  attempt = 0
  void connect()
}

/** Called by the periodic alarm — keeps retrying even after the SW was suspended. */
export function ensureBridgeConnected(): void {
  if (stopped) {
    stopped = false
    portOffset = 0
    hostIndex = 0
    attempt = 0
  }
  if (!socket && !connecting) {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    void connect()
  }
}

export function initBridge(): void {
  settings.bridgePort.watch(() => restartBridge())
  settings.bridgeToken.watch(() => {
    if (!applyingToken) restartBridge()
  })
  settings.opencodeAutoDiscover.watch((enabled) => {
    if (!enabled) return
    void settings.opencodeEndpoint.getValue().then((endpoint) => {
      if (endpoint) void applyOpencodeEndpoint(endpoint)
    })
  })
  void startBridge()
}
