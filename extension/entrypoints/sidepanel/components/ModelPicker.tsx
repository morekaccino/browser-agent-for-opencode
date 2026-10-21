import { useMemo, useRef, useState, useEffect } from 'react'
import type { ModelOption } from '../useOpencode'

export function ProviderLogo({ providerID, size = 16 }: { providerID: string; size?: number }) {
  // Local initials only: no third-party image requests and no bundled
  // provider logos (which would require trademark permissions).
  const hue = Array.from(providerID).reduce((total, char) => total + char.charCodeAt(0), 0) % 360
  return (
    <span
      className="provider-initial"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.6),
        background: `hsl(${hue} 42% 34%)`,
        color: `hsl(${hue} 80% 92%)`,
      }}
      aria-hidden="true"
    >
      {providerID.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function ModelPicker({
  models,
  value,
  onChange,
  disabled,
}: {
  models: ModelOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  const current = models.find((m) => m.value === value) ?? models[0]

  const grouped = useMemo(() => {
    const needle = filter.toLowerCase()
    const filtered = models.filter(
      (m) => !needle || m.name.toLowerCase().includes(needle) || m.modelID.toLowerCase().includes(needle),
    )
    const map = new Map<string, ModelOption[]>()
    for (const model of filtered) {
      const list = map.get(model.providerName) ?? []
      list.push(model)
      map.set(model.providerName, list)
    }
    return Array.from(map.entries())
  }, [models, filter])

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (open) filterRef.current?.focus()
  }, [open])

  return (
    <div className="model-picker">
      <button
        ref={triggerRef}
        className="model-current"
        onClick={() => (open ? close(true) : setOpen(true))}
        disabled={disabled || models.length === 0}
        title={current?.label ?? 'model'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Model: ${current?.name ?? 'none'}`}
      >
        {current && <ProviderLogo providerID={current.providerID} size={15} />}
        <span className="model-current-label">{current?.name ?? 'no model'}</span>
        <span className="msym model-caret" aria-hidden="true">
          arrow_drop_down
        </span>
      </button>
      {open && (
        <>
          <div className="model-backdrop" onClick={() => close(false)} />
          <div className="model-menu" role="menu" aria-label="Models">
            <input
              ref={filterRef}
              className="session-filter"
              placeholder="filter models…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter models"
            />
            <div className="model-list">
              {grouped.map(([provider, entries]) => (
                <div key={provider} role="group" aria-label={provider}>
                  <div className="model-group-label">
                    <ProviderLogo providerID={entries[0]?.providerID ?? ''} size={14} />
                    {provider}
                  </div>
                  {entries.map((entry) => (
                    <button
                      key={entry.value}
                      className={`model-row${entry.value === value ? ' current' : ''}`}
                      role="menuitemradio"
                      aria-checked={entry.value === value}
                      title={entry.label}
                      onClick={() => {
                        close(false)
                        onChange(entry.value)
                      }}
                    >
                      <span className="model-row-name">{entry.name}</span>
                      {entry.variants.length > 0 && (
                        <span className="model-row-meta variant-hint" title={`variants: ${entry.variants.join(', ')}`}>
                          <span className="msym sm" aria-hidden="true">
                            speed
                          </span>
                        </span>
                      )}
                      {entry.limit ? <span className="model-row-meta">{Math.round(entry.limit / 1000)}k</span> : null}
                      <span className="model-row-check" aria-hidden="true">
                        {entry.value === value ? <span className="msym sm filled">check</span> : null}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              {grouped.length === 0 && <div className="session-empty">no matches</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function VariantPicker({
  variants,
  value,
  onChange,
}: {
  variants: string[]
  value: string | null
  onChange: (value: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  if (variants.length === 0) return null

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  return (
    <div className="variant-picker">
      <button
        ref={triggerRef}
        className={`variant-current${value ? ' set' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Effort: ${value ?? 'default'}`}
        title="Reasoning effort / context variant"
      >
        <span className="msym sm" aria-hidden="true">
          speed
        </span>
        <span className="variant-label">{value ?? 'default'}</span>
        <span className="msym model-caret" aria-hidden="true">
          arrow_drop_down
        </span>
      </button>
      {open && (
        <>
          <div className="model-backdrop" onClick={() => close(false)} />
          <div className="variant-menu" role="menu" aria-label="Effort variants">
            {[null, ...variants].map((entry) => (
              <button
                key={entry ?? 'default'}
                className={`model-row${entry === value ? ' current' : ''}`}
                role="menuitemradio"
                aria-checked={entry === value}
                onClick={() => {
                  close(false)
                  onChange(entry)
                }}
              >
                <span className="model-row-name">{entry ?? 'default'}</span>
                <span className="model-row-check" aria-hidden="true">
                  {entry === value ? <span className="msym sm filled">check</span> : null}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
