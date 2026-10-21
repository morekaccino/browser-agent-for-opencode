import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OpenCode } from '@opencode/client'
import type {
  FormField,
  FormInfo,
  ModelInfo,
  PermissionRequest,
  SessionInfo,
  SessionMessageInfo,
  TokenUsageInfo,
  V2Event,
} from '@opencode/client'
import { basicAuthHeader } from '../../lib/auth'
import { settings } from '../../lib/settings'

export type SessionRunStatus = 'idle' | 'busy' | 'retry'

export interface ModelOption {
  value: string
  label: string
  providerID: string
  providerName: string
  modelID: string
  /** Display name exactly as opencode lists it. */
  name: string
  /** Variant keys (reasoning effort / context modes) the model supports. */
  variants: string[]
  /** Whether the model accepts image input (enables context screenshots). */
  supportsImages: boolean
  limit?: number
}

export interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  time: { created: number }
  error?: { message?: string }
  cost?: number
  tokens?: TokenUsageInfo
  providerID?: string
  modelID?: string
}

export interface UiPart {
  id: string
  type: 'text' | 'reasoning' | 'tool' | 'file'
  text?: string
  tool?: string
  filename?: string
  state?: {
    status: string
    input?: unknown
    output?: string
    error?: string
    title?: string
  }
}

export interface PendingPermission {
  id: string
  sessionID: string
  action: string
  resources: string[]
  save?: string[]
  metadata?: Record<string, unknown>
  message?: string
}

export interface PendingForm {
  id: string
  sessionID: string
  title: string
  fields: FormField[]
}

export interface ContextUsage {
  tokens: number
  limit: number | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
  return String(error)
}

function supportsImages(model: ModelInfo): boolean {
  const input = model.capabilities?.input as unknown
  if (Array.isArray(input)) return input.includes('image')
  if (typeof input === 'string') return input.split(/\s+/).includes('image')
  return false
}

function toPermission(request: PermissionRequest): PendingPermission {
  return {
    id: request.id,
    sessionID: request.sessionID,
    action: request.action,
    resources: request.resources ?? [],
    save: request.save,
    metadata: request.metadata as Record<string, unknown> | undefined,
    message: request.message,
  }
}

function toForm(form: FormInfo): PendingForm {
  return {
    id: form.id,
    sessionID: form.sessionID,
    title: form.title,
    fields: form.fields as unknown as FormField[],
  }
}

/** Convert V2's assistant `content[]` / user messages into the panel's message+parts UI shape. */
function adaptMessages(rows: SessionMessageInfo[]): {
  messages: UiMessage[]
  parts: Record<string, UiPart[]>
} {
  const messages: UiMessage[] = []
  const parts: Record<string, UiPart[]> = {}

  for (const row of rows) {
    if (row.type === 'user') {
      const list: UiPart[] = []
      if (row.text) list.push({ id: `${row.id}:text`, type: 'text', text: row.text })
      for (const [index, file] of (row.files ?? []).entries()) {
        const uri = file.source?.type === 'uri' ? file.source.uri : undefined
        const name = file.name ?? uri?.split(/[\\/]/).pop() ?? 'attachment'
        list.push({ id: `${row.id}:file:${index}`, type: 'file', filename: name })
      }
      messages.push({ id: row.id, role: 'user', time: row.time })
      parts[row.id] = list
      continue
    }

    if (row.type !== 'assistant') continue

    const list: UiPart[] = []
    for (const [index, item] of (row.content ?? []).entries()) {
      if (item.type === 'text') {
        list.push({ id: `${row.id}:${index}`, type: 'text', text: item.text })
        continue
      }
      if (item.type === 'reasoning') {
        list.push({ id: `${row.id}:${index}`, type: 'reasoning', text: item.text })
        continue
      }
      if (item.type === 'tool') {
        const state = item.state as any
        const status = state?.status === 'streaming' ? 'running' : (state?.status ?? 'running')
        let output = ''
        if (state?.status === 'completed') {
          output = (state.content ?? [])
            .map((content: any) => (content.type === 'text' ? content.text : `[file: ${content.name ?? content.uri}]`))
            .join('\n')
        }
        if (state?.status === 'error') output = state.error?.message ?? 'tool failed'
        list.push({
          id: `${row.id}:${index}`,
          type: 'tool',
          tool: item.name,
          state: {
            status,
            input: state?.input,
            output: output || undefined,
            error: state?.status === 'error' ? (state.error?.message ?? 'tool failed') : undefined,
          },
        })
      }
    }

    messages.push({
      id: row.id,
      role: 'assistant',
      time: row.time,
      ...(row.error ? { error: { message: row.error.message } } : {}),
      cost: row.cost,
      tokens: row.tokens,
      providerID: row.model?.providerID,
      modelID: row.model?.id,
    })
    parts[row.id] = list
  }

  return { messages, parts }
}

export function useOpencode(serverUrl: string, auth: { username: string; password: string } | null) {
  const authHeaders = useMemo(() => {
    if (auth && (auth.username || auth.password)) {
      return { Authorization: basicAuthHeader(auth.username, auth.password) }
    }
    return undefined
  }, [auth?.username, auth?.password])

  const client = useMemo(
    () =>
      OpenCode.make({
        baseUrl: serverUrl.replace(/\/$/, '') || 'http://localhost:4096',
        ...(authHeaders ? { headers: authHeaders } : {}),
      }),
    [serverUrl, authHeaders],
  )

  const [health, setHealth] = useState<'unknown' | 'ok' | 'down'>('unknown')
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [parts, setParts] = useState<Record<string, UiPart[]>>({})
  const [statuses, setStatuses] = useState<Record<string, SessionRunStatus>>({})
  const [permissions, setPermissions] = useState<PendingPermission[]>([])
  const [forms, setForms] = useState<PendingForm[]>([])
  const [sessionCost, setSessionCost] = useState(0)
  const [models, setModels] = useState<ModelOption[]>([])
  const [pendingSend, setPendingSend] = useState<{ text: string; files: string[] } | null>(null)
  const [commands, setCommands] = useState<{ name: string; description?: string }[]>([])
  const [agents, setAgents] = useState<{ id: string; name: string; description?: string }[]>([])
  const [agent, setAgentState] = useState('build')
  const [variant, setVariantState] = useState<string | null>(null)
  const [model, setModel] = useState<{ providerID: string; modelID: string } | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const currentIdRef = useRef<string | null>(null)
  currentIdRef.current = currentId

  const modelsRef = useRef<ModelOption[]>([])
  modelsRef.current = models

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- health ---------------------------------------------------------------------------
  useEffect(() => {
    if (!serverUrl) {
      setHealth('unknown')
      return
    }
    let cancelled = false
    const check = async () => {
      try {
        await client.server.info({ signal: AbortSignal.timeout(4000) })
        if (!cancelled) setHealth('ok')
      } catch {
        if (!cancelled) setHealth('down')
      }
    }
    void check()
    const timer = setInterval(check, 5000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [client, serverUrl])

  // ---- sessions ---------------------------------------------------------------------------
  const refreshSessions = useCallback(async () => {
    try {
      const all: SessionInfo[] = []
      let cursor: string | undefined
      for (let page = 0; page < 5; page++) {
        const result = await client.session.list(
          cursor ? { cursor } : { limit: 100, order: 'desc' },
          { signal: AbortSignal.timeout(15000) },
        )
        all.push(...result.data)
        cursor = result.cursor.next ?? undefined
        if (!cursor || result.data.length === 0) break
      }
      setSessions(all)
      setSessionsLoaded(true)
      if (!currentIdRef.current) {
        const first = all[0]
        if (first) setCurrentId(first.id)
      }
    } catch {
      /* server down; health check surfaces it */
    }
  }, [client])

  useEffect(() => {
    if (health !== 'ok') return
    void refreshSessions()
  }, [health, refreshSessions])

  // Mark sessions that are already running when the panel opens.
  useEffect(() => {
    if (health !== 'ok') return
    let cancelled = false
    void (async () => {
      try {
        const active = await client.session.active({ signal: AbortSignal.timeout(8000) })
        if (cancelled) return
        setStatuses((prev) => {
          const next = { ...prev }
          for (const id of Object.keys(active ?? {})) next[id] = 'busy'
          return next
        })
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [health, client])

  // ---- models -----------------------------------------------------------------------------
  useEffect(() => {
    if (health !== 'ok') return
    let cancelled = false
    void (async () => {
      try {
        const [modelResult, providerResult, defaultResult] = await Promise.all([
          client.model.list(undefined, { signal: AbortSignal.timeout(15000) }),
          client.provider.list(undefined, { signal: AbortSignal.timeout(15000) }).catch(() => ({ data: [] })),
          client.model.default(undefined, { signal: AbortSignal.timeout(15000) }).catch(() => null),
        ])
        if (cancelled) return
        const providerNames = new Map((providerResult.data ?? []).map((provider) => [provider.id, provider.name]))
        const options: ModelOption[] = []
        for (const entry of modelResult.data ?? []) {
          if (entry.enabled === false) continue
          const providerName = providerNames.get(entry.providerID) ?? entry.providerID
          options.push({
            value: `${entry.providerID}/${entry.modelID}`,
            label: `${providerName} · ${entry.name ?? entry.modelID}`,
            providerID: entry.providerID,
            providerName,
            modelID: entry.modelID,
            name: entry.name ?? entry.modelID,
            variants: (entry.variants ?? []).map((item) => item.id),
            supportsImages: supportsImages(entry),
            limit: typeof entry.limit?.context === 'number' ? entry.limit.context : undefined,
          })
        }
        options.sort((a, b) => a.label.localeCompare(b.label))
        setModels(options)

        const saved = await settings.lastModel.getValue()
        if (saved && options.some((option) => option.providerID === saved.providerID && option.modelID === saved.modelID)) {
          setModel(saved)
          return
        }
        const fallback = defaultResult?.data
        if (fallback && options.some((option) => option.providerID === fallback.providerID && option.modelID === fallback.modelID)) {
          setModel({ providerID: fallback.providerID, modelID: fallback.modelID })
        } else if (options[0]) {
          setModel({ providerID: options[0].providerID, modelID: options[0].modelID })
        }
      } catch {
        /* providers endpoint unavailable */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [health, client])

  // ---- message loading ---------------------------------------------------------------------
  const loadMessages = useCallback(
    async (sessionId: string, options: { tail?: boolean } = {}) => {
      try {
        if (options.tail) {
          const result = await client.message.list(
            { sessionID: sessionId, limit: 200, order: 'desc' },
            { signal: AbortSignal.timeout(15000) },
          )
          if (currentIdRef.current !== sessionId) return
          const adapted = adaptMessages([...result.data].reverse())
          setMessages(adapted.messages)
          setParts(adapted.parts)
          return
        }

        const all: SessionMessageInfo[] = []
        let cursor: string | undefined
        for (let page = 0; page < 10; page++) {
          const result = await client.message.list(
            cursor ? { sessionID: sessionId, cursor } : { sessionID: sessionId, limit: 100, order: 'asc' },
            { signal: AbortSignal.timeout(20000) },
          )
          all.push(...result.data)
          cursor = result.cursor.next ?? undefined
          if (!cursor || result.data.length === 0) break
        }
        if (currentIdRef.current !== sessionId) return
        const adapted = adaptMessages(all)
        setMessages(adapted.messages)
        setParts(adapted.parts)
      } catch {
        /* ignore */
      }
    },
    [client],
  )

  useEffect(() => {
    if (!currentId) {
      setMessages([])
      setParts({})
      return
    }
    void loadMessages(currentId)
  }, [currentId, loadMessages])

  const scheduleRefresh = useCallback(
    (sessionId: string) => {
      if (sessionId !== currentIdRef.current) return
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null
        void loadMessages(sessionId, { tail: true })
      }, 250)
    },
    [loadMessages],
  )

  // ---- pending permissions + forms --------------------------------------------------------
  useEffect(() => {
    if (health !== 'ok' || !currentId) {
      setPermissions([])
      setForms([])
      return
    }
    let cancelled = false
    const tick = async () => {
      try {
        const [nextPermissions, nextForms] = await Promise.all([
          client.permission.list({ sessionID: currentId }, { signal: AbortSignal.timeout(8000) }),
          client.session.form.list({ sessionID: currentId }, { signal: AbortSignal.timeout(8000) }),
        ])
        if (cancelled) return
        setPermissions((nextPermissions ?? []).map(toPermission))
        setForms((nextForms ?? []).map(toForm))
      } catch {
        /* server hiccup; next tick retries */
      }
    }
    void tick()
    const timer = setInterval(tick, 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [health, client, currentId])

  // ---- commands ----------------------------------------------------------------------------
  useEffect(() => {
    if (health !== 'ok') return
    let cancelled = false
    void (async () => {
      try {
        const result = await client.command.list(undefined, { signal: AbortSignal.timeout(10000) })
        if (!cancelled) setCommands((result.data ?? []).map((command) => ({ name: command.name, description: command.description })))
      } catch {
        /* command endpoint unavailable */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [health, client])

  const runCommand = useCallback(
    async (raw: string) => {
      const id = currentIdRef.current
      if (!id) return
      const match = /^\/(\S+)\s*([\s\S]*)$/.exec(raw.trim())
      if (!match) return
      const command = match[1] ?? ''
      if (!command) return
      const args = (match[2] ?? '').trim()
      setLastError(null)
      setStatuses((prev) => ({ ...prev, [id]: 'busy' }))
      try {
        if (model) {
          await client.session.switchModel(
            {
              sessionID: id,
              model: {
                providerID: model.providerID,
                id: model.modelID,
                ...(variant ? { variant } : {}),
              },
            },
            { signal: AbortSignal.timeout(15000) },
          )
        }
        await client.session.command({ sessionID: id, name: command, text: args }, { signal: AbortSignal.timeout(30000) })
      } catch (error) {
        setLastError(errorMessage(error))
        setStatuses((prev) => ({ ...prev, [id]: 'idle' }))
      }
    },
    [client, model, variant],
  )

  // ---- session cost ------------------------------------------------------------------------
  useEffect(() => {
    if (health !== 'ok' || !currentId) {
      setSessionCost(0)
      return
    }
    let cancelled = false
    const tick = async () => {
      try {
        const session = await client.session.get({ sessionID: currentId }, { signal: AbortSignal.timeout(8000) })
        if (!cancelled && typeof session.cost === 'number') setSessionCost(session.cost)
      } catch {
        /* ignore */
      }
    }
    void tick()
    const timer = setInterval(tick, 5000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [health, client, currentId])

  // ---- authoritative status poll ---------------------------------------------------------
  // SSE is the fast path, but a missed completion event must never leave the
  // panel stuck on "working…". Poll the current session as a safety net.
  useEffect(() => {
    if (health !== 'ok' || !currentId) return
    let cancelled = false
    const tick = async () => {
      try {
        const [active, session] = await Promise.all([
          client.session.active({ signal: AbortSignal.timeout(8000) }),
          client.session.get({ sessionID: currentId }, { signal: AbortSignal.timeout(8000) }),
        ])
        if (cancelled) return
        const running = Boolean((active as Record<string, unknown> | undefined)?.[currentId])
        const idle = typeof session.time?.idle === 'number' && session.time.idle >= session.time.updated
        if (running) {
          setStatuses((prev) => (prev[currentId] === 'busy' ? prev : { ...prev, [currentId]: 'busy' }))
        } else if (idle) {
          setStatuses((prev) => (prev[currentId] === 'idle' ? prev : { ...prev, [currentId]: 'idle' }))
        }
      } catch {
        /* server hiccup; next tick retries */
      }
    }
    void tick()
    const timer = setInterval(tick, 1500)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [health, client, currentId])

  const contextUsage = useMemo<ContextUsage | null>(() => {
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index]
      if (message?.role !== 'assistant' || !message.tokens) continue
      const usage = message.tokens
      const total =
        (usage.input ?? 0) +
        (usage.output ?? 0) +
        (usage.reasoning ?? 0) +
        (usage.cache?.read ?? 0) +
        (usage.cache?.write ?? 0)
      if (total <= 0) continue
      const limit =
        models.find((option) => option.providerID === message.providerID && option.modelID === message.modelID)?.limit ?? null
      return { tokens: total, limit }
    }
    return null
  }, [messages, models])

  // ---- event stream ------------------------------------------------------------------------
  useEffect(() => {
    if (!serverUrl) return
    let stopped = false
    let controller: AbortController | null = null

    const handleEvent = (event: V2Event) => {
      const data = ((event as { data?: unknown }).data ?? {}) as Record<string, any>
      switch (event.type) {
        case 'session.status': {
          const status = data.status?.type as SessionRunStatus | undefined
          if (data.sessionID && status) setStatuses((prev) => ({ ...prev, [data.sessionID]: status }))
          break
        }
        case 'session.idle': {
          if (data.sessionID) {
            setStatuses((prev) => ({ ...prev, [data.sessionID]: 'idle' }))
            scheduleRefresh(data.sessionID)
          }
          break
        }
        case 'session.created':
        case 'session.renamed':
        case 'session.deleted':
        case 'session.archived':
        case 'session.unarchived':
        case 'session.moved':
        case 'session.forked': {
          void refreshSessions()
          break
        }
        case 'session.execution.started': {
          if (data.sessionID) setStatuses((prev) => ({ ...prev, [data.sessionID]: 'busy' }))
          break
        }
        case 'session.execution.failed': {
          setLastError(data.error?.message ?? 'session failed')
          if (data.sessionID) {
            setStatuses((prev) => ({ ...prev, [data.sessionID]: 'idle' }))
            scheduleRefresh(data.sessionID)
          }
          break
        }
        case 'session.execution.succeeded':
        case 'session.execution.interrupted': {
          if (data.sessionID) {
            setStatuses((prev) => ({ ...prev, [data.sessionID]: 'idle' }))
            scheduleRefresh(data.sessionID)
          }
          break
        }
        case 'session.retry.scheduled': {
          if (data.sessionID) setStatuses((prev) => ({ ...prev, [data.sessionID]: 'retry' }))
          break
        }
        case 'permission.asked': {
          const permission = toPermission(data as PermissionRequest)
          if (permission.sessionID === currentIdRef.current) {
            setPermissions((prev) => (prev.some((item) => item.id === permission.id) ? prev : [...prev, permission]))
          }
          break
        }
        case 'permission.replied': {
          if (data.requestID) setPermissions((prev) => prev.filter((item) => item.id !== data.requestID))
          break
        }
        case 'form.created': {
          const form = toForm(data.form as FormInfo)
          if (form.sessionID === currentIdRef.current) {
            setForms((prev) => (prev.some((item) => item.id === form.id) ? prev : [...prev, form]))
          }
          break
        }
        case 'form.replied':
        case 'form.cancelled': {
          if (data.id) setForms((prev) => prev.filter((item) => item.id !== data.id))
          break
        }
        case 'session.usage.updated': {
          if (data.sessionID === currentIdRef.current && typeof data.cost === 'number') setSessionCost(data.cost)
          break
        }
        case 'session.inbox.delivered': {
          if (data.sessionID === currentIdRef.current) {
            setPendingSend(null)
            scheduleRefresh(data.sessionID)
          }
          break
        }
        case 'session.text.delta':
        case 'session.reasoning.delta':
        case 'session.tool.called':
        case 'session.tool.success':
        case 'session.tool.failed':
        case 'session.tool.progress':
        case 'session.step.started':
        case 'session.step.ended':
        case 'session.step.streamed':
        case 'session.compaction.started':
        case 'session.compaction.ended':
        case 'session.compaction.failed':
        case 'session.synthetic': {
          if (data.sessionID) scheduleRefresh(data.sessionID)
          break
        }
      }
    }

    void (async () => {
      while (!stopped) {
        controller = new AbortController()
        try {
          for await (const event of client.event.subscribe({ signal: controller.signal })) {
            if (stopped) return
            handleEvent(event as V2Event)
          }
        } catch {
          /* stream error; retry */
        }
        if (!stopped) await sleep(2500)
      }
    })()

    return () => {
      stopped = true
      controller?.abort()
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current)
        refreshTimer.current = null
      }
    }
  }, [client, serverUrl, refreshSessions, scheduleRefresh])

  // ---- actions -----------------------------------------------------------------------------
  const newSession = useCallback(async (): Promise<SessionInfo | null> => {
    try {
      const auto = await settings.opencodeAutoDiscover.getValue().catch(() => true)
      const endpoint = await settings.opencodeEndpoint.getValue().catch(() => null)
      let directory = auto && endpoint?.directory ? endpoint.directory : undefined
      // Prefer the project of the session the user is currently viewing. The
      // bridge owner may have been loaded from a different project.
      const current = currentIdRef.current
      if (current) {
        try {
          const currentSession = await client.session.get(
            { sessionID: current },
            { signal: AbortSignal.timeout(8000) },
          )
          directory = currentSession.location?.directory ?? directory
        } catch {
          /* fall back to the discovered directory */
        }
      }
      // no explicit title: opencode auto-generates a meaningful one after the first message
      const session = await client.session.create(
        { ...(directory ? { location: { directory } } : {}) },
        { signal: AbortSignal.timeout(20000) },
      )
      if (session) {
        await refreshSessions()
        setCurrentId(session.id)
      }
      return session ?? null
    } catch (error) {
      setLastError(errorMessage(error))
      return null
    }
  }, [client, refreshSessions])

  // ---- agents (build / plan / …) -----------------------------------------------------------
  useEffect(() => {
    if (health !== 'ok') return
    let cancelled = false
    void (async () => {
      try {
        const result = await client.agent.list(undefined, { signal: AbortSignal.timeout(10000) })
        const primary = (result.data ?? [])
          .filter((entry) => entry.mode === 'primary' && !entry.hidden)
          .map((entry) => ({ id: entry.id, name: entry.name, description: entry.description }))
        if (!cancelled && primary.length > 0) setAgents(primary)
      } catch {
        /* agents endpoint unavailable */
      }
    })()
    void settings.lastAgent.getValue().then((name) => {
      if (!cancelled && name) setAgentState(name)
    })
    return () => {
      cancelled = true
    }
  }, [health, client])

  const setAgent = useCallback((name: string) => {
    setAgentState(name)
    void settings.lastAgent.setValue(name)
  }, [])

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      try {
        await client.session.update({ sessionID: sessionId, title }, { signal: AbortSignal.timeout(10000) })
        await refreshSessions()
      } catch (error) {
        setLastError(errorMessage(error))
      }
    },
    [client, refreshSessions],
  )

  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await client.session.remove({ sessionID: sessionId }, { signal: AbortSignal.timeout(15000) })
        const result = await client.session.list({ limit: 100, order: 'desc' }, { signal: AbortSignal.timeout(15000) })
        setSessions(result.data)
        if (currentIdRef.current === sessionId) setCurrentId(result.data[0]?.id ?? null)
      } catch (error) {
        setLastError(errorMessage(error))
      }
    },
    [client],
  )

  const send = useCallback(
    async (
      text: string,
      opts?: { system?: string; files?: { mime: string; filename: string; dataUrl: string }[] },
    ): Promise<boolean> => {
      const id = currentIdRef.current
      if (!id) return false
      const files = (opts?.files ?? []).map((file) => ({ uri: file.dataUrl, name: file.filename }))
      if (!text.trim() && files.length === 0) return true
      setLastError(null)
      setPendingSend({ text, files: (opts?.files ?? []).map((file) => file.filename) })
      setStatuses((prev) => ({ ...prev, [id]: 'busy' }))
      let promptText = text
      try {
        if (agent) {
          await client.session.switchAgent({ sessionID: id, agent }, { signal: AbortSignal.timeout(15000) })
        }
        if (model) {
          await client.session.switchModel(
            {
              sessionID: id,
              model: {
                providerID: model.providerID,
                id: model.modelID,
                ...(variant ? { variant } : {}),
              },
            },
            { signal: AbortSignal.timeout(15000) },
          )
        }
        if (opts?.system) {
          try {
            await client.session.synthetic(
              { sessionID: id, text: opts.system, description: 'browser page context' },
              { signal: AbortSignal.timeout(20000) },
            )
          } catch {
            promptText = `${opts.system}\n\n${text}`
          }
        }
        await client.session.prompt(
          { sessionID: id, text: promptText, ...(files.length > 0 ? { files } : {}) },
          { signal: AbortSignal.timeout(120000) },
        )
        return true
      } catch (error) {
        setLastError(errorMessage(error))
        setStatuses((prev) => ({ ...prev, [id]: 'idle' }))
        return false
      } finally {
        setPendingSend(null)
        if (currentIdRef.current === id) void loadMessages(id, { tail: true })
      }
    },
    [client, model, agent, variant, loadMessages],
  )

  const abort = useCallback(async () => {
    const id = currentIdRef.current
    if (!id) return
    // Make the stop button immediate: the V2 event arrives a moment later.
    setStatuses((prev) => ({ ...prev, [id]: 'idle' }))
    setPendingSend(null)
    try {
      await client.session.interrupt({ sessionID: id }, { signal: AbortSignal.timeout(10000) })
    } catch (error) {
      setLastError(errorMessage(error))
      setStatuses((prev) => ({ ...prev, [id]: 'busy' }))
    } finally {
      if (currentIdRef.current === id) void loadMessages(id, { tail: true })
    }
  }, [client, loadMessages])

  const replyPermission = useCallback(
    async (permission: PendingPermission, response: 'once' | 'always' | 'reject') => {
      setPermissions((prev) => prev.filter((item) => item.id !== permission.id))
      try {
        await client.permission.reply(
          { sessionID: permission.sessionID, requestID: permission.id, decision: response },
          { signal: AbortSignal.timeout(10000) },
        )
      } catch (error) {
        setLastError(errorMessage(error))
      }
    },
    [client],
  )

  const replyForm = useCallback(
    async (form: PendingForm, answer: Record<string, string | number | boolean | string[]>) => {
      setForms((prev) => prev.filter((item) => item.id !== form.id))
      try {
        await client.session.form.reply(
          { sessionID: form.sessionID, formID: form.id, answer },
          { signal: AbortSignal.timeout(15000) },
        )
      } catch (error) {
        setLastError(errorMessage(error))
      }
    },
    [client],
  )

  const cancelForm = useCallback(
    async (form: PendingForm) => {
      setForms((prev) => prev.filter((item) => item.id !== form.id))
      try {
        await client.session.form.cancel(
          { sessionID: form.sessionID, formID: form.id },
          { signal: AbortSignal.timeout(10000) },
        )
      } catch (error) {
        setLastError(errorMessage(error))
      }
    },
    [client],
  )

  const chooseModel = useCallback((value: string) => {
    const option = modelsRef.current.find((item) => item.value === value)
    if (!option) return
    setModel({ providerID: option.providerID, modelID: option.modelID })
    void settings.lastModel.setValue({ providerID: option.providerID, modelID: option.modelID })
  }, [])

  // restore the saved effort/variant per model
  useEffect(() => {
    if (!model) {
      setVariantState(null)
      return
    }
    let cancelled = false
    void (async () => {
      const option = modelsRef.current.find(
        (item) => item.providerID === model.providerID && item.modelID === model.modelID,
      )
      const map = await settings.variantByModel.getValue()
      const saved = map[`${model.providerID}/${model.modelID}`]
      if (cancelled) return
      setVariantState(saved && option?.variants.includes(saved) ? saved : null)
    })()
    return () => {
      cancelled = true
    }
  }, [model?.providerID, model?.modelID, models])

  const chooseVariant = useCallback(
    async (value: string | null) => {
      setVariantState(value)
      if (!model) return
      const key = `${model.providerID}/${model.modelID}`
      const map = await settings.variantByModel.getValue()
      const next = { ...map }
      if (value) next[key] = value
      else delete next[key]
      await settings.variantByModel.setValue(next)
    },
    [model],
  )

  const clearError = useCallback(() => setLastError(null), [])

  return {
    health,
    sessions,
    sessionsLoaded,
    currentId,
    setCurrentId,
    messages,
    parts,
    statuses,
    permissions,
    forms,
    sessionCost,
    contextUsage,
    models,
    commands,
    agents,
    agent,
    setAgent,
    variant,
    chooseVariant,
    model,
    chooseModel,
    lastError,
    clearError,
    newSession,
    send,
    pendingSend,
    renameSession,
    deleteSession,
    runCommand,
    abort,
    replyPermission,
    replyForm,
    cancelForm,
    refreshSessions,
  }
}
