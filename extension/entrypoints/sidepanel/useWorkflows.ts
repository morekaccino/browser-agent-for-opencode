import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Workflow, WorkflowInput, WorkflowRun } from '../../lib/workflows/types'
import { workflowRunsItem, workflowsItem } from '../../lib/workflows/store'
import { callBackground } from './rpc'

export interface WorkflowController {
  workflows: Workflow[]
  runs: WorkflowRun[]
  loaded: boolean
  activeRun: WorkflowRun | null
  drafts: Workflow[]
  refresh: () => Promise<void>
  create: (input: WorkflowInput) => Promise<Workflow>
  update: (id: string, input: WorkflowInput) => Promise<Workflow>
  remove: (id: string) => Promise<boolean>
  runNow: (id: string) => Promise<WorkflowRun>
  stop: (runId?: string) => Promise<WorkflowRun | null>
}

export function useWorkflows(): WorkflowController {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    const [nextWorkflows, nextRuns] = await Promise.all([
      workflowsItem.getValue(),
      workflowRunsItem.getValue(),
    ])
    setWorkflows(nextWorkflows ?? [])
    setRuns(nextRuns ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    void refresh().finally(() => {
      if (!cancelled) setLoaded(true)
    })
    const unwatchWorkflows = workflowsItem.watch((value) => setWorkflows(value ?? []))
    const unwatchRuns = workflowRunsItem.watch((value) => setRuns(value ?? []))
    return () => {
      cancelled = true
      unwatchWorkflows()
      unwatchRuns()
    }
  }, [refresh])

  const create = useCallback(
    (input: WorkflowInput) => callBackground<Workflow>('workflows.create', { input }),
    [],
  )
  const update = useCallback(
    (id: string, input: WorkflowInput) => callBackground<Workflow>('workflows.update', { id, input }),
    [],
  )
  const remove = useCallback(
    (id: string) => callBackground<boolean>('workflows.delete', { id }),
    [],
  )
  const runNow = useCallback(
    (id: string) => callBackground<WorkflowRun>('workflows.run', { id }),
    [],
  )
  const stop = useCallback(
    (runId?: string) => callBackground<WorkflowRun | null>('workflows.stop', runId ? { runId } : {}),
    [],
  )

  const activeRun = useMemo(
    () =>
      runs.find((run) => run.status === 'running' || run.status === 'waiting') ??
      runs.find((run) => run.status === 'queued') ??
      null,
    [runs],
  )

  const drafts = useMemo(
    () => workflows.filter((workflow) => workflow.source === 'agent' && !workflow.enabled),
    [workflows],
  )

  return {
    workflows,
    runs,
    loaded,
    activeRun,
    drafts,
    refresh,
    create,
    update,
    remove,
    runNow,
    stop,
  }
}
