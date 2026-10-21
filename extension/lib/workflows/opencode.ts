import { OpenCode } from '@opencode/client'
import type { SessionInfo, SessionMessageInfo } from '@opencode/client'
import { basicAuthHeader } from '../auth'
import { settings } from '../settings'

export interface SessionStatusEntry {
  type: 'idle' | 'busy' | 'retry'
  attempt?: number
  message?: string
}

export interface PermissionRequest {
  id: string
  sessionID: string
  permission?: string
  patterns?: string[]
  metadata?: Record<string, unknown>
}

export interface FormRequest {
  id: string
  sessionID: string
}

export interface SessionMessageRow {
  info: {
    id: string
    role: 'user' | 'assistant'
    time?: { created?: number; completed?: number }
    summary?: boolean
    error?: { name?: string; message?: string; data?: { message?: string } }
    cost?: number
    tokens?: {
      input?: number
      output?: number
      reasoning?: number
      cache?: { read?: number; write?: number }
    }
    providerID?: string
    modelID?: string
  }
  parts: {
    type: string
    text?: string
    synthetic?: boolean
  }[]
}

export interface PromptBody {
  messageID?: string
  model?: { providerID: string; modelID: string }
  agent?: string
  system?: string
  variant?: string
  tools?: Record<string, boolean>
  parts: { type: 'text'; text: string }[]
}

export interface CreatedSession {
  id: string
  title?: string
}

async function client() {
  const [url, username, password] = await Promise.all([
    settings.opencodeUrl.getValue(),
    settings.opencodeUsername.getValue(),
    settings.opencodePassword.getValue(),
  ])
  const headers =
    username || password
      ? { Authorization: basicAuthHeader(username || 'opencode', password) }
      : undefined
  return OpenCode.make({
    baseUrl: url.replace(/\/$/, ''),
    ...(headers ? { headers } : {}),
  })
}

function adaptMessage(row: SessionMessageInfo): SessionMessageRow | null {
  if (row.type === 'user') {
    return {
      info: {
        id: row.id,
        role: 'user',
        time: { created: row.time?.created },
      },
      parts: [{ type: 'text', text: row.text }],
    }
  }
  if (row.type !== 'assistant') return null

  const parts: SessionMessageRow['parts'] = []
  for (const item of row.content ?? []) {
    if (item.type === 'text') parts.push({ type: 'text', text: item.text })
    else if (item.type === 'reasoning') parts.push({ type: 'reasoning', text: item.text })
    else if (item.type === 'tool') parts.push({ type: 'tool', text: '' })
  }

  return {
    info: {
      id: row.id,
      role: 'assistant',
      time: { created: row.time?.created, completed: row.time?.completed },
      error: row.error ? { name: row.error.type, message: row.error.message } : undefined,
      cost: row.cost,
      tokens: row.tokens
        ? {
            input: row.tokens.input,
            output: row.tokens.output,
            reasoning: row.tokens.reasoning,
            cache: row.tokens.cache,
          }
        : undefined,
      providerID: row.model?.providerID,
      modelID: row.model?.id,
    },
    parts,
  }
}

export async function health(): Promise<boolean> {
  try {
    const api = await client()
    await api.server.info({ signal: AbortSignal.timeout(4_000) })
    return true
  } catch {
    return false
  }
}

export async function createSession(title: string): Promise<CreatedSession> {
  const api = await client()
  const auto = await settings.opencodeAutoDiscover.getValue().catch(() => true)
  const endpoint = await settings.opencodeEndpoint.getValue().catch(() => null)
  const directory = auto && endpoint?.directory ? endpoint.directory : undefined
  const session: SessionInfo = await api.session.create(
    { title, ...(directory ? { location: { directory } } : {}) },
    { signal: AbortSignal.timeout(20_000) },
  )
  return { id: session.id, title: session.title }
}

export async function promptAsync(sessionId: string, body: PromptBody): Promise<void> {
  const api = await client()
  if (body.agent) {
    await api.session.switchAgent(
      { sessionID: sessionId, agent: body.agent },
      { signal: AbortSignal.timeout(15_000) },
    )
  }
  if (body.model) {
    await api.session.switchModel(
      {
        sessionID: sessionId,
        model: {
          providerID: body.model.providerID,
          id: body.model.modelID,
          ...(body.variant ? { variant: body.variant } : {}),
        },
      },
      { signal: AbortSignal.timeout(15_000) },
    )
  }

  const text = body.parts.map((part) => part.text).join('\n\n')
  let promptText = text
  if (body.system) {
    try {
      await api.session.synthetic(
        { sessionID: sessionId, text: body.system, description: 'workflow system prompt' },
        { signal: AbortSignal.timeout(20_000) },
      )
    } catch {
      promptText = `${body.system}\n\n${text}`
    }
  }

  await api.session.prompt({ sessionID: sessionId, text: promptText }, { signal: AbortSignal.timeout(120_000) })
}

export async function sessionStatuses(): Promise<Record<string, SessionStatusEntry>> {
  const api = await client()
  const active = await api.session.active({ signal: AbortSignal.timeout(10_000) })
  const statuses: Record<string, SessionStatusEntry> = {}
  for (const sessionId of Object.keys(active ?? {})) statuses[sessionId] = { type: 'busy' }
  return statuses
}

export async function sessionMessages(sessionId: string): Promise<SessionMessageRow[]> {
  const api = await client()
  const rows: SessionMessageInfo[] = []
  let cursor: string | undefined
  for (let page = 0; page < 10; page++) {
    const result = await api.message.list(
      cursor ? { sessionID: sessionId, cursor } : { sessionID: sessionId, limit: 100, order: 'asc' },
      { signal: AbortSignal.timeout(20_000) },
    )
    rows.push(...result.data)
    cursor = result.cursor.next ?? undefined
    if (!cursor || result.data.length === 0) break
  }
  return rows.map(adaptMessage).filter((row): row is SessionMessageRow => row != null)
}

export async function abortSession(sessionId: string): Promise<void> {
  const api = await client()
  await api.session.interrupt({ sessionID: sessionId }, { signal: AbortSignal.timeout(10_000) })
}

export async function listPermissions(): Promise<PermissionRequest[]> {
  const api = await client()
  const result = await api.permission.request.list(undefined, { signal: AbortSignal.timeout(8_000) })
  return (result.data ?? []).map((request) => ({
    id: request.id,
    sessionID: request.sessionID,
    permission: request.action,
    patterns: request.resources,
    metadata: request.metadata as Record<string, unknown> | undefined,
  }))
}

export async function replyPermission(
  sessionId: string,
  permissionId: string,
  response: 'once' | 'always' | 'reject',
): Promise<void> {
  const api = await client()
  await api.permission.reply(
    { sessionID: sessionId, requestID: permissionId, decision: response },
    { signal: AbortSignal.timeout(10_000) },
  )
}

export async function listForms(sessionId: string): Promise<FormRequest[]> {
  const api = await client()
  const forms = await api.session.form.list({ sessionID: sessionId }, { signal: AbortSignal.timeout(8_000) })
  return (forms ?? []).map((form) => ({ id: form.id, sessionID: form.sessionID }))
}

export async function cancelForm(sessionId: string, formId: string): Promise<void> {
  const api = await client()
  await api.session.form.cancel(
    { sessionID: sessionId, formID: formId },
    { signal: AbortSignal.timeout(10_000) },
  )
}

export function assistantErrorMessage(error: SessionMessageRow['info']['error']): string | null {
  if (!error) return null
  return error.message ?? error.data?.message ?? error.name ?? 'assistant error'
}
