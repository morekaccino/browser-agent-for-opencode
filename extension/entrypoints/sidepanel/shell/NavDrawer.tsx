import { browser } from 'wxt/browser'
import { ListItem, Sheet } from '../design/primitives'
import type { Destination } from './NavRail'

const ITEMS: Array<{ id: Destination; icon: string; label: string; supporting: string }> = [
  { id: 'chat', icon: 'forum', label: 'Chat', supporting: 'Work with the current page' },
  { id: 'workflows', icon: 'schedule', label: 'Workflows', supporting: 'Run instructions on a schedule' },
  { id: 'settings', icon: 'settings', label: 'Settings', supporting: 'Connection, appearance, privacy' },
]

export function NavDrawer({
  open,
  onOpenChange,
  destination,
  onChange,
  draftCount = 0,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  destination: Destination
  onChange: (destination: Destination) => void
  draftCount?: number
}) {
  const version = browser.runtime.getManifest().version

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="left"
      title={
        <span className="drawer-brand">
          <img src="/icon/48.png" alt="" />
          <span>
            <strong>Browser Agent</strong>
            <small>for opencode</small>
          </span>
        </span>
      }
      description={`v${version} · local-first`}
    >
      <div className="drawer-nav">
        {ITEMS.map((item) => (
          <ListItem
            key={item.id}
            selected={destination === item.id}
            leading={
              <span className={`drawer-nav-icon${destination === item.id ? ' is-active' : ''}`}>
                <span className={`msym${destination === item.id ? ' filled' : ''}`} aria-hidden="true">
                  {item.icon}
                </span>
              </span>
            }
            headline={
              <span className="drawer-nav-headline">
                {item.label}
                {item.id === 'workflows' && draftCount > 0 ? <span className="drawer-badge">{draftCount}</span> : null}
              </span>
            }
            supporting={item.supporting}
            trailing={destination === item.id ? <span className="msym sm" aria-hidden="true">check</span> : null}
            onClick={() => {
              onChange(item.id)
              onOpenChange(false)
            }}
          />
        ))}
      </div>
      <div className="drawer-footer">
        <button
          type="button"
          className="drawer-link"
          onClick={() => void browser.tabs.create({ url: 'https://morekaccino.github.io/browser-agent-for-opencode/' })}
        >
          <span className="msym sm" aria-hidden="true">open_in_new</span>
          Documentation
        </button>
        <button
          type="button"
          className="drawer-link"
          onClick={() => void browser.tabs.create({ url: 'https://morekaccino.github.io/browser-agent-for-opencode/privacy.html' })}
        >
          <span className="msym sm" aria-hidden="true">shield</span>
          Privacy policy
        </button>
        <p>Independent project. Not affiliated with the opencode project or Google.</p>
      </div>
    </Sheet>
  )
}
