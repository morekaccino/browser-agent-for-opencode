import { storage } from 'wxt/utils/storage'
import type { Workflow, WorkflowRun } from './types'
import { WORKFLOW_MAX_RUNS, WORKFLOW_MAX_RUNS_PER_WORKFLOW } from './types'

export const workflowsItem = storage.defineItem<Workflow[]>('local:workflows', {
  fallback: [],
  version: 1,
})

export const workflowRunsItem = storage.defineItem<WorkflowRun[]>('local:workflowRuns', {
  fallback: [],
  version: 1,
})

/**
 * Browser actions a workflow session is allowed to take. The runner sets this
 * before the prompt starts; the bridge reads it on every browser tool call.
 * It survives an extension reload; startup reconciliation and terminal run
 * updates remove stale entries.
 */
export interface WorkflowSessionPolicy {
  allowSubmissions: boolean
}

export const workflowSessionPoliciesItem = storage.defineItem<Record<string, WorkflowSessionPolicy>>(
  'local:workflowSessionPolicies',
  { fallback: {} },
)

let mutationChain: Promise<unknown> = Promise.resolve()
let policyChain: Promise<unknown> = Promise.resolve()

function withPolicyLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = policyChain.then(fn, fn)
  policyChain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

export async function setWorkflowSessionPolicy(sessionID: string, allowSubmissions: boolean): Promise<void> {
  if (!sessionID) return
  await withPolicyLock(async () => {
    const policies = (await workflowSessionPoliciesItem.getValue()) ?? {}
    policies[sessionID] = { allowSubmissions }
    await workflowSessionPoliciesItem.setValue(policies)
  })
}

export async function getWorkflowSessionPolicy(sessionID: string): Promise<WorkflowSessionPolicy | null> {
  if (!sessionID) return null
  const policies = (await workflowSessionPoliciesItem.getValue()) ?? {}
  return policies[sessionID] ?? null
}

export async function clearWorkflowSessionPolicy(sessionID: string): Promise<void> {
  if (!sessionID) return
  await withPolicyLock(async () => {
    const policies = (await workflowSessionPoliciesItem.getValue()) ?? {}
    if (!(sessionID in policies)) return
    delete policies[sessionID]
    await workflowSessionPoliciesItem.setValue(policies)
  }).catch(() => {})
}

export async function pruneWorkflowSessionPolicies(activeSessionIDs: Set<string>): Promise<void> {
  await withPolicyLock(async () => {
    const policies = (await workflowSessionPoliciesItem.getValue()) ?? {}
    let changed = false
    for (const sessionID of Object.keys(policies)) {
      if (activeSessionIDs.has(sessionID)) continue
      delete policies[sessionID]
      changed = true
    }
    if (changed) await workflowSessionPoliciesItem.setValue(policies)
  }).catch(() => {})
}

const TERMINAL_RUN_STATUSES = new Set<WorkflowRun['status']>(['succeeded', 'failed', 'cancelled', 'skipped'])

/** Serialize read-modify-write cycles inside the service worker. */
export function withWorkflowLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = mutationChain.then(fn, fn)
  mutationChain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

export async function readWorkflows(): Promise<Workflow[]> {
  return (await workflowsItem.getValue()) ?? []
}

export async function findWorkflow(id: string): Promise<Workflow | null> {
  const workflows = await readWorkflows()
  return workflows.find((workflow) => workflow.id === id) ?? null
}

export async function mutateWorkflows<T>(fn: (workflows: Workflow[]) => { workflows: Workflow[]; result: T }): Promise<T> {
  return withWorkflowLock(async () => {
    const current = (await workflowsItem.getValue()) ?? []
    const { workflows, result } = fn(current)
    await workflowsItem.setValue(workflows)
    return result
  })
}

export async function readRuns(): Promise<WorkflowRun[]> {
  return (await workflowRunsItem.getValue()) ?? []
}

export function pruneRuns(runs: WorkflowRun[]): WorkflowRun[] {
  const sorted = [...runs].sort((a, b) => b.queuedAt - a.queuedAt)
  const perWorkflow = new Map<string, number>()
  const kept: WorkflowRun[] = []
  for (const run of sorted) {
    const count = perWorkflow.get(run.workflowId) ?? 0
    if (count >= WORKFLOW_MAX_RUNS_PER_WORKFLOW) continue
    perWorkflow.set(run.workflowId, count + 1)
    kept.push(run)
    if (kept.length >= WORKFLOW_MAX_RUNS) break
  }
  return kept
}

export async function mutateRuns<T>(fn: (runs: WorkflowRun[]) => { runs: WorkflowRun[]; result: T }): Promise<T> {
  return withWorkflowLock(async () => {
    const current = (await workflowRunsItem.getValue()) ?? []
    const { runs, result } = fn(current)
    await workflowRunsItem.setValue(pruneRuns(runs))
    return result
  })
}

export async function appendRun(run: WorkflowRun): Promise<void> {
  await mutateRuns((runs) => {
    const next = runs.filter((entry) => entry.id !== run.id)
    next.unshift(run)
    return { runs: next, result: undefined }
  })
}

export async function updateRun(id: string, patch: Partial<WorkflowRun>): Promise<WorkflowRun | null> {
  const updated = await mutateRuns((runs) => {
    const next = runs.map((run) => (run.id === id ? { ...run, ...patch } : run))
    const result = next.find((run) => run.id === id) ?? null
    return { runs: next, result }
  })
  if (updated?.sessionId && patch.status && TERMINAL_RUN_STATUSES.has(patch.status)) {
    await clearWorkflowSessionPolicy(updated.sessionId)
  }
  return updated
}

export async function removeRunsForWorkflow(workflowId: string): Promise<void> {
  const removedSessions: string[] = []
  await mutateRuns((runs) => {
    for (const run of runs) {
      if (run.workflowId === workflowId && run.sessionId) removedSessions.push(run.sessionId)
    }
    return {
      runs: runs.filter((run) => run.workflowId !== workflowId),
      result: undefined,
    }
  })
  for (const sessionID of removedSessions) await clearWorkflowSessionPolicy(sessionID)
}
