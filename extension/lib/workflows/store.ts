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

let mutationChain: Promise<unknown> = Promise.resolve()

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
  return mutateRuns((runs) => {
    let updated: WorkflowRun | null = null
    const next = runs.map((run) => {
      if (run.id !== id) return run
      updated = { ...run, ...patch }
      return updated
    })
    return { runs: next, result: updated }
  })
}

export async function removeRunsForWorkflow(workflowId: string): Promise<void> {
  await mutateRuns((runs) => ({
    runs: runs.filter((run) => run.workflowId !== workflowId),
    result: undefined,
  }))
}
