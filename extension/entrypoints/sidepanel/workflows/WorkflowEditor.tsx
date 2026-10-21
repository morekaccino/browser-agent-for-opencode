import { useMemo, useState } from 'react'
import type { ModelOption } from '../useOpencode'
import type { Schedule, Workflow, WorkflowInput } from '../../../lib/workflows/types'
import {
  formatTimestampInZone,
  nextRuns,
  systemTimezone,
  validateSchedule,
} from '../../../lib/workflows/schedule'
import {
  Button,
  Chip,
  Field,
  SelectField,
  Switch,
  TextArea,
  TextInput,
} from '../design/primitives'

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
  agents: Array<{ id: string; name: string; description?: string }>
  onSave: (input: WorkflowInput) => Promise<void>
  onClose: () => void
}) {
  const initial = useMemo(() => initialForm(workflow), [workflow])
  const [form, setForm] = useState<FormState>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
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

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial])

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  const save = async () => {
    setError(null)
    if (!form.name.trim()) {
      setError('Give the workflow a name.')
      return
    }
    if (!form.prompt.trim()) {
      setError('Write the instruction the workflow should follow.')
      return
    }
    if (scheduleError) {
      setError(scheduleError)
      return
    }

    const selectedModel = models.find((option) => option.value === form.modelValue)
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
    <div className="workflow-editor">
      <header className="workflow-editor-head">
        <button type="button" className="ui-icon-button ui-icon-button-standard ui-icon-button-md" aria-label="Back" onClick={requestClose}>
          <span className="msym" aria-hidden="true">arrow_back</span>
        </button>
        <div>
          <h1>{workflow ? 'Edit workflow' : 'New workflow'}</h1>
          <span>{workflow ? 'Changes apply to the next run.' : 'Describe one self-contained task.'}</span>
        </div>
      </header>

      <div className="workflow-editor-scroll">
        {workflow?.source === 'agent' && !workflow.enabled ? (
          <div className="inline-notice">
            <span className="msym sm" aria-hidden="true">auto_awesome</span>
            This workflow was drafted from chat. Review the instructions before enabling it.
          </div>
        ) : null}

        <section className="editor-section">
          <div className="editor-section-head">
            <h2>Task</h2>
            <p>One instruction the workflow can follow without asking questions.</p>
          </div>
          <Field label="Name">
            <TextInput
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="Daily project check"
              maxLength={80}
              autoFocus
            />
          </Field>
          <Field label="Instruction" hint="Use the page, tools, and accounts the agent already has.">
            <TextArea
              value={form.prompt}
              onChange={(event) => set('prompt', event.target.value)}
              placeholder="Open the project dashboard, check for failed builds or new issues, and summarize what needs attention."
              rows={6}
              maxLength={20_000}
            />
          </Field>
        </section>

        <section className="editor-section">
          <div className="editor-section-head">
            <h2>Schedule</h2>
            <p>Choose when this instruction should run.</p>
          </div>
          <SelectField
            label="Repeat"
            value={form.kind}
            onChange={(event) => set('kind', event.target.value as Schedule['kind'])}
          >
            <option value="minutes">Every N minutes</option>
            <option value="hours">Every N hours</option>
            <option value="daily">Daily</option>
            <option value="weekdays">Days of the week</option>
            <option value="monthly">Monthly</option>
            <option value="cron">Custom cron</option>
            <option value="once">Once</option>
          </SelectField>

          {(form.kind === 'minutes' || form.kind === 'hours') && (
            <Field label="Every">
              <div className="editor-inline">
                <TextInput
                  type="number"
                  min={1}
                  max={form.kind === 'minutes' ? 1440 : 24}
                  value={form.every}
                  onChange={(event) => set('every', Number(event.target.value))}
                />
                <span>{form.kind}</span>
              </div>
            </Field>
          )}

          {(form.kind === 'daily' || form.kind === 'weekdays' || form.kind === 'monthly') && (
            <Field label="Time">
              <TextInput type="time" value={form.time} onChange={(event) => set('time', event.target.value)} />
            </Field>
          )}

          {form.kind === 'weekdays' && (
            <div className="field">
              <span className="ui-field-label">Days</span>
              <div className="days-row">
                {DAY_LABELS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    className={`day-chip${form.days.includes(day) ? ' is-selected' : ''}`}
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
            <Field label="Day of month" hint="Months without this day are skipped.">
              <TextInput
                type="number"
                min={1}
                max={31}
                value={form.monthDay}
                onChange={(event) => set('monthDay', Number(event.target.value))}
              />
            </Field>
          )}

          {form.kind === 'cron' && (
            <Field label="Cron expression" hint="Standard 5-field cron: minute hour day-of-month month day-of-week.">
              <TextInput
                value={form.cron}
                onChange={(event) => set('cron', event.target.value)}
                placeholder="0 9 * * 1-5"
                spellCheck={false}
              />
            </Field>
          )}

          {form.kind === 'once' && (
            <Field label="Date and time">
              <TextInput
                type="datetime-local"
                value={form.onceAt}
                onChange={(event) => set('onceAt', event.target.value)}
              />
            </Field>
          )}

          <Field label="Timezone">
            <div className="editor-inline">
              <TextInput
                value={form.timezone}
                onChange={(event) => set('timezone', event.target.value)}
                placeholder="America/Toronto"
              />
              <Button variant="tonal" size="sm" icon="public" onClick={() => set('timezone', systemTimezone())}>
                system
              </Button>
            </div>
          </Field>

          <div className="schedule-preview">
            {scheduleError ? (
              <span className="form-error">{scheduleError}</span>
            ) : (
              <>
                <span className="schedule-preview-label">Next runs</span>
                <div className="chip-row">
                  {previews.map((at) => (
                    <Chip key={at} icon="schedule" label={formatTimestampInZone(at, form.timezone.trim() || systemTimezone())} />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="editor-section">
          <button type="button" className="editor-disclosure" onClick={() => setAdvancedOpen((value) => !value)}>
            <span>
              <strong>Run options</strong>
              <small>Model, agent, start URL, timeout</small>
            </span>
            <span className={`msym sm${advancedOpen ? ' is-open' : ''}`} aria-hidden="true">expand_more</span>
          </button>
          {advancedOpen ? (
            <div className="editor-advanced">
              <SelectField label="Model" value={form.modelValue} onChange={(event) => set('modelValue', event.target.value)}>
                <option value="">Default (last used)</option>
                {models.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Agent" value={form.agent} onChange={(event) => set('agent', event.target.value)}>
                <option value="">Default (last used)</option>
                {agents.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </SelectField>
              <Field label="Start URL (optional)">
                <TextInput
                  value={form.startUrl}
                  onChange={(event) => set('startUrl', event.target.value)}
                  placeholder="https://example.com/dashboard"
                />
              </Field>
              <Field label="Timeout (minutes)" hint="The run is stopped and marked failed after this long.">
                <TextInput
                  type="number"
                  min={1}
                  max={180}
                  value={form.timeout}
                  onChange={(event) => set('timeout', Number(event.target.value))}
                />
              </Field>
            </div>
          ) : null}
        </section>

        <section className="editor-section">
          <div className="editor-section-head">
            <h2>Safety</h2>
            <p>Read-only is the default. Only allow side effects for tasks you have reviewed.</p>
          </div>
          <Switch
            checked={form.allowSubmissions}
            onCheckedChange={(value) => set('allowSubmissions', value)}
            label="Allow submissions and messages"
            supporting="Permit forms, send/reply, post, publish, purchase, or account changes. Use only on accounts you control."
          />
          {form.allowSubmissions ? (
            <div className="inline-notice is-warning">
              <span className="msym sm" aria-hidden="true">warning</span>
              This workflow can act on your behalf. Review the instruction and schedule before enabling it.
            </div>
          ) : null}
          <Switch
            checked={form.autoApprove}
            onCheckedChange={(value) => set('autoApprove', value)}
            label="Auto-approve permission prompts"
            supporting="Hands-off runs continue without waiting. Turn this off to review permissions in the session."
          />
          <Switch
            checked={form.enabled}
            onCheckedChange={(value) => set('enabled', value)}
            label="Enabled"
            supporting="Run on this schedule. Disabled workflows can still be run manually."
          />
        </section>

        {error ? <div className="form-error" role="alert">{error}</div> : null}
      </div>

      {confirmDiscard ? (
        <div className="workflow-discard" role="alert">
          <span>Discard unsaved changes?</span>
          <div>
            <Button variant="text" size="sm" onClick={() => setConfirmDiscard(false)}>
              keep editing
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setConfirmDiscard(false)
                onClose()
              }}
            >
              discard
            </Button>
          </div>
        </div>
      ) : null}

      <footer className="workflow-editor-footer">
        <Button variant="text" onClick={requestClose}>
          cancel
        </Button>
        <Button icon="save" onClick={() => void save()} disabled={saving}>
          {saving ? 'saving…' : workflow ? 'save changes' : 'create workflow'}
        </Button>
      </footer>
    </div>
  )
}
