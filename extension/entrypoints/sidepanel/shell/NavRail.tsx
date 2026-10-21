import { browser } from 'wxt/browser'
import { IconButton, Tooltip } from '../design/primitives'

export type Destination = 'chat' | 'workflows' | 'settings'

const ITEMS: Array<{ id: Destination; icon: string; label: string }> = [
  { id: 'chat', icon: 'forum', label: 'Chat' },
  { id: 'workflows', icon: 'schedule', label: 'Workflows' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
]

export function NavRail({
  destination,
  onChange,
}: {
  destination: Destination
  onChange: (destination: Destination) => void
}) {
  return (
    <nav className="nav-rail" aria-label="Primary">
      <div className="rail-brand" aria-hidden="true">
        <img src="/icon/48.png" alt="" />
      </div>
      <div className="rail-items">
        {ITEMS.map((item) => {
          const active = destination === item.id
          return (
            <Tooltip key={item.id} label={item.label}>
              <button
                type="button"
                className={`rail-item${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onChange(item.id)}
              >
                <span className={`msym${active ? ' filled' : ''}`} aria-hidden="true">
                  {item.icon}
                </span>
                <span className="rail-label">{item.label}</span>
              </button>
            </Tooltip>
          )
        })}
      </div>
      <div className="rail-bottom">
        <IconButton
          icon="help"
          label="Setup help"
          variant="ghost"
          onClick={() => void browser.tabs.create({ url: 'https://morekaccino.github.io/browser-agent-for-opencode/setup.html' })}
        />
      </div>
    </nav>
  )
}
