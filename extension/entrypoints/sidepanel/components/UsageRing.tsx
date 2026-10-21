import { useState } from 'react'

export function UsageRing({ tokens, limit, cost }: { tokens: number; limit: number | null; cost: number }) {
  const [open, setOpen] = useState(false)
  const pct = limit && limit > 0 ? Math.min(100, Math.round((tokens / limit) * 100)) : null
  const radius = 8
  const circumference = 2 * Math.PI * radius
  const dash = pct != null ? (pct / 100) * circumference : 0
  const cls = pct == null ? 'usage-neutral' : pct < 50 ? 'usage-ok' : pct < 80 ? 'usage-warn' : 'usage-hot'

  return (
    <div className="usage">
      <button
        className="usage-btn"
        aria-expanded={open}
        aria-label={`Context ${pct != null ? `${pct} percent used` : `${tokens} tokens`} — session cost $${cost.toFixed(4)}`}
        onClick={() => setOpen((value) => !value)}
        title="Context usage and session cost"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" className={cls} aria-hidden="true">
          <circle cx="10" cy="10" r={radius} className="usage-track" />
          {pct != null && (
            <circle
              cx="10"
              cy="10"
              r={radius}
              className="usage-fill"
              strokeDasharray={`${dash} ${circumference}`}
              transform="rotate(-90 10 10)"
              strokeLinecap="round"
            />
          )}
        </svg>
        <span className="usage-text">
          {pct != null ? `${pct}%` : '–'} · {cost > 0 ? `$${cost.toFixed(cost < 1 ? 4 : 2)}` : '$0'}
        </span>
      </button>
      {open && (
        <>
          <div className="usage-backdrop" onClick={() => setOpen(false)} />
          <div className="usage-pop" role="dialog" aria-label="Usage details">
            <div className="usage-pop-row">
              <span>context used</span>
              <strong>
                {tokens.toLocaleString()}
                {limit ? ` / ${limit.toLocaleString()}` : ''} tokens
              </strong>
            </div>
            <div className="usage-pop-row">
              <span>context left</span>
              <strong>{pct != null ? `${Math.max(0, 100 - pct)}%` : 'unknown'}</strong>
            </div>
            <div className="usage-pop-row">
              <span>session cost</span>
              <strong>${cost.toFixed(4)}</strong>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
