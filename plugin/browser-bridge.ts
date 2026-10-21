// @ts-nocheck
/**
 * opencode V2 browser bridge plugin.
 *
 * Runs inside the opencode server process. The first instance binds a
 * WebSocket server on 127.0.0.1 (8767+); the Chrome extension connects to it.
 * Other opencode instances fall back to connecting as "producers" through the
 * same server so their browser_* tools keep working too.
 *
 * Registers custom tools through ctx.tool.transform (V2 plugin API) and
 * forwards session.idle events so the extension can clear the page halo.
 */
import { randomUUID } from "node:crypto"
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

const BASE_PORT = 8767
const DEFAULT_TIMEOUT = 120_000

interface PendingEntry {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  cleanup?: () => void
}

interface ProxyEntry {
  producer: any
  originalId: string
  timer: ReturnType<typeof setTimeout>
}

const state = {
  server: null as any,
  extension: null as any,
  extensions: new Set<any>(),
  producerSocket: null as any,
  producerConnecting: false,
  producers: new Set<any>(),
  pending: new Map<string, PendingEntry>(),
  proxy: new Map<string, ProxyEntry>(),
  boundPort: BASE_PORT,
  token: "",
  requireToken: false,
  /** Extension IDs allowed to auto-pair without a token. First pair is remembered. */
  allowedExtensionIds: new Set<string>(),
  activeSessions: new Set<string>(),
}

function configDir(): string {
  return process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, "opencode")
    : join(homedir(), ".config", "opencode")
}

function stateDir(): string {
  return process.env.XDG_STATE_HOME
    ? join(process.env.XDG_STATE_HOME, "opencode")
    : join(homedir(), ".local", "state", "opencode")
}

const CONFIG_PATH = join(configDir(), "browser-bridge.json")

function loadConfig(): { token: string; port?: number; requireToken: boolean } {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8"))
    if (typeof parsed?.token === "string" && parsed.token) {
      state.requireToken = parsed.requireToken === true
      state.allowedExtensionIds = new Set(
        Array.isArray(parsed.allowedExtensionIds)
          ? parsed.allowedExtensionIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
          : [],
      )
      return {
        token: parsed.token,
        port: typeof parsed.port === "number" ? parsed.port : undefined,
        requireToken: state.requireToken,
      }
    }
  } catch {
    /* missing or invalid */
  }
  state.requireToken = false
  state.allowedExtensionIds = new Set()
  const token = randomUUID()
  saveConfig(token, undefined)
  return { token, requireToken: false }
}

function saveConfig(token: string, port: number | undefined): void {
  try {
    mkdirSync(configDir(), { recursive: true })
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify(
        {
          token,
          port: port ?? null,
          requireToken: state.requireToken,
          allowedExtensionIds: Array.from(state.allowedExtensionIds),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    )
    if (process.platform !== "win32") chmodSync(CONFIG_PATH, 0o600)
  } catch {
    /* best effort */
  }
}

/** The extension uses this to auto-configure its opencode server URL/auth. */
function readServiceInfo(ctx: any): Record<string, unknown> | null {
  try {
    const info = JSON.parse(readFileSync(join(stateDir(), "service.json"), "utf8"))
    if (typeof info?.url !== "string" || info.pid !== process.pid) return null
    const password = typeof info.password === "string" ? info.password : ""
    return {
      url: info.url,
      username: password ? "opencode" : "",
      password,
      version: typeof info.version === "string" ? info.version : undefined,
      directory: ctx?.location?.directory,
    }
  } catch {
    return null
  }
}

function ok(message: string): { content: string } {
  return { content: message }
}

async function bridgeCall(
  method: string,
  params: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT,
  signal?: AbortSignal,
): Promise<unknown> {
  if (state.extension) {
    return sendOverSocket(state.extension, method, params, timeoutMs, signal)
  }
  if (state.producerSocket) {
    return sendOverSocket(state.producerSocket, method, params, timeoutMs, signal)
  }
  throw new Error(
    "Browser extension is not connected.\n" +
      "1. Open Chrome with the 'opencode browser agent' extension loaded.\n" +
      "2. Make sure the bridge port and token in the extension settings match " +
      CONFIG_PATH +
      ".\n3. Click 'reconnect bridge' in the extension side panel.",
  )
}

function sendOverSocket(
  socket: any,
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const id = `req_${randomUUID()}`
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(`browser request aborted (method: ${method})`))
      return
    }
    const onAbort = () => {
      const entry = state.pending.get(id)
      if (!entry) return
      state.pending.delete(id)
      clearTimeout(entry.timer)
      entry.cleanup?.()
      reject(new Error(`browser request aborted (method: ${method})`))
    }
    const cleanup = () => signal?.removeEventListener("abort", onAbort)
    const timer = setTimeout(() => {
      state.pending.delete(id)
      cleanup()
      reject(new Error(`browser bridge timed out after ${timeoutMs}ms (method: ${method})`))
    }, timeoutMs)
    state.pending.set(id, { resolve, reject, timer, cleanup })
    signal?.addEventListener("abort", onAbort, { once: true })
    try {
      socket.send(JSON.stringify({ type: "request", id, method, params }))
    } catch (error) {
      clearTimeout(timer)
      state.pending.delete(id)
      cleanup()
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

function settle(id: string, okFlag: boolean, result: unknown, error: string | undefined): void {
  const entry = state.pending.get(id)
  if (entry) {
    state.pending.delete(id)
    clearTimeout(entry.timer)
    entry.cleanup?.()
    if (okFlag) entry.resolve(result)
    else entry.reject(new Error(error || "request failed"))
    return
  }
  const proxied = state.proxy.get(id)
  if (proxied) {
    state.proxy.delete(id)
    clearTimeout(proxied.timer)
    try {
      proxied.producer.send(JSON.stringify({ type: "response", id: proxied.originalId, ok: okFlag, result, error }))
    } catch {
      /* producer gone */
    }
  }
}

function handleExtensionRequestForwarding(socket: any, raw: string): void {
  let msg: any
  try {
    msg = JSON.parse(raw)
  } catch {
    return
  }
  if (msg?.type !== "request") return
  if (!state.extension) {
    try {
      socket.send(
        JSON.stringify({
          type: "response",
          id: msg.id,
          ok: false,
          error: "Browser extension is not connected (no extension connected to the bridge on this machine).",
        }),
      )
    } catch {}
    return
  }
  const forwardedId = `fwd_${randomUUID()}`
  const timer = setTimeout(() => {
    state.proxy.delete(forwardedId)
    try {
      socket.send(JSON.stringify({ type: "response", id: msg.id, ok: false, error: "timed out" }))
    } catch {}
  }, DEFAULT_TIMEOUT)
  state.proxy.set(forwardedId, { producer: socket, originalId: msg.id, timer })
  try {
    state.extension.send(JSON.stringify({ type: "request", id: forwardedId, method: msg.method, params: msg.params ?? {} }))
  } catch {
    state.proxy.delete(forwardedId)
    clearTimeout(timer)
    socket.send(JSON.stringify({ type: "response", id: msg.id, ok: false, error: "extension write failed" }))
  }
}

function startServer(token: string, port: number = BASE_PORT, infoFn?: () => Record<string, unknown> | null): any {
  if (typeof Bun === "undefined") {
    console.error("[browser-bridge] Bun.serve is unavailable — the browser bridge needs the opencode CLI (Bun) runtime")
    return null
  }
  // Exactly one bridge owner exists per machine, always on the configured port.
  // Every other opencode instance/process/project relays through it as a
  // producer, so the extension always has a single socket and every session's
  // tools can reach it.
  try {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch(req: Request, srv: any) {
        if (srv.upgrade(req, { data: { authed: false, role: null, origin: req.headers.get("origin") } })) {
          return undefined
        }
        return new Response("opencode browser bridge")
      },
      websocket: {
        open(ws: any) {
          ws.data = ws.data || { authed: false, role: null }
        },
        message(ws: any, raw: any) {
          const text = typeof raw === "string" ? raw : raw.toString()
          let msg: any
          try {
            msg = JSON.parse(text)
          } catch {
            return
          }
          if (!ws.data?.authed) {
            if (msg?.type === "hello" && typeof msg.token === "string") {
              const role = msg.role === "producer" ? "producer" : "extension"
              const origin = String(ws.data?.origin || "")
              const originExtensionId = origin.startsWith("chrome-extension://")
                ? origin.slice("chrome-extension://".length).split("/")[0]
                : ""
              const claimedExtensionId =
                typeof msg.extensionId === "string" ? msg.extensionId.trim() : ""
              const extensionId = originExtensionId || claimedExtensionId
              const hasExtensionOrigin = origin.startsWith("chrome-extension://")
              const tokenMatches = !state.token || msg.token === state.token
              const idAllowed =
                !state.allowedExtensionIds.size || state.allowedExtensionIds.has(extensionId)
              // Tokenless auto-pair is limited to a real chrome-extension://
              // origin and, when the list is non-empty, a remembered extension
              // ID. Producers always need the token.
              const autoPair =
                role === "extension" &&
                !state.requireToken &&
                hasExtensionOrigin &&
                !!extensionId &&
                idAllowed
              const valid = tokenMatches || autoPair
              console.error(
                `[browser-bridge] hello role=${role} id=${extensionId || "-"} ` +
                  `token=${tokenMatches ? "ok" : autoPair ? "auto-pair" : "MISMATCH"}`,
              )
              if (!valid) {
                const message =
                  role === "extension" && extensionId && !idAllowed
                    ? "This extension is not paired with the local bridge. Remove its ID from allowedExtensionIds in browser-bridge.json, restart opencode, and reconnect."
                    : "invalid bridge token"
                ws.send(JSON.stringify({ type: "error", message }))
                ws.close()
                return
              }
              if (role === "extension" && extensionId && !state.allowedExtensionIds.has(extensionId)) {
                state.allowedExtensionIds.add(extensionId)
                saveConfig(state.token, state.boundPort)
              }
              ws.data.authed = true
              ws.data.role = role
              const opencode = role === "extension" && infoFn ? infoFn() : null
              ws.send(
                JSON.stringify({
                  type: "welcome",
                  server: "opencode-browser-bridge",
                  relay: false,
                  ...(role === "extension" ? { token: state.token } : {}),
                  ...(opencode ? { opencode } : {}),
                }),
              )
              if (ws.data.role === "extension") {
                state.extensions.add(ws)
                state.extension = ws
                console.error(`[browser-bridge] extension connected (${state.extensions.size} active)`)
              } else {
                state.producers.add(ws)
              }
            } else {
              ws.close()
            }
            return
          }
          if (ws.data.role === "extension") {
            if (msg?.type === "response") settle(msg.id, !!msg.ok, msg.result, msg.error)
            else if (msg?.type === "ping") ws.send(JSON.stringify({ type: "pong" }))
          } else if (ws.data.role === "producer") {
            if (msg?.type === "request") handleExtensionRequestForwarding(ws, text)
            else if (msg?.type === "agent-state" && state.extension) {
              try {
                state.extension.send(JSON.stringify({ type: "agent-state", state: msg.state, sessionID: msg.sessionID }))
              } catch {}
            }
          }
        },
        close(ws: any) {
          if (state.extensions.delete(ws) && ws === state.extension) {
            const survivors = [...state.extensions]
            state.extension = survivors.length > 0 ? survivors[survivors.length - 1] : null
            console.error(
              state.extension
                ? `[browser-bridge] extension disconnected, switched to another (${state.extensions.size} left)`
                : "[browser-bridge] extension disconnected",
            )
          }
          state.producers.delete(ws)
        },
      },
    })
    state.server = server
    state.boundPort = port
    saveConfig(token, port)
    return server
  } catch {
    /* configured port busy — another instance owns the bridge; this one relays instead */
    return null
  }
}

function connectAsProducer(
  token: string,
  port: number = BASE_PORT,
  onOpen?: (socket: any) => void,
  infoFn?: () => Record<string, unknown> | null,
): void {
  if (state.producerSocket || state.producerConnecting) return
  state.producerConnecting = true
  const attempt = (targetPort: number) => {
    const ws = new WebSocket(`ws://127.0.0.1:${targetPort}`)
    ws.onopen = () => {
      try {
        ws.send(JSON.stringify({ type: "hello", role: "producer", token, version: "2.0.0" }))
      } catch {}
    }
    ws.onmessage = (event: any) => {
      let msg: any
      try {
        msg = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (msg?.type === "welcome") {
        state.producerSocket = ws
        state.producerConnecting = false
        onOpen?.(ws)
      } else if (msg?.type === "response") {
        settle(msg.id, !!msg.ok, msg.result, msg.error)
      } else if (msg?.type === "error") {
        ws.close()
      }
    }
    ws.onclose = () => {
      if (state.producerSocket === ws) state.producerSocket = null
      state.producerConnecting = false
      setTimeout(() => {
        // The owner may have died — try to become the owner ourselves before
        // settling back into producer mode.
        if (!state.server && !state.extension && startServer(token, port, infoFn)) {
          console.error(`[browser-bridge] took over as bridge owner on ${port}`)
          return
        }
        connectAsProducer(token, port, onOpen, infoFn)
      }, 5000)
    }
    ws.onerror = () => {}
  }
  attempt(port)
}

function cleanupBridge(server: any, producer: any): void {
  if (server && state.server === server) {
    try {
      server.stop(true)
    } catch {}
    state.server = null
  }
  if (producer && state.producerSocket === producer) {
    try {
      producer.close()
    } catch {}
    state.producerSocket = null
  }
  for (const [, entry] of state.pending) {
    clearTimeout(entry.timer)
    entry.cleanup?.()
    entry.reject(new Error("opencode plugin unloaded"))
  }
  state.pending.clear()
  for (const [, entry] of state.proxy) clearTimeout(entry.timer)
  state.proxy.clear()
}

/* -------------------------------------------------------------------------- */
/* JSON Schema helpers (V2 tools use plain JSON Schema, not tool.schema)      */
/* -------------------------------------------------------------------------- */

const str = (description: string) => ({ type: "string", description })
const num = (description: string) => ({ type: "number", description })
const bool = (description: string) => ({ type: "boolean", description })
const arr = (items: unknown, description?: string) => ({ type: "array", items, ...(description ? { description } : {}) })
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length > 0 ? { required } : {}),
  additionalProperties: false,
})
const pick = (values: string[], description?: string) => ({ type: "string", enum: values, ...(description ? { description } : {}) })

const tabArg = num("Tab id from browser_tabs / browser_snapshot. Defaults to the active tab.")
const targetArgs = {
  ref: str("Element ref from the latest browser_snapshot (recommended)."),
  selector: str("CSS selector as an alternative to ref."),
  text: str("Visible text of the element as an alternative to ref."),
  tab_id: tabArg,
}
const coordinateArgs = {
  x: num("Viewport X coordinate (CSS px). Use for elements inside cross-origin iframes, e.g. from the [iframes] section of browser_snapshot."),
  y: num("Viewport Y coordinate (CSS px). Pairs with x; sends a real mouse event through the browser input pipeline."),
}
const scheduleArg = obj(
  {
    kind: pick(["minutes", "hours", "daily", "weekdays", "monthly", "cron", "once"], "Schedule type."),
    every: num("For minutes/hours: interval size."),
    time: str("For daily/weekdays/monthly: local time HH:MM."),
    days: arr({ type: "number" }, "For weekdays: day numbers 0=Sun … 6=Sat."),
    day: num("For monthly: day of month 1–31."),
    expression: str("For cron: standard 5-field cron expression."),
    at: { anyOf: [{ type: "number" }, { type: "string" }], description: "For once: epoch ms or an ISO date string." },
  },
  ["kind"],
)

function makeTools(ctx: any) {
  return [
    {
      name: "browser_tabs",
      description:
        "List, open, close, activate or group browser tabs. Use this to see what is open, then pass tab_id to other browser_* tools to target a specific tab. " +
        "Tabs you open are automatically placed in a tab group; call this with action=group and a short, task-meaningful title " +
        "(e.g. 'flight prices · Toronto→Paris', 'laptop specs') so the user can tell at a glance which tabs belong to which task.",
      input: obj(
        {
          action: pick(["list", "new", "close", "activate", "group"], "Operation to perform."),
          url: str("URL for action=new."),
          title: str("Short, meaningful group name for action=group (e.g. the task, not the site name)."),
          active: bool("For action=new: open the tab in the foreground (default true). Use false for unattended work."),
          tab_id: tabArg,
        },
        ["action"],
      ),
      async execute(args: any, context: any) {
        const result = await bridgeCall("tabs." + args.action, args, DEFAULT_TIMEOUT, context?.signal)
        return ok(String(result))
      },
    },

    {
      name: "browser_snapshot",
      description:
        "Get a text snapshot of a page: URL, title, recent console messages and an indented tree of visible elements. " +
        "Interactive elements are labelled with [ref=eN] — use those refs for browser_click, browser_type, etc. " +
        "If the page embeds cross-origin iframes (e.g. iCloud, embedded apps), a trailing [iframes] section lists their contents " +
        "with viewport coordinates — click/type there with x,y instead of refs. " +
        "Always take a snapshot before acting, and take a fresh one after navigation or big DOM changes (refs can go stale).",
      input: obj({
        tab_id: tabArg,
        include_console: bool("Include recent console entries (default true)."),
      }),
      async execute(args: any, context: any) {
        const result = await bridgeCall("snapshot", args, 60_000, context?.signal)
        return ok(String(result))
      },
    },

    {
      name: "browser_navigate",
      description:
        "Navigate the browser. Pass a URL to go to it (https:// is added if missing), or one of: back, forward, reload. Waits for the page to finish loading.",
      input: obj(
        {
          url: str("URL, or back | forward | reload."),
          tab_id: tabArg,
        },
        ["url"],
      ),
      async execute(args: any, context: any) {
        const result = await bridgeCall("navigate", args, 45_000, context?.signal)
        return ok(String(result))
      },
    },

    {
      name: "browser_click",
      description:
        "Click an element. Prefer the [ref=eN] from the latest browser_snapshot; selector or text also work. " +
        "Clicking may navigate or change the page — take a fresh snapshot afterwards.",
      input: obj({ ...targetArgs, ...coordinateArgs }),
      async execute(args: any, context: any) {
        const result = await bridgeCall("click", args, DEFAULT_TIMEOUT, context?.signal)
        return ok(String(result))
      },
    },

    {
      name: "browser_type",
      description:
        "Type text into an input, textarea or contenteditable element (identified by ref/selector/text). " +
        "By default it replaces the existing value; set submit=true to press Enter / submit the form afterwards.",
      input: obj(
        {
          ...targetArgs,
          ...coordinateArgs,
          text: str("Text to type."),
          clear: bool("Replace existing content (default true)."),
          submit: bool("Submit the form after typing."),
        },
        ["text"],
      ),
      async execute(args: any, context: any) {
        const result = await bridgeCall("type", args, DEFAULT_TIMEOUT, context?.signal)
        return ok(String(result))
      },
    },

    {
      name: "browser_press",
      description: "Press a keyboard key (Enter, Tab, Escape, ArrowDown, PageDown, a letter…) optionally focused on an element.",
      input: obj(
        {
          key: str("Key name, e.g. Enter, Tab, Escape, ArrowUp, a."),
          ...targetArgs,
          ...coordinateArgs,
        },
        ["key"],
      ),
      async execute(args: any, context: any) {
        const result = await bridgeCall("press", args, DEFAULT_TIMEOUT, context?.signal)
        return ok(String(result))
      },
    },

    {
      name: "browser_scroll",
      description:
        "Scroll the page up/down/left/right by an amount in pixels, or scroll a specific element into view by passing ref/selector.",
      input: obj({
        direction: pick(["up", "down", "left", "right"], "Scroll direction (default down)."),
        amount: num("Pixels to scroll (default 600)."),
        ref: targetArgs.ref,
        selector: targetArgs.selector,
        tab_id: tabArg,
      }),
      async execute(args: any, context: any) {
        const result = await bridgeCall("scroll", args, DEFAULT_TIMEOUT, context?.signal)
        return ok(String(result))
      },
    },

    {
      name: "browser_select",
      description: "Select an option in a <select> dropdown by its value or its visible label.",
      input: obj({
        ...targetArgs,
        value: str("Option value attribute."),
        label: str("Visible option text."),
      }),
      async execute(args: any, context: any) {
        const result = await bridgeCall("select", args, DEFAULT_TIMEOUT, context?.signal)
        return ok(String(result))
      },
    },

    {
      name: "browser_hover",
      description: "Move the mouse over an element (useful to reveal hover menus/tooltips).",
      input: obj(targetArgs),
      async execute(args: any, context: any) {
        const result = await bridgeCall("hover", args, DEFAULT_TIMEOUT, context?.signal)
        return ok(String(result))
      },
    },

    {
      name: "browser_wait_for",
      description: "Wait until the page contains some text, or an element (by ref or CSS selector) exists and is visible. Useful after actions that load content.",
      input: obj({
        text: str("Wait until the page text contains this string."),
        selector: str("Wait until this CSS selector matches a visible element."),
        ref: str("Wait until this ref is visible."),
        timeout_ms: num("Max wait in ms (default 10000, max 60000)."),
        tab_id: tabArg,
      }),
      async execute(args: any, context: any) {
        const timeout = Math.min(Math.max(args.timeout_ms ?? 10_000, 500), 60_000)
        const result = await bridgeCall("wait_for", args, timeout + 15_000, context?.signal)
        return ok(String(result))
      },
    },

    {
      name: "browser_upload",
      description:
        "Attach local files to a file input (<input type=file>) on the page — for web forms that require uploading a document or photo. " +
        "Pass absolute file paths on this machine (create the files first with the write tool if needed). " +
        "You can target the file input directly (ref/selector) or the styled 'Choose file' button/label — the extension finds the real input behind it, even when it is hidden. " +
        "Whenever a form asks for a file, use this tool instead of asking the user to pick it manually. " +
        "Note: this briefly attaches Chrome's debugger to the tab (a yellow 'debugging' banner may appear).",
      input: obj(
        {
          ...targetArgs,
          paths: arr({ type: "string" }, "Absolute paths of the files to attach."),
        },
        ["paths"],
      ),
      async execute(args: any, context: any) {
        const result = await bridgeCall("upload", args, 60_000, context?.signal)
        return ok(String(result))
      },
    },

    {
      name: "browser_downloads",
      description:
        "List the browser's recent downloads with their local file paths. After clicking something that downloads a file, use this to find where it was saved, then open it with the read tool (text, PDFs via pdftotext, images) to assess its contents.",
      input: obj({
        limit: num("How many recent downloads to list (default 10, max 50)."),
      }),
      async execute(args: any, context: any) {
        const result = await bridgeCall("downloads.list", args, 30_000, context?.signal)
        return ok(String(result))
      },
    },

    {
      name: "browser_console",
      description:
        "Work with the page developer console. action=read returns recent console output and errors (capped buffer). " +
        "action=exec evaluates a JavaScript expression via Chrome's debugger API and returns its result — use $0-less plain JS, e.g. document.title. " +
        "action=clear empties the buffer. exec briefly attaches the debugger (a yellow banner may appear) and detaches afterward in hook mode.",
      input: obj(
        {
          action: pick(["read", "clear", "exec"], "read | clear | exec."),
          expression: str("JavaScript expression for action=exec."),
          limit: num("Max entries for action=read (default 100)."),
          tab_id: tabArg,
        },
        ["action"],
      ),
      async execute(args: any, context: any) {
        if (args.action === "exec") {
          if (!args.expression) throw new Error("expression is required for action=exec")
          const result = await bridgeCall("console.exec", args, 60_000, context?.signal)
          return ok(String(result))
        }
        if (args.action === "clear") {
          const result = await bridgeCall("console.clear", args, DEFAULT_TIMEOUT, context?.signal)
          return ok(String(result))
        }
        const result = await bridgeCall("console.read", args, 60_000, context?.signal)
        return ok(String(result))
      },
    },

    {
      name: "browser_screenshot",
      description:
        "Capture a PNG screenshot of a tab and save it to disk inside the session's project directory " +
        "(.opencode-screenshots/ — so no external-directory permission prompts are triggered), returning the file path. " +
        "Use it when visual layout matters (charts, images, broken styling) — combine with browser_snapshot for full understanding. " +
        "Screenshots briefly attach Chrome's debugger (a yellow banner may appear). With full_page=true (default false) the whole scrollable page is captured.",
      input: obj({
        tab_id: tabArg,
        full_page: bool("Capture the full scrollable page instead of the viewport (attaches the debugger briefly)."),
      }),
      async execute(args: any, context: any) {
        if (context?.sessionID) state.activeSessions.add(context.sessionID)
        const raw = await bridgeCall("screenshot", args, 60_000, context?.signal)
        const shot = raw as { base64: string; mime: string; tab: { id: number; title: string; url: string } }
        if (!shot?.base64) return ok("screenshot failed: empty result")
        try {
          let directory: string | undefined = ctx?.location?.directory
          if (context?.sessionID) {
            try {
              const session = await ctx.session.get({ sessionID: context.sessionID })
              directory = session?.location?.directory ?? directory
            } catch {
              /* fall back to the plugin location */
            }
          }
          const shotDir = join(directory ?? tmpdir(), ".opencode-screenshots")
          mkdirSync(shotDir, { recursive: true })
          const file = join(shotDir, `tab${shot.tab?.id ?? "x"}-${Date.now()}.png`)
          writeFileSync(file, Buffer.from(shot.base64, "base64"))
          return ok(
            `Screenshot saved: ${file}\n` +
              `tab ${shot.tab?.id}: ${shot.tab?.title ?? ""} — ${shot.tab?.url ?? ""}\n` +
              `Use the read tool on that path to view the image.`,
          )
        } catch (error) {
          return ok(`screenshot captured but could not be saved: ${error instanceof Error ? error.message : String(error)}`)
        }
      },
    },

    {
      name: "workflow_list",
      description:
        "List the user's scheduled browser workflows (name, id, schedule, enabled state, next run). " +
        "Workflows are definition-only until the user enables them; this tool does not change anything.",
      input: obj({}),
      async execute() {
        const result = await bridgeCall("workflows.list", {}, 30_000, context?.signal)
        const list = Array.isArray(result) ? (result as any[]) : []
        if (list.length === 0) return ok("No workflows yet.")
        return ok(
          list
            .map((workflow) => {
              const next = workflow.enabled && workflow.nextRunAt ? new Date(workflow.nextRunAt).toLocaleString() : "paused"
              const draft = workflow.source === "agent" ? " [draft — needs user review]" : ""
              return (
                `- ${workflow.name} (id ${workflow.id}) — ${workflow.enabled ? "enabled" : "disabled"}${draft}\n` +
                `  mode: ${workflow.allowSubmissions ? "can submit forms/messages" : "read-only"}\n` +
                `  schedule: ${JSON.stringify(workflow.schedule)}${workflow.timezone ? ` (${workflow.timezone})` : ""}\n` +
                `  next: ${next}`
              )
            })
            .join("\n"),
        )
      },
    },

    {
      name: "workflow_create",
      description:
        "Create a scheduled workflow for the user. The workflow is saved as a DISABLED DRAFT — tell the user to review and enable it " +
        "in the side panel's Workflows tab. Use this when the user asks to schedule a recurring browser task. " +
        "The prompt should be self-contained: a scheduled run cannot ask questions or wait for the user.",
      input: obj(
        {
          name: str("Short, meaningful workflow name."),
          prompt: str("Complete, self-contained instruction for the unattended run."),
          schedule: scheduleArg,
          timezone: str("IANA timezone, e.g. Europe/Berlin. Defaults to the system timezone."),
          model: str("Optional model as provider/model."),
          agent: str("Optional opencode agent name (default: the user's last agent)."),
          start_url: str("Optional URL the workflow should start from."),
          auto_approve_permissions: bool("Auto-approve opencode permission prompts during unattended runs (default true)."),
          timeout_minutes: num("Abort the run after this many minutes (default 30)."),
        },
        ["name", "prompt", "schedule"],
      ),
      async execute(args: any, context: any) {
        const model = args.model
          ? (() => {
              const slash = args.model.indexOf("/")
              if (slash <= 0 || slash >= args.model.length - 1) return undefined
              return { providerID: args.model.slice(0, slash), modelID: args.model.slice(slash + 1) }
            })()
          : undefined
        const input = {
          name: args.name,
          prompt: args.prompt,
          schedule: args.schedule,
          ...(args.timezone ? { timezone: args.timezone } : {}),
          ...(model ? { model } : {}),
          ...(args.agent ? { agent: args.agent } : {}),
          ...(args.start_url ? { startUrl: args.start_url } : {}),
          ...(args.auto_approve_permissions !== undefined ? { autoApprovePermissions: args.auto_approve_permissions } : {}),
          ...(args.timeout_minutes !== undefined ? { timeoutMinutes: args.timeout_minutes } : {}),
        }
        const workflow = (await bridgeCall("workflows.createDraft", { input }, 30_000, context?.signal)) as any
        return ok(
          `Created workflow "${workflow?.name ?? args.name}" as a disabled draft (id ${workflow?.id ?? "unknown"}).\n` +
            "Ask the user to review it in the Workflows tab and enable it when they are ready.",
        )
      },
    },

    {
      name: "workflow_update",
      description:
        "Update a DISABLED agent-created workflow draft (name, prompt, schedule, model, agent, start URL, timeout). " +
        "User-created or already-enabled workflows cannot be changed here — ask the user to edit them in the Workflows tab. " +
        "Updating a draft never enables it.",
      input: obj(
        {
          id: str("Workflow id from workflow_list."),
          name: str("Short, meaningful workflow name."),
          prompt: str("Complete, self-contained instruction for the unattended run."),
          schedule: scheduleArg,
          timezone: str("IANA timezone, e.g. Europe/Berlin."),
          model: str("provider/model"),
          agent: str("opencode agent name."),
          start_url: str("URL the workflow should start from."),
          auto_approve_permissions: bool("Auto-approve permission prompts."),
          timeout_minutes: num("Abort the run after this many minutes."),
        },
        ["id"],
      ),
      async execute(args: any, context: any) {
        const model = args.model
          ? (() => {
              const slash = args.model.indexOf("/")
              if (slash <= 0 || slash >= args.model.length - 1) return undefined
              return { providerID: args.model.slice(0, slash), modelID: args.model.slice(slash + 1) }
            })()
          : undefined
        const input = {
          ...(args.name !== undefined ? { name: args.name } : {}),
          ...(args.prompt !== undefined ? { prompt: args.prompt } : {}),
          ...(args.schedule !== undefined ? { schedule: args.schedule } : {}),
          ...(args.timezone !== undefined ? { timezone: args.timezone } : {}),
          ...(model ? { model } : {}),
          ...(args.agent !== undefined ? { agent: args.agent } : {}),
          ...(args.start_url !== undefined ? { startUrl: args.start_url } : {}),
          ...(args.auto_approve_permissions !== undefined ? { autoApprovePermissions: args.auto_approve_permissions } : {}),
          ...(args.timeout_minutes !== undefined ? { timeoutMinutes: args.timeout_minutes } : {}),
        }
        const workflow = (await bridgeCall("workflows.updateDraft", { id: args.id, input }, 30_000, context?.signal)) as any
        return ok(`Updated draft "${workflow?.name ?? args.id}". It remains disabled until the user reviews and enables it.`)
      },
    },
  ]
}

/* -------------------------------------------------------------------------- */
/* V2 plugin entrypoint                                                       */
/* -------------------------------------------------------------------------- */

export default {
  id: "browser-bridge",
  async setup(ctx: any) {
    const config = loadConfig()
    state.token = config.token
    state.requireToken = config.requireToken === true
    const port =
      typeof config.port === "number" && Number.isInteger(config.port) && config.port >= 1 && config.port <= 65535
        ? config.port
        : BASE_PORT

    const infoFn = () => readServiceInfo(ctx)
    const server = startServer(config.token, port, infoFn)
    let producer: any = null
    if (!server) {
      connectAsProducer(
        config.token,
        port,
        (socket) => {
          producer = socket
        },
        infoFn,
      )
      console.error(`[browser-bridge] joined an existing bridge as producer on ${port}`)
    } else {
      console.error(`[browser-bridge] listening on ws://127.0.0.1:${port}`)
    }

    // Clear the page halo when a browser-driving session finishes.
    const controller = new AbortController()
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (
            event.type !== "session.idle" &&
            event.type !== "session.execution.succeeded" &&
            event.type !== "session.execution.failed" &&
            event.type !== "session.execution.interrupted"
          ) {
            continue
          }
          const sessionID = event.data?.sessionID
          if (!sessionID || !state.activeSessions.has(sessionID)) continue
          state.activeSessions.delete(sessionID)
          const socket = state.extension ?? state.producerSocket
          if (socket) socket.send(JSON.stringify({ type: "agent-state", state: "idle", sessionID }))
        }
      } catch {
        /* subscription ended or server shutting down */
      }
    })()

    // The V2 shared service can start on a random port. Read its registration
    // file and tell the extension when it appears/changes. Only the bridge
    // owner broadcasts so producer instances cannot overwrite the project
    // directory with their own location.
    let endpointTimer: ReturnType<typeof setInterval> | null = null
    if (server) {
      let lastEndpoint = JSON.stringify(infoFn())
      endpointTimer = setInterval(() => {
        const next = infoFn()
        const key = JSON.stringify(next)
        if (key === lastEndpoint) return
        lastEndpoint = key
        if (!next) return
        for (const socket of state.extensions) {
          try {
            socket.send(JSON.stringify({ type: "opencode-endpoint", opencode: next }))
          } catch {}
        }
      }, 5000)
    }

    await ctx.tool.transform((editor: any) => {
      for (const definition of makeTools(ctx)) {
        const execute = definition.execute
        editor.add({
          ...definition,
          execute: async (input: any, context: any) => {
            if (context?.sessionID) state.activeSessions.add(context.sessionID)
            return execute(input, context)
          },
        })
      }
    })


    return () => {
      controller.abort()
      if (endpointTimer) clearInterval(endpointTimer)
      cleanupBridge(server, producer)
    }
  },
}
