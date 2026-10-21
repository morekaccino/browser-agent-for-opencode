import { useMemo, useState } from 'react'
import type { ModelOption } from '../useOpencode'
import type { Schedule, Workflow, WorkflowInput } from '../../../lib/workflows/types'
import {
  formatTimestampInZone,
  nextRuns,
  systemTimezone,
  validateSchedule,
} from '../../../lib/workflows/schedule'

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_TITLES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function toLocalInput(ms: number): string {
  const date = new Date(ms)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function fromLocalInput(value: string): number {
  return new Date(value).getTime()
}

interface FormState {
  name: string
  prompt: string
  timezone: string
  kind: Schedule['kind']
  every: number
  time: string
  days: number[]
  monthDay: number
  cron: string
  onceAt: string
  modelValue: string
  agent: string
  startUrl: string
  autoApprove: boolean
  allowSubmissions: boolean
  timeout: number
  enabled: boolean
}

function initialForm(workflow?: Workflow): FormState {
  const schedule = workflow?.schedule ?? { kind: 'daily', time: '09:00' }
  return {
    name: workflow?.name ?? '',
    prompt: workflow?.prompt ?? '',
    timezone: workflow?.timezone ?? systemTimezone(),
    kind: schedule.kind,
    every: schedule.kind === 'minutes' || schedule.kind === 'hours' ? schedule.every : 30,
    time:
      schedule.kind === 'daily' || schedule.kind === 'weekdays' || schedule.kind === 'monthly'
        ? schedule.time
        : '09:00',
    days: schedule.kind === 'weekdays' ? [...schedule.days] : [1, 2, 3, 4, 5],
    monthDay: schedule.kind === 'monthly' ? schedule.day : 1,
    cron: schedule.kind === 'cron' ? schedule.expression : '0 9 * * 1-5',
    onceAt: toLocalInput(schedule.kind === 'once' ? schedule.at : Date.now() + 60 * 60_000),
    modelValue: workflow?.model ? `${workflow.model.providerID}/${workflow.model.modelID}` : '',
    agent: workflow?.agent ?? '',
    startUrl: workflow?.startUrl ?? '',
    autoApprove: workflow?.autoApprovePermissions ?? true,
    allowSubmissions: workflow?.allowSubmissions ?? false,
    timeout: workflow?.timeoutMinutes ?? 30,
    enabled: workflow?.enabled ?? true,
  }
}

export function WorkflowEditor({
  workflow,
  models,
  agents,
  onSave,
  onClose,
}: {
  workflow?: Workflow
  models: ModelOption[]
  agents: { id: string; name: string; description?: string }[]
  onSave: (input: WorkflowInput) => Promise<void>
  onClose: () => void
}) {
  const initial = useMemo(() => initialForm(workflow), [workflow])
  const [form, setForm] = useState<FormState>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const schedule = useMemo<Schedule>(() => {
    switch (form.kind) {
      case 'minutes':
        return { kind: 'minutes', every: Number(form.every) || 0 }
      case 'hours':
        return { kind: 'hours', every: Number(form.every) || 0 }
      case 'daily':
        return { kind: 'daily', time: form.time }
      case 'weekdays':
        return { kind: 'weekdays', time: form.time, days: form.days }
      case 'monthly':
        return { kind: 'monthly', day: Number(form.monthDay) || 0, time: form.time }
      case 'cron':
        return { kind: 'cron', expression: form.cron }
      case 'once':
        return { kind: 'once', at: fromLocalInput(form.onceAt) }
    }
  }, [form.kind, form.every, form.time, form.days, form.monthDay, form.cron, form.onceAt])

  const scheduleError = useMemo(() => {
    const error = validateSchedule(schedule, form.timezone.trim() || systemTimezone())
    if (
      error &&
      !form.enabled &&
      schedule.kind === 'once' &&
      workflow?.schedule.kind === 'once' &&
      workflow.schedule.at === schedule.at
    ) {
      return null
    }
    return error
  }, [schedule, form.timezone, form.enabled, workflow])
  const previews = useMemo(
    () => (scheduleError ? [] : nextRuns(schedule, form.timezone.trim() || systemTimezone(), 3)),
    [schedule, form.timezone, scheduleError],
  )

  const dirty = useMemo(() => {
    const current = {
      ...form,
      days: [...form.days].sort((a, b) => a - b),
    }
    const original = {
      ...initial,
      days: [...initial.days].sort((a, b) => a - b),
    }
    return JSON.stringify(current) !== JSON.stringify(original)
  }, [form, initial])

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  const save = async () => {
    setError(null)
    if (!form.name.trim()) {
      setError('name is required')
      return
    }
    if (!form.prompt.trim()) {
      setError('instructions are required')
      return
    }
    if (scheduleError) {
      setError(scheduleError)
      return
    }

    const selectedModel = models.find(
      (option) => option.value === form.modelValue,
    )
    const model = form.modelValue
      ? selectedModel
        ? {
            providerID: selectedModel.providerID,
            modelID: selectedModel.modelID,
            ...(workflow?.model &&
            workflow.model.providerID === selectedModel.providerID &&
            workflow.model.modelID === selectedModel.modelID &&
            workflow.model.variant
              ? { variant: workflow.model.variant }
              : {}),
          }
        : undefined
      : null

    const input: WorkflowInput = {
      name: form.name.trim(),
      prompt: form.prompt.trim(),
      schedule,
      timezone: form.timezone.trim() || systemTimezone(),
      model,
      agent: form.agent.trim(),
      startUrl: form.startUrl.trim(),
      autoApprovePermissions: form.autoApprove,
      allowSubmissions: form.allowSubmissions,
      timeoutMinutes: Math.min(Math.max(Math.floor(Number(form.timeout) || 30), 1), 180),
      enabled: form.enabled,
    }

    setSaving(true)
    try {
      await onSave(input)
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  const toggleDay = (day: number) => {
    setForm((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((entry) => entry !== day)
        : [...current.days, day].sort((a, b) => a - b),
    }))
  }

  return (
    <div className="drawer">
      <div className="drawer-head">
        <strong>{workflow ? 'Edit workflow' : 'New workflow'}</strong>
        <button className="icon-btn" onClick={requestClose} title="Close" aria-label="Close workflow editor">
          <span className="msym" aria-hidden="true">
            close
          </span>
        </button>
      </div>

      {workflow?.source === 'agent' && !workflow.enabled ? (
        <div className="banner warn small">
          This workflow was drafted from chat. Review the instructions before enabling it.
        </div>
      ) : null}

      <div className="section-title">Task</div>

      <label className="field">
        <span>name</span>
        <input
          value={form.name}
          onChange={(event) => set('name', event.target.value)}
          placeholder="Daily project check"
          maxLength={80}
          autoFocus
        />
      </label>

      <label className="field">
        <span>instructions</span>
        <textarea
          className="workflow-textarea"
          value={form.prompt}
          onChange={(event) => set('prompt', event.target.value)}
          placeholder="Open the project dashboard, check for failed builds or new issues, and summarize what needs attention."
          rows={6}
          maxLength={20000}
        />
        <em>
          The workflow runs unattended with the tools you normally have. The prompt should be self-contained — it cannot
          ask you questions while it runs.
        </em>
      </label>

      <div className="section-title">Schedule</div>

      <label className="field">
        <span>repeat</span>
        <select
          className="workflow-select"
          value={form.kind}
          onChange={(event) => set('kind', event.target.value as Schedule['kind'])}
        >
          <option value="minutes">Every N minutes</option>
          <option value="hours">Every N hours</option>
          <option value="daily">Daily</option>
          <option value="weekdays">Specific days of the week</option>
          <option value="monthly">Monthly</option>
          <option value="cron">Custom cron</option>
          <option value="once">Once</option>
        </select>
      </label>

      {(form.kind === 'minutes' || form.kind === 'hours') && (
        <label className="field">
          <span>every</span>
          <div className="inline-field">
            <input
              type="number"
              min={1}
              max={form.kind === 'minutes' ? 1440 : 24}
              value={form.every}
              onChange={(event) => set('every', Number(event.target.value))}
            />
            <span>{form.kind}</span>
          </div>
        </label>
      )}

      {(form.kind === 'daily' || form.kind === 'weekdays' || form.kind === 'monthly') && (
        <label className="field">
          <span>time</span>
          <input type="time" value={form.time} onChange={(event) => set('time', event.target.value)} />
        </label>
      )}

      {form.kind === 'weekdays' && (
        <div className="field">
          <span>days</span>
          <div className="days-row">
            {DAY_LABELS.map((label, day) => (
              <button
                key={day}
                type="button"
                className={`day-chip${form.days.includes(day) ? ' selected' : ''}`}
                aria-pressed={form.days.includes(day)}
                title={DAY_TITLES[day]}
                onClick={() => toggleDay(day)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {form.kind === 'monthly' && (
        <label className="field">
          <span>day of month</span>
          <input
            type="number"
            min={1}
            max={31}
            value={form.monthDay}
            onChange={(event) => set('monthDay', Number(event.target.value))}
          />
          <em>Months without this day are skipped.</em>
        </label>
      )}

      {form.kind === 'cron' && (
        <label className="field">
          <span>cron expression</span>
          <input
            value={form.cron}
            onChange={(event) => set('cron', event.target.value)}
            placeholder="0 9 * * 1-5"
            spellCheck={false}
          />
          <em>Standard 5-field cron: minute hour day-of-month month day-of-week.</em>
        </label>
      )}

      {form.kind === 'once' && (
        <label className="field">
          <span>date and time</span>
          <input
            type="datetime-local"
            value={form.onceAt}
            onChange={(event) => set('onceAt', event.target.value)}
          />
        </label>
      )}

      <label className="field">
        <span>timezone</span>
        <div className="inline-field">
          <input
            value={form.timezone}
            onChange={(event) => set('timezone', event.target.value)}
            placeholder="Europe/Berlin"
          />
          <button type="button" className="btn-tonal" onClick={() => set('timezone', systemTimezone())}>
            system
          </button>
        </div>
      </label>

      <div className="schedule-preview">
        {scheduleError ? (
          <span className="form-error">{scheduleError}</span>
        ) : (
          <>
            <span className="schedule-preview-label">Next runs</span>
            <ul>
              {previews.map((at) => (
                <li key={at}>{formatTimestampInZone(at, form.timezone.trim() || systemTimezone())}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="section-title">Run options</div>

      <label className="field">
        <span>model</span>
        <select
          className="workflow-select"
          value={form.modelValue}
          onChange={(event) => set('modelValue', event.target.value)}
        >
          <option value="">Default (last used)</option>
          {models.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>agent</span>
        <select
          className="workflow-select"
          value={form.agent}
          onChange={(event) => set('agent', event.target.value)}
        >
          <option value="">Default (last used)</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
              {agent.description ? ` — ${agent.description}` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>start URL (optional)</span>
        <input
          value={form.startUrl}
          onChange={(event) => set('startUrl', event.target.value)}
          placeholder="https://example.com/dashboard"
        />
      </label>

      <label className="field">
        <span>timeout (minutes)</span>
        <input
          type="number"
          min={1}
          max={180}
          value={form.timeout}
          onChange={(event) => set('timeout', Number(event.target.value))}
        />
        <em>The run is stopped and marked failed after this long.</em>
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={form.autoApprove}
          onChange={(event) => set('autoApprove', event.target.checked)}
        />
        <span>
          Auto-approve permission prompts
          <em>
            Unattended runs cannot answer prompts. Leave this on for hands-off workflows; when off, a run pauses until
            you open its session and approve.
          </em>
        </span>
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={form.allowSubmissions}
          onChange={(event) => set('allowSubmissions', event.target.checked)}
        />
        <span>
          Allow submissions and messages
          <em>
            Workflows are read-only by default. Enable this only for tasks that may submit forms, send messages, post
            content, or complete purchases. Review the instructions and use accounts you control.
          </em>
        </span>
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(event) => set('enabled', event.target.checked)}
        />
        <span>
          Enabled
          <em>Run on this schedule. Disabled workflows can still be run manually.</em>
        </span>
      </label>

      {error && <div className="form-error" role="alert">{error}</div>}

      {confirmDiscard ? (
        <div className="discard-bar" role="alert">
          <span>Discard unsaved changes?</span>
          <div className="drawer-actions">
            <button
              className="danger-text"
              onClick={() => {
                setConfirmDiscard(false)
                onClose()
              }}
            >
              discard
            </button>
            <button onClick={() => setConfirmDiscard(false)}>keep editing</button>
          </div>
        </div>
      ) : (
        <div className="drawer-actions">
          <button className="primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'saving…' : 'save'}
          </button>
          <button onClick={requestClose}>cancel</button>
        </div>
      )}
    </div>
  )
}
