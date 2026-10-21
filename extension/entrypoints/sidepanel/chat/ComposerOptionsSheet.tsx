import type { LayoutMode } from '../design/useLayoutMode'
import { Chip, ListItem, Sheet } from '../design/primitives'

export function ComposerOptionsSheet({
  open,
  onOpenChange,
  agents,
  agent,
  onAgentChange,
  variants,
  variant,
  onVariantChange,
  mode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  agents: Array<{ id: string; name: string; description?: string }>
  agent: string
  onAgentChange: (value: string) => void
  variants: string[]
  variant: string | null
  onVariantChange: (value: string | null) => void
  mode: LayoutMode
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side={mode === 'compact' ? 'bottom' : 'right'}
      title="Message options"
      description="Fine-tune how the agent responds. These settings stay with the session."
    >
      <div className="sheet-section">
        <div className="sheet-section-title">Agent</div>
        <div className="option-list">
          {agents.map((entry) => (
            <ListItem
              key={entry.id}
              selected={entry.id === agent}
              leading={<span className="msym sm" aria-hidden="true">smart_toy</span>}
              headline={entry.name}
              supporting={entry.description}
              trailing={entry.id === agent ? <span className="msym sm" aria-hidden="true">check</span> : null}
              onClick={() => onAgentChange(entry.id)}
            />
          ))}
          {agents.length === 0 ? <div className="sheet-empty">No agents available.</div> : null}
        </div>
      </div>

      <div className="sheet-section">
        <div className="sheet-section-title">Reasoning</div>
        <div className="chip-row">
          <Chip label="Default" selected={!variant} onClick={() => onVariantChange(null)} />
          {variants.map((entry) => (
            <Chip
              key={entry}
              label={entry}
              selected={variant === entry}
              onClick={() => onVariantChange(variant === entry ? null : entry)}
            />
          ))}
        </div>
        {variants.length === 0 ? <div className="sheet-empty">This model has no reasoning variants.</div> : null}
      </div>
    </Sheet>
  )
}
