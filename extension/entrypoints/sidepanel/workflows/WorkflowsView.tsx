import { useEffect, useMemo, useState } from 'react'
import type { ModelOption } from '../useOpencode'
import type { Workflow, WorkflowInput, WorkflowRun, WorkflowRunStatus } from '../../../lib/workflows/types'
import { describeSchedule, formatTimestampInZone, relativeTime } from '../../../lib/workflows/schedule'
import type { LayoutMode } from '../design/useLayoutMode'
import { AppBar } from '../shell/AppBar'
import { Badge, Button, EmptyState, IconButton, ListItem, Menu, MiniSwitch, Sheet } from '../design/primitives'
import { WorkflowEditor } from './WorkflowEditor'

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
    default:
      return 'Unknown'
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
    default:
      return 'help'
  }
}

function duration(run: WorkflowRun, now: number): string {
  if (!run.startedAt) return ''
  const seconds = Math.max(0, Math.round(((run.finishedAt ?? now) - run.startedAt) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

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

function WorkflowCard({
  workflow,
  runs,
  busy,
  now,
  onOpen,
  onToggle,
  onRun,
  onEdit,
  onHistory,
  onDelete,
}: {
  workflow: Workflow
  runs: WorkflowRun[]
  busy: string | null
  now: number
  onOpen: () => void
  onToggle: () => void
  onRun: () => void
  onEdit: () => void
  onHistory: () => void
  onDelete: () => void
}) {
  const latest =
    runs.find((run) => run.status === 'running' || run.status === 'waiting') ??
    runs.find((run) => run.status === 'queued') ??
    runs[0]
  const draft = workflow.source === 'agent' && !workflow.enabled

  return (
    <section className={`workflow-card${workflow.enabled ? '' : ' is-paused'}`}>
      <div className="workflow-card-top">
        <button type="button" className="workflow-card-main" onClick={onOpen}>
          <span className={`workflow-avatar${workflow.enabled ? ' is-active' : ''}`}>
            <span className="msym sm" aria-hidden="true">{workflow.enabled ? 'schedule' : 'schedule_send'}</span>
          </span>
          <span className="workflow-card-title">
            <strong>{workflow.name}</strong>
            <span>{describeSchedule(workflow.schedule, workflow.timezone)}</span>
          </span>
        </button>
        <MiniSwitch
          checked={workflow.enabled}
          onCheckedChange={onToggle}
          label={workflow.enabled ? `Disable ${workflow.name}` : `Enable ${workflow.name}`}
          disabled={busy === `toggle:${workflow.id}`}
        />
      </div>

      <div className="workflow-card-meta">
        <Badge tone={workflow.allowSubmissions ? 'warning' : 'neutral'} icon={workflow.allowSubmissions ? 'warning' : 'lock'}>
          {workflow.allowSubmissions ? 'Can submit' : 'Read-only'}
        </Badge>
        {draft ? <Badge tone="primary" icon="auto_awesome">Draft</Badge> : null}
        {workflow.enabled && workflow.nextRunAt ? (
          <span className="workflow-meta-text" title={formatTimestampInZone(workflow.nextRunAt, workflow.timezone)}>
            Next {relativeTime(workflow.nextRunAt, now)}
          </span>
        ) : draft ? (
          <span className="workflow-meta-text">Review before enabling</span>
        ) : (
          <span className="workflow-meta-text">Paused</span>
        )}
        {latest ? (
          <span className={`workflow-last workflow-last-${latest.status}`}>
            <span className="msym sm" aria-hidden="true">{statusIcon(latest.status)}</span>
            {statusLabel(latest.status)} {relativeTime(latest.finishedAt ?? latest.startedAt ?? latest.queuedAt, now)}
          </span>
        ) : null}
      </div>

      <div className="workflow-card-actions">
        {draft ? (
          <Button variant="tonal" size="sm" icon="edit" onClick={onEdit}>
            Review
          </Button>
        ) : (
          <Button
            variant="tonal"
            size="sm"
            icon="play_arrow"
            disabled={busy === `run:${workflow.id}`}
            onClick={onRun}
          >
            Run now
          </Button>
        )}
        <Menu
          label={`Actions for ${workflow.name}`}
          trigger={<IconButton icon="more_vert" label="Workflow actions" variant="ghost" size="sm" />}
          items={[
            { label: 'Edit', icon: 'edit', onSelect: onEdit },
            { label: 'Run history', icon: 'history', onSelect: onHistory },
            { label: 'Delete', icon: 'delete', destructive: true, onSelect: onDelete },
          ]}
        />
      </div>
    </section>
  )
}

export function WorkflowsView({
  mode,
  onMenu,
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
  mode: LayoutMode
  onMenu: () => void
  workflows: Workflow[]
  runs: WorkflowRun[]
  loaded: boolean
  activeRun: WorkflowRun | null
  models: ModelOption[]
  agents: Array<{ id: string; name: string; description?: string }>
  onCreate: (input: WorkflowInput) => Promise<Workflow>
  onUpdate: (id: string, input: WorkflowInput) => Promise<Workflow>
  onDelete: (id: string) => Promise<boolean>
  onRun: (id: string) => Promise<WorkflowRun>
  onStop: (runId?: string) => Promise<WorkflowRun | null>
  onOpenSession: (sessionId: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ workflow?: Workflow } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Workflow | null>(null)
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

  const sorted = useMemo(() => [...workflows].sort((a, b) => b.createdAt - a.createdAt), [workflows])
  const selected = selectedId ? workflows.find((workflow) => workflow.id === selectedId) ?? null : null
  const activeWorkflow = activeRun ? workflows.find((workflow) => workflow.id === activeRun.workflowId) : null
  const runsByWorkflow = useMemo(() => {
    const map = new Map<string, WorkflowRun[]>()
    for (const run of runs) {
      const list = map.get(run.workflowId) ?? []
      list.push(run)
      map.set(run.workflowId, list)
    }
    for (const list of map.values()) list.sort((a, b) => b.queuedAt - a.queuedAt)
    return map
  }, [runs])

  const act = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(null)
    }
  }

  const toggle = (workflow: Workflow) => {
    void act(`toggle:${workflow.id}`, () => onUpdate(workflow.id, { ...toInput(workflow), enabled: !workflow.enabled }))
  }

  const runNow = (workflow: Workflow) => {
    void act(`run:${workflow.id}`, async () => {
      await onRun(workflow.id)
      setSelectedId(workflow.id)
    })
  }

  const openDetail = (workflow: Workflow) => {
    setEditing(null)
    setSelectedId(workflow.id)
  }

  const openEditor = (workflow?: Workflow) => {
    setEditing({ workflow })
  }

  const closeOverlay = () => {
    setEditing(null)
    setSelectedId(null)
  }

  const saveEditor = async (input: WorkflowInput) => {
    if (editing?.workflow) {
      const saved = await onUpdate(editing.workflow.id, input)
      setSelectedId(saved.id)
    } else {
      const saved = await onCreate(input)
      setSelectedId(saved.id)
    }
    setEditing(null)
  }

  const detail = selected ? (
    <div className="workflow-detail">
      <header className="workflow-detail-head">
        <IconButton
          icon="arrow_back"
          label="Back to workflows"
          onClick={() => (mode === 'expanded' ? setSelectedId(null) : closeOverlay())}
        />
        <div>
          <h1>{selected.name}</h1>
          <span>{describeSchedule(selected.schedule, selected.timezone)}</span>
        </div>
        <Menu
          label="Workflow actions"
          trigger={<IconButton icon="more_vert" label="Workflow actions" variant="ghost" />}
          items={[
            { label: 'Edit', icon: 'edit', onSelect: () => openEditor(selected) },
            { label: 'Delete', icon: 'delete', destructive: true, onSelect: () => setConfirmDelete(selected) },
          ]}
        />
      </header>

      <div className="workflow-detail-scroll">
        <div className="workflow-detail-badges">
          <Badge tone={selected.allowSubmissions ? 'warning' : 'neutral'} icon={selected.allowSubmissions ? 'warning' : 'lock'}>
            {selected.allowSubmissions ? 'Can submit' : 'Read-only'}
          </Badge>
          <Badge tone={selected.enabled ? 'success' : 'neutral'} icon={selected.enabled ? 'schedule' : 'pause'}>
            {selected.enabled ? 'Scheduled' : 'Paused'}
          </Badge>
          {selected.source === 'agent' && !selected.enabled ? <Badge tone="primary" icon="auto_awesome">Draft</Badge> : null}
        </div>

        <div className="workflow-detail-actions">
          <Button icon="play_arrow" onClick={() => runNow(selected)} disabled={busy === `run:${selected.id}`}>
            Run now
          </Button>
          <Button variant="tonal" icon="edit" onClick={() => openEditor(selected)}>
            Edit
          </Button>
          <SwitchOrStatus workflow={selected} busy={busy} onToggle={() => toggle(selected)} />
        </div>

        <div className="workflow-detail-card">
          <div className="workflow-detail-label">Instruction</div>
          <p className="workflow-detail-prompt">{selected.prompt}</p>
        </div>

        <div className="workflow-detail-card">
          <div className="workflow-detail-label">Schedule</div>
          <div className="workflow-detail-grid">
            <span>Repeat</span>
            <strong>{describeSchedule(selected.schedule, selected.timezone)}</strong>
            <span>Next run</span>
            <strong>{selected.nextRunAt ? formatTimestampInZone(selected.nextRunAt, selected.timezone) : 'Paused'}</strong>
            <span>Start URL</span>
            <strong>{selected.startUrl || 'Active tab'}</strong>
            <span>Timeout</span>
            <strong>{selected.timeoutMinutes} minutes</strong>
          </div>
        </div>

        <div className="workflow-detail-card">
          <div className="workflow-detail-label">Recent runs</div>
          {(runsByWorkflow.get(selected.id) ?? []).length === 0 ? (
            <div className="sheet-empty">No runs yet.</div>
          ) : (
            <div className="run-list">
              {(runsByWorkflow.get(selected.id) ?? []).map((run) => (
                <ListItem
                  key={run.id}
                  leading={<span className={`msym sm run-icon run-icon-${run.status}`} aria-hidden="true">{statusIcon(run.status)}</span>}
                  headline={
                    <span className="run-headline">
                      {statusLabel(run.status)}
                      <span>{relativeTime(run.finishedAt ?? run.startedAt ?? run.queuedAt, now)}</span>
                    </span>
                  }
                  supporting={run.summary || run.error || (run.status === 'running' ? `Running for ${duration(run, now)}` : undefined)}
                  trailing={
                    run.sessionId ? (
                      <Button variant="text" size="sm" onClick={() => onOpenSession(run.sessionId!)}>
                        open
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  ) : (
    <EmptyState
      icon="schedule"
      title="Choose a workflow"
      description="Select a workflow to see its schedule, instruction, and run history."
      action={
        <Button icon="add" onClick={() => openEditor()}>
          New workflow
        </Button>
      }
    />
  )

  const editor = editing ? (
    <WorkflowEditor
      workflow={editing.workflow}
      models={models}
      agents={agents}
      onSave={saveEditor}
      onClose={() => {
        setEditing(null)
        if (mode !== 'expanded' && !selectedId) closeOverlay()
      }}
    />
  ) : null

  return (
    <div className="workflows-view">
      <AppBar
        title="Workflows"
        subtitle={workflows.length > 0 ? `${workflows.length} saved` : 'Scheduled browser tasks'}
        onMenu={mode === 'compact' ? onMenu : undefined}
        actions={
          <>
            <IconButton icon="add" label="New workflow" onClick={() => openEditor()} />
            {mode === 'expanded' && selected ? (
              <IconButton icon="close" label="Close detail" onClick={() => setSelectedId(null)} />
            ) : null}
          </>
        }
      />

      <div className={`workflows-body${sorted.length === 0 && mode === 'expanded' ? ' is-empty' : ''}`}>
        <div className="workflow-list-pane">
          {error ? (
            <div className="inline-notice is-error" role="alert">
              <span className="msym sm" aria-hidden="true">error</span>
              {error}
            </div>
          ) : null}

          {activeRun ? (
            <div className={`active-run active-run-${activeRun.status}`}>
              <span className={`msym run-icon run-icon-${activeRun.status}`} aria-hidden="true">{statusIcon(activeRun.status)}</span>
              <div className="active-run-body">
                <strong>{activeWorkflow?.name ?? activeRun.workflowName}</strong>
                <span>
                  {activeRun.status === 'queued'
                    ? 'Queued — starts after the current run'
                    : activeRun.status === 'waiting'
                      ? 'Waiting for your approval'
                      : `Running for ${duration(activeRun, now)}`}
                </span>
              </div>
              {activeRun.sessionId ? (
                <Button variant="text" size="sm" onClick={() => onOpenSession(activeRun.sessionId!)}>
                  open
                </Button>
              ) : null}
              <IconButton
                icon="stop_circle"
                label="Stop run"
                variant="ghost"
                onClick={() => void act(`stop:${activeRun.id}`, () => onStop(activeRun.id))}
                disabled={busy === `stop:${activeRun.id}`}
              />
            </div>
          ) : null}

          {!loaded ? (
            <div className="workflow-loading">Loading workflows…</div>
          ) : sorted.length === 0 ? (
            <EmptyState
              icon="schedule"
              title="No workflows yet"
              description="Describe a task once, then let it run on a schedule. Runs are read-only unless you allow submissions."
              action={
                <Button icon="add" onClick={() => openEditor()}>
                  New workflow
                </Button>
              }
            />
          ) : (
            <div className="workflow-list">
              {sorted.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  runs={runsByWorkflow.get(workflow.id) ?? []}
                  busy={busy}
                  now={now}
                  onOpen={() => openDetail(workflow)}
                  onToggle={() => toggle(workflow)}
                  onRun={() => runNow(workflow)}
                  onEdit={() => openEditor(workflow)}
                  onHistory={() => openDetail(workflow)}
                  onDelete={() => setConfirmDelete(workflow)}
                />
              ))}
            </div>
          )}
        </div>

        {mode === 'expanded' && sorted.length > 0 ? <div className="workflow-detail-pane">{editor ?? detail}</div> : null}
      </div>

      {mode !== 'expanded' && (editing || selectedId) ? (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) closeOverlay()
          }}
          side="right"
          hideHeader
          dismissible={!editing}
          title={editing ? (editing.workflow ? 'Edit workflow' : 'New workflow') : selected?.name ?? 'Workflow'}
          className="workflow-overlay-sheet"
          bodyClassName="workflow-overlay-body"
        >
          {editor ?? detail}
        </Sheet>
      ) : null}

      <Sheet
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null)
        }}
        side="center"
        title="Delete workflow?"
        description="This removes the workflow and its run history."
        footer={
          <>
            <Button variant="text" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="delete"
              onClick={() => {
                if (confirmDelete) {
                  void act(`delete:${confirmDelete.id}`, async () => {
                    await onDelete(confirmDelete.id)
                    if (selectedId === confirmDelete.id) setSelectedId(null)
                    setConfirmDelete(null)
                  })
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="sheet-copy">{confirmDelete?.name}</p>
      </Sheet>
    </div>
  )
}

function SwitchOrStatus({
  workflow,
  busy,
  onToggle,
}: {
  workflow: Workflow
  busy: string | null
  onToggle: () => void
}) {
  return (
    <div className="workflow-detail-switch">
      <span>{workflow.enabled ? 'Enabled' : 'Paused'}</span>
      <MiniSwitch
        checked={workflow.enabled}
        onCheckedChange={onToggle}
        label={workflow.enabled ? 'Pause workflow' : 'Enable workflow'}
        disabled={busy === `toggle:${workflow.id}`}
      />
    </div>
  )
}
