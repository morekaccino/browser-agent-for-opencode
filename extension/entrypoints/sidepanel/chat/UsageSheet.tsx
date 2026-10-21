import type { ContextUsage } from '../useOpencode'
import { Progress, Sheet } from '../design/primitives'

export function UsageSheet({
  open,
  onOpenChange,
  usage,
  cost,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  usage: ContextUsage | null
  cost: number
}) {
  const tokens = usage?.tokens ?? 0
  const limit = usage?.limit ?? null
  const pct = limit && limit > 0 ? Math.min(100, Math.round((tokens / limit) * 100)) : null

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      title="Session usage"
      description="Context window and estimated cost for this conversation."
    >
      <div className="usage-sheet">
        <div className="usage-sheet-main">
          <span className="usage-sheet-value">{tokens.toLocaleString()}</span>
          <span className="usage-sheet-label">{limit ? `of ${limit.toLocaleString()} tokens` : 'tokens used'}</span>
        </div>
        {pct != null ? <Progress value={pct} /> : null}
        <div className="usage-sheet-grid">
          <div>
            <span>Context used</span>
            <strong>{pct == null ? 'unknown' : `${pct}%`}</strong>
          </div>
          <div>
            <span>Session cost</span>
            <strong>${cost.toFixed(cost < 1 ? 4 : 2)}</strong>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
