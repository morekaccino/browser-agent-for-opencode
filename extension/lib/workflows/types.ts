export type Schedule =
  | { kind: 'minutes'; every: number }
  | { kind: 'hours'; every: number }
  | { kind: 'daily'; time: string }
  | { kind: 'weekdays'; time: string; days: number[] }
  | { kind: 'monthly'; day: number; time: string }
  | { kind: 'cron'; expression: string }
  | { kind: 'once'; at: number }

export interface WorkflowModel {
  providerID: string
  modelID: string
  variant?: string
}

export interface Workflow {
  id: string
  name: string
  enabled: boolean
  prompt: string
  schedule: Schedule
  timezone: string
  nextRunAt: number | null
  model?: WorkflowModel | null
  agent?: string
  startUrl?: string
  autoApprovePermissions: boolean
  /** Allow unattended runs to submit forms, send messages, or post content. Defaults to false. */
  allowSubmissions?: boolean
  timeoutMinutes: number
  source: 'user' | 'agent'
  createdAt: number
  updatedAt: number
  lastRunId?: string
}

export type WorkflowRunStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'skipped'

export type WorkflowTrigger = 'schedule' | 'manual' | 'chat'

export interface WorkflowRun {
  id: string
  workflowId: string
  workflowName: string
  status: WorkflowRunStatus
  trigger: WorkflowTrigger
  scheduledFor?: number
  queuedAt: number
  startedAt?: number
  finishedAt?: number
  timeoutAt?: number
  retryUntil?: number
  sessionId?: string
  summary?: string
  error?: string
  cost?: number
  tokens?: number
  /** Set once the runner has claimed this run (prevents duplicate starts). */
  claimed?: boolean
  /** Chrome was closed mid-run; abort the session as soon as the server returns. */
  interrupted?: boolean
}

export interface WorkflowInput {
  name: string
  prompt: string
  schedule: Schedule
  timezone?: string
  model?: WorkflowModel | null
  agent?: string
  startUrl?: string
  autoApprovePermissions?: boolean
  allowSubmissions?: boolean
  timeoutMinutes?: number
  enabled?: boolean
}

export const WORKFLOW_ALARM = 'workflow-run'
export const WORKFLOW_WATCH_ALARM = 'workflow-watch'
export const WORKFLOW_RETRY_MS = 60_000
export const WORKFLOW_START_WINDOW_MS = 10 * 60_000
export const WORKFLOW_LATE_GRACE_MS = 5 * 60_000
export const WORKFLOW_DEFAULT_TIMEOUT_MINUTES = 30
export const WORKFLOW_MAX_RUNS = 200
export const WORKFLOW_MAX_RUNS_PER_WORKFLOW = 25
export const WORKFLOW_MAX_COUNT = 100
export const WORKFLOW_MAX_SUMMARY = 8_000
export const WORKFLOW_MAX_PROMPT = 20_000
export const WORKFLOW_MAX_NAME = 80
