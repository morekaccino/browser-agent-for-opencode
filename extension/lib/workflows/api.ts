import { findWorkflow, mutateWorkflows, readRuns, readWorkflows, removeRunsForWorkflow } from './store'
import { nextRun, parseTime, systemTimezone, validateSchedule } from './schedule'
import { kick, runWorkflowNow, scheduleAlarms, stopWorkflowRun } from './runner'
import type { Schedule, Workflow, WorkflowInput, WorkflowModel, WorkflowRun } from './types'
import {
  WORKFLOW_DEFAULT_TIMEOUT_MINUTES,
  WORKFLOW_MAX_COUNT,
  WORKFLOW_MAX_NAME,
  WORKFLOW_MAX_PROMPT,
} from './types'

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `id_${Date.now()}_${Math.random().toString(36).slice(2)}`
  }
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function asString(value: unknown, label: string, max: number, required = true): string {
  if (value == null) {
    if (required) throw new Error(`${label} is required`)
    return ''
  }
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  const trimmed = value.trim()
  if (required && !trimmed) throw new Error(`${label} is required`)
  if (trimmed.length > max) throw new Error(`${label} is too long (max ${max})`)
  return trimmed
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a number`)
  return value
}

function normalizeSchedule(raw: unknown): Schedule {
  const input = asObject(raw, 'schedule')
  const kind = input.kind
  switch (kind) {
    case 'minutes':
      return { kind: 'minutes', every: Math.floor(asNumber(input.every, 'schedule.every')) }
    case 'hours':
      return { kind: 'hours', every: Math.floor(asNumber(input.every, 'schedule.every')) }
    case 'daily': {
      const time = asString(input.time, 'schedule.time', 10)
      if (!parseTime(time)) throw new Error('schedule.time must be HH:MM')
      return { kind: 'daily', time }
    }
    case 'weekdays': {
      const time = asString(input.time, 'schedule.time', 10)
      if (!parseTime(time)) throw new Error('schedule.time must be HH:MM')
      if (!Array.isArray(input.days)) throw new Error('schedule.days must be an array')
      const days = [...new Set(input.days.map((day) => Math.floor(asNumber(day, 'schedule.days'))))].sort(
        (a, b) => a - b,
      )
      return { kind: 'weekdays', time, days }
    }
    case 'monthly': {
      const time = asString(input.time, 'schedule.time', 10)
      if (!parseTime(time)) throw new Error('schedule.time must be HH:MM')
      return {
        kind: 'monthly',
        day: Math.floor(asNumber(input.day, 'schedule.day')),
        time,
      }
    }
    case 'cron':
      return { kind: 'cron', expression: asString(input.expression, 'schedule.expression', 120) }
    case 'once': {
      const at =
        typeof input.at === 'string'
          ? Date.parse(input.at)
          : asNumber(input.at, 'schedule.at')
      if (!Number.isFinite(at)) throw new Error('schedule.at must be a timestamp')
      return { kind: 'once', at }
    }
    default:
      throw new Error(`unknown schedule kind: ${String(kind)}`)
  }
}

function normalizeModel(raw: unknown): WorkflowModel | null {
  if (raw == null) return null
  const input = asObject(raw, 'model')
  const providerID = asString(input.providerID, 'model.providerID', 120)
  const modelID = asString(input.modelID, 'model.modelID', 200)
  const variant = typeof input.variant === 'string' && input.variant.trim() ? input.variant.trim() : undefined
  return { providerID, modelID, ...(variant ? { variant } : {}) }
}

function computedNext(
  schedule: Schedule,
  timezone: string,
  now: number,
): number | null {
  const next = nextRun(schedule, timezone, now)
  if (next == null) throw new Error('this schedule has no upcoming run')
  return next
}

interface BuildOptions {
  agentDraft?: boolean
  existing?: Workflow | null
}

function buildWorkflow(raw: unknown, options: BuildOptions = {}): Workflow {
  const input = asObject(raw, 'workflow') as unknown as WorkflowInput
  const now = Date.now()
  const existing = options.existing ?? null

  const name = asString(input.name, 'name', WORKFLOW_MAX_NAME)
  const prompt = asString(input.prompt, 'prompt', WORKFLOW_MAX_PROMPT)
  const schedule = normalizeSchedule(input.schedule)
  const timezone =
    typeof input.timezone === 'string' && input.timezone.trim()
      ? input.timezone.trim()
      : existing?.timezone ?? systemTimezone()

  const enabled = options.agentDraft ? false : (input.enabled ?? existing?.enabled ?? true)
  let scheduleError = validateSchedule(schedule, timezone)
  // A spent one-time schedule stays editable while the workflow is disabled.
  // Re-enabling it still requires a future date (enabled is true in that case).
  if (
    scheduleError &&
    !enabled &&
    schedule.kind === 'once' &&
    existing &&
    JSON.stringify(existing.schedule) === JSON.stringify(schedule)
  ) {
    scheduleError = null
  }
  if (scheduleError) throw new Error(scheduleError)

  const model = input.model === undefined ? (existing?.model ?? null) : normalizeModel(input.model)
  const agent =
    input.agent === undefined
      ? existing?.agent
      : typeof input.agent === 'string' && input.agent.trim()
        ? input.agent.trim()
        : undefined
  const startUrl =
    input.startUrl === undefined
      ? existing?.startUrl
      : typeof input.startUrl === 'string' && input.startUrl.trim()
        ? input.startUrl.trim()
        : undefined
  const autoApprovePermissions =
    typeof input.autoApprovePermissions === 'boolean'
      ? input.autoApprovePermissions
      : existing?.autoApprovePermissions ?? true
  const allowSubmissions =
    typeof input.allowSubmissions === 'boolean'
      ? input.allowSubmissions
      : existing?.allowSubmissions ?? false
  const timeoutMinutes = Math.min(
    Math.max(
      Math.floor(
        typeof input.timeoutMinutes === 'number' && Number.isFinite(input.timeoutMinutes)
          ? input.timeoutMinutes
          : existing?.timeoutMinutes ?? WORKFLOW_DEFAULT_TIMEOUT_MINUTES,
      ),
      1,
    ),
    180,
  )

  const scheduleChanged =
    !existing ||
    JSON.stringify(existing.schedule) !== JSON.stringify(schedule) ||
    existing.timezone !== timezone
  const wasDisabled = existing ? !existing.enabled : false

  let nextRunAt: number | null
  if (!enabled) {
    nextRunAt = null
  } else if (scheduleChanged || wasDisabled || existing?.nextRunAt == null) {
    nextRunAt = computedNext(schedule, timezone, now)
  } else {
    nextRunAt = existing.nextRunAt
  }

  return {
    id: existing?.id ?? newId(),
    name,
    enabled,
    prompt,
    schedule,
    timezone,
    nextRunAt,
    model,
    agent,
    startUrl,
    autoApprovePermissions,
    allowSubmissions,
    timeoutMinutes,
    source: options.agentDraft ? 'agent' : (existing?.source ?? 'user'),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastRunId: existing?.lastRunId,
  }
}

async function createWorkflow(raw: unknown, agentDraft: boolean): Promise<Workflow> {
  const workflow = buildWorkflow(raw, { agentDraft })
  const existing = await readWorkflows()
  if (existing.length >= WORKFLOW_MAX_COUNT) {
    throw new Error(`too many workflows (max ${WORKFLOW_MAX_COUNT}) — delete one first`)
  }
  await mutateWorkflows((workflows) => ({
    workflows: [workflow, ...workflows],
    result: undefined,
  }))
  await scheduleAlarms()
  kick()
  return workflow
}

async function updateWorkflow(id: string, raw: unknown, agentDraft: boolean): Promise<Workflow> {
  const existing = await findWorkflow(id)
  if (!existing) throw new Error('workflow not found')
  if (agentDraft && (existing.source !== 'agent' || existing.enabled)) {
    throw new Error('only disabled agent-created workflows can be updated; ask the user to edit this workflow')
  }

  const patch =
    raw && typeof raw === 'object' && !Array.isArray(raw) && 'input' in (raw as Record<string, unknown>)
      ? (raw as { input: unknown }).input
      : raw
  const merged = { ...existing, ...(patch as Record<string, unknown>) }
  const updated = buildWorkflow(merged, { existing, agentDraft })
  // Once the user reviews and enables an agent-created draft, it becomes a
  // normal user workflow (the agent can no longer edit it).
  if (!agentDraft && existing.source === 'agent' && updated.enabled) updated.source = 'user'

  await mutateWorkflows((workflows) => ({
    workflows: workflows.map((workflow) => (workflow.id === id ? updated : workflow)),
    result: undefined,
  }))
  await scheduleAlarms()
  kick()
  return updated
}

async function deleteWorkflow(id: string): Promise<boolean> {
  const existing = await findWorkflow(id)
  if (!existing) throw new Error('workflow not found')

  const runs = await readRuns()
  const active = runs.find(
    (run) =>
      run.workflowId === id &&
      (run.status === 'queued' || run.status === 'running' || run.status === 'waiting'),
  )
  if (active) await stopWorkflowRun(active.id)

  await mutateWorkflows((workflows) => ({
    workflows: workflows.filter((workflow) => workflow.id !== id),
    result: undefined,
  }))
  await removeRunsForWorkflow(id)
  await scheduleAlarms()
  return true
}

function formatRuns(runs: WorkflowRun[], limit: number): WorkflowRun[] {
  return [...runs].sort((a, b) => b.queuedAt - a.queuedAt).slice(0, Math.min(Math.max(limit, 1), 200))
}

export async function handleWorkflowRequest(
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  switch (method) {
    case 'workflows.list':
      return readWorkflows()

    case 'workflows.get': {
      const id = asString(params.id, 'id', 100)
      const workflow = await findWorkflow(id)
      if (!workflow) throw new Error('workflow not found')
      return workflow
    }

    case 'workflows.create':
      return createWorkflow(params.input, false)

    case 'workflows.update': {
      const id = asString(params.id, 'id', 100)
      return updateWorkflow(id, params.input, false)
    }

    case 'workflows.delete': {
      const id = asString(params.id, 'id', 100)
      return deleteWorkflow(id)
    }

    case 'workflows.run': {
      const id = asString(params.id, 'id', 100)
      return runWorkflowNow(id, 'manual')
    }

    case 'workflows.stop': {
      const runId = typeof params.runId === 'string' && params.runId ? params.runId : undefined
      return stopWorkflowRun(runId)
    }

    case 'workflows.runs': {
      const workflowId = typeof params.workflowId === 'string' ? params.workflowId : undefined
      const limit = typeof params.limit === 'number' ? params.limit : 100
      const runs = await readRuns()
      return formatRuns(
        workflowId ? runs.filter((run) => run.workflowId === workflowId) : runs,
        limit,
      )
    }

    // Agent-facing methods. Draft workflows are always disabled until the user
    // reviews and enables them in the side panel.
    case 'workflows.createDraft':
      return createWorkflow(params.input, true)

    case 'workflows.updateDraft': {
      const id = asString(params.id, 'id', 100)
      return updateWorkflow(id, params.input, true)
    }

    default:
      throw new Error(`unknown workflow method: ${method}`)
  }
}
