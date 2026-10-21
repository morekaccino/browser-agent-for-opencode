import type { ActiveTab } from '../hooks'
import { Button, Chip, Sheet, Switch } from '../design/primitives'

function hostOf(url?: string): string {
  if (!url) return ''
  if (url.startsWith('chrome-extension://')) return 'Extension page'
  if (url.startsWith('chrome://')) return 'Chrome page'
  if (url.startsWith('file://')) return 'Local file'
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function ContextChip({
  tab,
  includeContext,
  onClick,
  compact,
}: {
  tab: ActiveTab
  includeContext: boolean
  onClick: () => void
  compact?: boolean
}) {
  return (
    <Chip
      icon={includeContext ? 'web' : 'web_asset_off'}
      label={compact ? (tab.title ? 'Page' : 'No page') : tab.title || 'No page'}
      selected={includeContext}
      onClick={onClick}
      title={tab.title ? `${tab.title}${tab.url ? ` — ${tab.url}` : ''}` : 'No active page'}
      className="context-chip"
    />
  )
}

export function ContextStrip({
  tab,
  includeContext,
  onClick,
}: {
  tab: ActiveTab
  includeContext: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className="context-strip" onClick={onClick} title={tab.url}>
      <span className={`context-strip-icon${includeContext ? ' is-on' : ''}`}>
        <span className="msym sm" aria-hidden="true">web</span>
      </span>
      <span className="context-strip-text">
        <span className="context-strip-title">{tab.title || 'No active page'}</span>
        <span className="context-strip-url">
          {hostOf(tab.url)}
          {includeContext ? ' · page context on' : ' · page context off'}
        </span>
      </span>
      <span className="msym sm" aria-hidden="true">tune</span>
    </button>
  )
}

export function ContextSheet({
  open,
  onOpenChange,
  tab,
  includeContext,
  onIncludeContextChange,
  followAgent,
  onToggleFollow,
  onReveal,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: ActiveTab
  includeContext: boolean
  onIncludeContextChange: (value: boolean) => void
  followAgent: boolean
  onToggleFollow: () => void
  onReveal: () => void
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      title="Page context"
      description="Choose what the agent can see and whether your view follows it."
    >
      <div className="context-page-card">
        <span className="context-page-icon" aria-hidden="true">
          <span className="msym" aria-hidden="true">web</span>
        </span>
        <div>
          <strong>{tab.title || 'No active page'}</strong>
          <span>{tab.url || 'Open a web page to give the agent context.'}</span>
        </div>
      </div>

      <div className="context-options">
        <Switch
          checked={includeContext}
          onCheckedChange={onIncludeContextChange}
          label="Send page context"
          supporting="Include a snapshot of the active tab when you send a prompt."
        />
        <Switch
          checked={followAgent}
          onCheckedChange={() => onToggleFollow()}
          label="Follow the agent"
          supporting="Switch your view to whichever tab the agent is working on."
        />
      </div>

      <Button variant="tonal" icon="visibility" onClick={onReveal} className="context-reveal">
        Reveal the agent's tab
      </Button>
    </Sheet>
  )
}
