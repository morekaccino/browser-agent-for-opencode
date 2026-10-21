import { useEffect, useMemo, useState } from 'react'
import type { ModelOption } from '../useOpencode'
import type { LayoutMode } from '../design/useLayoutMode'
import { Badge, SearchField, Sheet } from '../design/primitives'
import { ProviderAvatar } from './ProviderAvatar'

export function ModelSheet({
  open,
  onOpenChange,
  models,
  value,
  onChange,
  mode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  models: ModelOption[]
  value: string
  onChange: (value: string) => void
  mode: LayoutMode
}) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = models.filter(
      (model) =>
        !needle ||
        model.name.toLowerCase().includes(needle) ||
        model.modelID.toLowerCase().includes(needle) ||
        model.providerName.toLowerCase().includes(needle),
    )
    const map = new Map<string, ModelOption[]>()
    for (const model of filtered) {
      const list = map.get(model.providerName) ?? []
      list.push(model)
      map.set(model.providerName, list)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [models, query])

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side={mode === 'compact' ? 'bottom' : 'right'}
      title="Choose a model"
      description="The agent uses this model for the next message."
      bodyClassName="model-sheet-body"
    >
      <SearchField value={query} onChange={setQuery} placeholder="Search models and providers" label="Search models" />
      <div className="model-list">
        {groups.map(([provider, entries]) => (
          <section key={provider} className="model-group">
            <div className="model-group-head">
              <ProviderAvatar providerID={entries[0]?.providerID ?? provider} size={18} />
              <span>{provider}</span>
            </div>
            {entries.map((model) => {
              const selected = model.value === value
              return (
                <button
                  key={model.value}
                  type="button"
                  className={`model-row${selected ? ' is-selected' : ''}`}
                  onClick={() => {
                    onChange(model.value)
                    onOpenChange(false)
                  }}
                >
                  <span className="model-row-main">
                    <span className="model-row-name">{model.name}</span>
                    <span className="model-row-meta">
                      {model.modelID}
                      {model.limit ? ` · ${Math.round(model.limit / 1000)}k context` : ''}
                    </span>
                  </span>
                  {model.variants.length > 0 ? <Badge tone="neutral" icon="speed">{model.variants.length}</Badge> : null}
                  {selected ? <span className="msym sm model-check" aria-hidden="true">check</span> : null}
                </button>
              )
            })}
          </section>
        ))}
        {groups.length === 0 ? <div className="model-empty">No matching models</div> : null}
      </div>
    </Sheet>
  )
}
