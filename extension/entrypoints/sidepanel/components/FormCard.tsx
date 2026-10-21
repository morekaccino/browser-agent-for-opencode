import { useMemo, useState } from 'react'
import type { FormField } from '@opencode/client'
import type { PendingForm } from '../useOpencode'

type AnswerValue = string | number | boolean | string[] | undefined

function valuesFor(form: PendingForm): Record<string, AnswerValue> {
  const values: Record<string, AnswerValue> = {}
  for (const field of form.fields) {
    if ('default' in field && field.default !== undefined) {
      values[field.key] = field.default as AnswerValue
    } else if (field.type === 'multiselect') {
      values[field.key] = []
    } else if (field.type === 'boolean') {
      values[field.key] = false
    }
  }
  return values
}

function isVisible(field: FormField, values: Record<string, AnswerValue>): boolean {
  const anyField = field as any
  if (anyField.hidden) return false
  if (!anyField.when || anyField.when.length === 0) return true
  return anyField.when.every((condition: any) => {
    const current = values[condition.key]
    if (Array.isArray(current)) {
      const found = current.includes(String(condition.value))
      return condition.op === 'eq' ? found : !found
    }
    const same = current === condition.value
    return condition.op === 'eq' ? same : !same
  })
}

export function FormBar({
  forms,
  onReply,
  onCancel,
}: {
  forms: PendingForm[]
  onReply: (form: PendingForm, answer: Record<string, string | number | boolean | string[]>) => void
  onCancel: (form: PendingForm) => void
}) {
  if (forms.length === 0) return null
  return (
    <div className="questions">
      {forms.map((form) => (
        <FormCard key={form.id} form={form} onReply={onReply} onCancel={onCancel} />
      ))}
    </div>
  )
}

function FormCard({
  form,
  onReply,
  onCancel,
}: {
  form: PendingForm
  onReply: (form: PendingForm, answer: Record<string, string | number | boolean | string[]>) => void
  onCancel: (form: PendingForm) => void
}) {
  const [values, setValues] = useState<Record<string, AnswerValue>>(() => valuesFor(form))
  const [custom, setCustom] = useState<Record<string, string>>({})

  const set = (key: string, value: AnswerValue) => setValues((prev) => ({ ...prev, [key]: value }))

  const visibleFields = useMemo(() => form.fields.filter((field) => isVisible(field, values)), [form.fields, values])

  const ready = useMemo(() => {
    return visibleFields.every((field) => {
      const anyField = field as any
      if (!anyField.required) return true
      if (field.type === 'boolean') return true
      if (field.type === 'external') return true
      const value = values[field.key]
      if (field.type === 'multiselect') {
        const list = Array.isArray(value) ? value : []
        const extra = (custom[field.key] ?? '').trim()
        return list.length > 0 || extra.length > 0
      }
      if (field.type === 'number' || field.type === 'integer') {
        return typeof value === 'number' && Number.isFinite(value)
      }
      const text = typeof value === 'string' ? value.trim() : ''
      return text.length > 0 || (custom[field.key] ?? '').trim().length > 0
    })
  }, [visibleFields, values, custom])

  const submit = () => {
    if (!ready) return
    const answer: Record<string, string | number | boolean | string[]> = {}
    for (const field of visibleFields) {
      if (field.type === 'external') continue
      const value = values[field.key]
      const extra = (custom[field.key] ?? '').trim()
      if (field.type === 'multiselect') {
        const list = Array.isArray(value) ? [...value] : []
        if (extra && !list.includes(extra)) list.push(extra)
        answer[field.key] = list
      } else if (field.type === 'number' || field.type === 'integer') {
        if (typeof value === 'number' && Number.isFinite(value)) answer[field.key] = value
      } else if (field.type === 'boolean') {
        answer[field.key] = value === true
      } else if (extra) {
        answer[field.key] = extra
      } else if (typeof value === 'string') {
        answer[field.key] = value
      }
    }
    onReply(form, answer)
  }

  const title = form.title || (visibleFields.length > 1 ? `${visibleFields.length} questions` : visibleFields[0]?.title)

  return (
    <div className="question-card">
      <div className="question-head">
        <span className="question-tag">question</span>
        <span className="question-title">{title}</span>
      </div>

      {visibleFields.map((field) => {
        const label = field.title ?? field.key
        const description = (field as any).description as string | undefined
        const key = field.key
        return (
          <div key={key} className="question-item">
            <div className="question-text">
              {label}
              {(field as any).required ? ' *' : ''}
            </div>
            {description && <div className="question-description">{description}</div>}

            {field.type === 'string' && field.options && field.options.length > 0 && (
              <div className="question-options">
                {field.options.map((option) => (
                  <button
                    key={option.value}
                    className={`question-option${values[key] === option.value ? ' selected' : ''}`}
                    title={option.description}
                    onClick={() => set(key, option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            {field.type === 'string' && (!field.options?.length || field.custom !== false) && (
              <input
                className="question-custom"
                placeholder={field.placeholder ?? (field.options?.length ? 'or type your own answer…' : 'type your answer…')}
                value={custom[key] ?? (typeof values[key] === 'string' && !field.options?.length ? values[key] : '')}
                onChange={(event) => {
                  setCustom((prev) => ({ ...prev, [key]: event.target.value }))
                  if (!field.options?.length) set(key, event.target.value)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && ready) {
                    event.preventDefault()
                    submit()
                  }
                }}
              />
            )}

            {field.type === 'multiselect' && (
              <>
                <div className="question-options">
                  {field.options.map((option) => {
                    const list = Array.isArray(values[key]) ? (values[key] as string[]) : []
                    const selected = list.includes(option.value)
                    return (
                      <button
                        key={option.value}
                        className={`question-option${selected ? ' selected' : ''}`}
                        title={option.description}
                        onClick={() =>
                          set(
                            key,
                            selected ? list.filter((item) => item !== option.value) : [...list, option.value],
                          )
                        }
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                {field.custom !== false && (
                  <input
                    className="question-custom"
                    placeholder="or type your own answer…"
                    value={custom[key] ?? ''}
                    onChange={(event) => setCustom((prev) => ({ ...prev, [key]: event.target.value }))}
                  />
                )}
              </>
            )}

            {(field.type === 'number' || field.type === 'integer') && (
              <input
                className="question-custom"
                type="number"
                step={field.type === 'integer' ? 1 : 'any'}
                min={typeof field.minimum === 'number' ? field.minimum : undefined}
                max={typeof field.maximum === 'number' ? field.maximum : undefined}
                value={typeof values[key] === 'number' ? values[key] : ''}
                onChange={(event) => {
                  const next = event.target.value
                  set(key, next === '' ? undefined : Number(next))
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && ready) {
                    event.preventDefault()
                    submit()
                  }
                }}
              />
            )}

            {field.type === 'boolean' && (
              <label className="question-boolean">
                <input
                  type="checkbox"
                  checked={values[key] === true}
                  onChange={(event) => set(key, event.target.checked)}
                />
                <span>{values[key] === true ? 'yes' : 'no'}</span>
              </label>
            )}

            {field.type === 'external' && (
              <a className="question-external" href={field.url} target="_blank" rel="noreferrer">
                {field.title ?? field.url}
              </a>
            )}
          </div>
        )
      })}

      <div className="question-actions">
        <button className="primary" disabled={!ready} onClick={submit}>
          answer
        </button>
        <button onClick={() => onCancel(form)}>skip</button>
      </div>
    </div>
  )
}
