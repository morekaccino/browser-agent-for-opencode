import { useEffect, useMemo, useState } from 'react'
import type { ModelOption } from '../useOpencode'
import type { Workflow, WorkflowInput, WorkflowRun, WorkflowRunStatus } from '../../../lib/workflows/types'
import { describeSchedule, formatTimestamp, formatTimestampInZone, relativeTime } from '../../../lib/workflows/schedule'
import { WorkflowEditor } from './WorkflowEditor'

function toInput(workflow: Workflow): WorkflowInput {
  return {
    name: workflow.name,
    prompt: workflow.prompt,
    schedule: workflow.schedule,
    timezone: workflow.timezone,
    model: workflow.model ?? null,
    agent: workflow.agent,
    startUrl: workflow.startUrl,
    autoApprovePermissions: workflow.autoApprovePermissions,
    allowSubmissions: workflow.allowSubmissions,
    timeoutMinutes: workflow.timeoutMinutes,
    enabled: workflow.enabled,
  }
}

function statusLabel(status: WorkflowRunStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'waiting':
      return 'Needs approval'
    case 'succeeded':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Stopped'
    case 'skipped':
      return 'Missed'
  }
}

function statusIcon(status: WorkflowRunStatus): string {
  switch (status) {
    case 'queued':
      return 'hourglass_top'
    case 'running':
      return 'progress_activity'
    case 'waiting':
      return 'pan_tool'
    case 'succeeded':
      return 'check_circle'
    case 'failed':
      return 'error'
    case 'cancelled':
      return 'stop_circle'
    case 'skipped':
      return 'skip_next'
  }
}

function isActive(status: WorkflowRunStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'waiting'
}

function duration(run: WorkflowRun, now: number): string {
  if (!run.startedAt) return ''
  const end = run.finishedAt ?? now
  const seconds = Math.max(0, Math.round((end - run.startedAt) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function WorkflowsView({
  workflows,
  runs,
  loaded,
  activeRun,
  models,
  agents,
  onCreate,
  onUpdate,
  onDelete,
  onRun,
  onStop,
  onOpenSession,
}: {
  workflows: Workflow[]
  runs: WorkflowRun[]
  loaded: boolean
  activeRun: WorkflowRun | null
  models: ModelOption[]
  agents: { id: string; name: string; description?: string }[]
  onCreate: (input: WorkflowInput) => Promise<Workflow>
  onUpdate: (id: string, input: WorkflowInput) => Promise<Workflow>
  onDelete: (id: string) => Promise<boolean>
  onRun: (id: string) => Promise<WorkflowRun>
  onStop: (runId?: string) => Promise<WorkflowRun | null>
  onOpenSession: (sessionId: string) => void
}) {
  const [editing, setEditing] = useState<{ workflow?: Workflow } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 7000)
    return () => clearTimeout(timer)
  }, [error])

  const sorted = useMemo(
    () => [...workflows].sort((a, b) => b.createdAt - a.createdAt),
    [workflows],
  )

  const runsByWorkflow = useMemo(() => {
    const map = new Map<string, WorkflowRun[]>()
    for (const run of [...runs].sort((a, b) => b.queuedAt - a.queuedAt)) {
      const list = map.get(run.workflowId) ?? []
      list.push(run)
      map.set(run.workflowId, list)
    }
    return map
  }, [runs])

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError))
    } finally {
      setBusy(null)
    }
  }

  const toggle = (workflow: Workflow) =>
    act(`toggle:${workflow.id}`, () =>
      onUpdate(workflow.id, { ...toInput(workflow), enabled: !workflow.enabled }),
    )

  const runNow = (workflow: Workflow) =>
    act(`run:${workflow.id}`, async () => {
      await onRun(workflow.id)
      setExpanded(workflow.id)
    })

  const deleteWorkflow = (workflow: Workflow) => {
    if (confirmDelete !== workflow.id) {
      setConfirmDelete(workflow.id)
      return
    }
    setConfirmDelete(null)
    void act(`delete:${workflow.id}`, () => onDelete(workflow.id))
  }

  const saveEditor = async (input: WorkflowInput) => {
    if (editing?.workflow) await onUpdate(editing.workflow.id, input)
    else await onCreate(input)
  }

  const activeWorkflow = activeRun ? workflows.find((workflow) => workflow.id === activeRun.workflowId) : null

  return (
    <div className="workflows-view">
      <div className="workflows-head">
        <div>
          <h1>Workflows</h1>
          <p>Run an instruction on a schedule — even when this panel is closed.</p>
        </div>
        <button className="primary wf-new" onClick={() => setEditing({})}>
          <span className="msym sm" aria-hidden="true">
            add
          </span>
          New
        </button>
      </div>

      {error && (
        <div className="banner error small" role="alert">
          {error}
        </div>
      )}

      {activeRun && (
        <div className={`active-run ${activeRun.status}`}>
          <span className={`msym run-icon ${activeRun.status}`} aria-hidden="true">
            {statusIcon(activeRun.status)}
          </span>
          <div className="active-run-body">
            <strong>{activeWorkflow?.name ?? activeRun.workflowName}</strong>
            <span>
              {activeRun.status === 'queued'
                ? (activeRun.error ?? 'Queued — starts when the current run finishes')
                : activeRun.status === 'waiting'
                  ? 'Waiting for permission approval'
                  : `Running for ${duration(activeRun, now)}`}
            </span>
          </div>
          {activeRun.sessionId && (
            <button className="btn-tonal compact" onClick={() => onOpenSession(activeRun.sessionId!)}>
              open
            </button>
          )}
          <button
            className="btn-tonal compact danger-text"
            disabled={busy === `stop:${activeRun.id}`}
            onClick={() => void act(`stop:${activeRun.id}`, () => onStop(activeRun.id))}
          >
            stop
          </button>
        </div>
      )}

      {!loaded ? (
        <div className="workflows-loading">loading workflows…</div>
      ) : sorted.length === 0 ? (
        <div className="empty workflows-empty">
          <span className="msym">schedule</span>
          <p>No workflows yet. Describe a task and choose when it should run.</p>
          <button className="primary" onClick={() => setEditing({})}>
            New workflow
          </button>
        </div>
      ) : (
        <div className="workflow-list">
          {sorted.map((workflow) => {
            const workflowRuns = runsByWorkflow.get(workflow.id) ?? []
            const latest =
              workflowRuns.find((run) => run.status === 'running' || run.status === 'waiting') ??
              workflowRuns.find((run) => run.status === 'queued') ??
              workflowRuns[0]
            const current = workflowRuns.find((run) => isActive(run.status))
            const draft = workflow.source === 'agent' && !workflow.enabled
            const open = expanded === workflow.id

            return (
              <section key={workflow.id} className={`workflow-card${workflow.enabled ? '' : ' paused'}`}>
                <div className="workflow-card-head">
                  <span className="msym workflow-icon" aria-hidden="true">
                    {workflow.enabled ? 'schedule' : 'schedule_send'}
                  </span>
                  <div className="workflow-title">
                    <strong>{workflow.name}</strong>
                    <span className="workflow-sub">
                      {describeSchedule(workflow.schedule, workflow.timezone)}
                    </span>
                  </div>
                  {draft ? (
                    <span className="workflow-badge draft">Draft</span>
                  ) : (
                    <button
                      className={`wf-switch${workflow.enabled ? ' on' : ''}`}
                      role="switch"
                      aria-checked={workflow.enabled}
                      aria-label={`${workflow.enabled ? 'Disable' : 'Enable'} ${workflow.name}`}
                      title={workflow.enabled ? 'Disable schedule' : 'Enable schedule'}
                      disabled={busy === `toggle:${workflow.id}`}
                      onClick={() => void toggle(workflow)}
                    >
                      <span />
                    </button>
                  )}
                </div>

                <div className="workflow-meta">
                  <span className={`workflow-badge ${workflow.allowSubmissions ? 'submit' : 'readonly'}`}>
                    {workflow.allowSubmissions ? 'Can submit' : 'Read-only'}
                  </span>
                  {workflow.enabled && workflow.nextRunAt ? (
                    <span title={formatTimestampInZone(workflow.nextRunAt, workflow.timezone)}>
                      Next {relativeTime(workflow.nextRunAt, now)}
                    </span>
                  ) : draft ? (
                    <span>Review and enable to schedule</span>
                  ) : (
                    <span>Paused</span>
                  )}
                  {latest && (
                    <span className={`workflow-last ${latest.status}`}>
                      <span className="msym sm" aria-hidden="true">
                        {statusIcon(latest.status)}
                      </span>
                      {statusLabel(latest.status)}{' '}
                      {relativeTime(latest.finishedAt ?? latest.startedAt ?? latest.queuedAt, now)}
                    </span>
                  )}
                </div>

                <div className="workflow-actions">
                  {draft ? (
                    <button className="btn-tonal compact" onClick={() => setEditing({ workflow })}>
                      Review
                    </button>
                  ) : (
                    <button
                      className="btn-tonal compact"
                      disabled={busy === `run:${workflow.id}`}
                      onClick={() => void runNow(workflow)}
                      title="Run this workflow now"
                    >
                      <span className="msym sm" aria-hidden="true">
                        play_arrow
                      </span>
                      Run now
                    </button>
                  )}
                  {current && (
                    <button
                      className="btn-tonal compact"
                      disabled={busy === `stop:${current.id}`}
                      onClick={() => void act(`stop:${current.id}`, () => onStop(current.id))}
                    >
                      stop
                    </button>
                  )}
                  <button className="icon-btn tiny" title="Edit" aria-label="Edit workflow" onClick={() => setEditing({ workflow })}>
                    <span className="msym sm" aria-hidden="true">
                      edit
                    </span>
                  </button>
                  <button
                    className="icon-btn tiny"
                    title="Run history"
                    aria-label="Toggle run history"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : workflow.id)}
                  >
                    <span className="msym sm" aria-hidden="true">
                      history
                    </span>
                  </button>
                  <button
                    className={`icon-btn tiny${confirmDelete === workflow.id ? ' danger' : ''}`}
                    title={confirmDelete === workflow.id ? 'Click again to delete' : 'Delete'}
                    aria-label={confirmDelete === workflow.id ? 'Confirm delete workflow' : 'Delete workflow'}
                    onBlur={() => setConfirmDelete(null)}
                    onClick={() => deleteWorkflow(workflow)}
                  >
                    <span className="msym sm" aria-hidden="true">
                      {confirmDelete === workflow.id ? 'delete_forever' : 'delete'}
                    </span>
                  </button>
                </div>

                {confirmDelete === workflow.id && (
                  <div className="workflow-confirm">Click delete again to remove this workflow and its history.</div>
                )}

                {open && (
                  <div className="run-list">
                    {workflowRuns.length === 0 ? (
                      <div className="run-empty">No runs yet.</div>
                    ) : (
                      workflowRuns.slice(0, 6).map((run) => (
                        <div key={run.id} className={`run-row ${run.status}`}>
                          <span className={`msym run-icon ${run.status}`} aria-hidden="true">
                            {statusIcon(run.status)}
                          </span>
                          <div className="run-body">
                            <div className="run-line">
                              <strong>{statusLabel(run.status)}</strong>
                              <span>
                                {run.trigger === 'manual'
                                  ? 'manual'
                                  : run.trigger === 'chat'
                                    ? 'from chat'
                                    : 'scheduled'}
                                {' · '}
                                {formatTimestamp(run.finishedAt ?? run.startedAt ?? run.queuedAt)}
                                {run.startedAt && run.finishedAt ? ` · ${duration(run, now)}` : ''}
                              </span>
                            </div>
                            {(run.error || run.summary) && (
                              <p className="run-summary">{run.error ?? run.summary}</p>
                            )}
                          </div>
                          {run.sessionId && (
                            <button
                              className="icon-btn tiny"
                              title="Open the run session"
                              aria-label="Open the run session"
                              onClick={() => onOpenSession(run.sessionId!)}
                            >
                              <span className="msym sm" aria-hidden="true">
                                open_in_new
                              </span>
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {editing && (
        <WorkflowEditor
          workflow={editing.workflow}
          models={models}
          agents={agents}
          onSave={saveEditor}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
