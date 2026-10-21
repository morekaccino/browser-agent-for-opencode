import { browser } from 'wxt/browser'
import type { BridgeStatus } from '../../../lib/protocol'
import { Badge, Button, Sheet } from '../design/primitives'

export function ConnectionSheet({
  open,
  onOpenChange,
  bridge,
  serverUrl,
  health,
  onReconnect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bridge: BridgeStatus
  serverUrl: string
  health: 'ok' | 'down' | 'unknown'
  onReconnect: () => void
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      title="Connection"
      description="The extension talks only to opencode on this computer."
    >
      <div className="connection-status-card">
        <div className="connection-status-row">
          <span className="connection-status-label">Browser bridge</span>
          <Badge tone={bridge.state === 'connected' ? 'success' : 'warning'} icon={bridge.state === 'connected' ? 'check' : 'error'}>
            {bridge.state === 'connected' ? `connected${bridge.port ? ` :${bridge.port}` : ''}` : bridge.state}
          </Badge>
        </div>
        <div className="connection-status-row">
          <span className="connection-status-label">opencode server</span>
          <Badge tone={health === 'ok' ? 'success' : 'warning'} icon={health === 'ok' ? 'check' : 'error'}>
            {health === 'ok' ? 'connected' : health === 'unknown' ? 'checking…' : 'offline'}
          </Badge>
        </div>
        {serverUrl ? <div className="connection-url">{serverUrl}</div> : null}
      </div>

      <div className="connection-actions">
        <Button icon="refresh" onClick={onReconnect}>
          Reconnect bridge
        </Button>
        <Button
          variant="tonal"
          icon="open_in_new"
          onClick={() => void browser.tabs.create({ url: 'https://morekaccino.github.io/browser-agent-for-opencode/setup.html' })}
        >
          Setup help
        </Button>
      </div>
    </Sheet>
  )
}
