import { useState } from 'react'
import { browser } from 'wxt/browser'
import { Button } from '../design/primitives'

function pluginsPath(): string {
  return /windows/i.test(navigator.userAgent)
    ? '%USERPROFILE%\\.config\\opencode\\plugins\\'
    : '~/.config/opencode/plugins/'
}

export function ConnectView({
  bridgeState,
  bridgeDetail,
  serverUrl,
  health,
  onReconnect,
}: {
  bridgeState: string
  bridgeDetail?: string
  serverUrl: string
  health: 'ok' | 'down' | 'unknown'
  onReconnect: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const bridgeConnected = bridgeState === 'connected'
  const serverConnected = health === 'ok'

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(pluginsPath())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const downloadPlugin = async () => {
    setDownloadError(null)
    let objectUrl = ''
    try {
      const response = await fetch(browser.runtime.getURL('bridge/browser-bridge.js' as any))
      const text = await response.text()
      objectUrl = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }))
      await browser.downloads.download({
        url: objectUrl,
        filename: 'browser-bridge.js',
        saveAs: true,
      })
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : String(error))
    } finally {
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    }
  }

  return (
    <div className="connect-view">
      <div className="connect-hero">
        <span className="connect-icon" aria-hidden="true">
          <span className="msym xl" aria-hidden="true">cable</span>
        </span>
        <h1>Connect opencode</h1>
        <p>
          The side panel is the browser half. opencode runs on your computer and does the reasoning. No account, no
          cloud relay.
        </p>
      </div>

      <div className="connect-status">
        <span className={`status-chip ${bridgeConnected ? 'is-ok' : 'is-warn'}`}>
          <span className="status-dot" />
          bridge {bridgeConnected ? 'connected' : bridgeState}
        </span>
        <span className={`status-chip ${serverConnected ? 'is-ok' : 'is-warn'}`}>
          <span className="status-dot" />
          server {serverConnected ? 'connected' : health === 'unknown' ? 'checking' : 'offline'}
        </span>
        {bridgeDetail ? <span className="connect-detail">{bridgeDetail}</span> : null}
      </div>

      <ol className="connect-steps">
        <li className={serverConnected ? 'is-done' : ''}>
          <span className="connect-step-number">{serverConnected ? <span className="msym sm">check</span> : '1'}</span>
          <div>
            <strong>Install and start opencode</strong>
            <p>Use the installer for your platform, then run opencode once. Configure a model provider.</p>
            <Button
              variant="text"
              size="sm"
              icon="open_in_new"
              onClick={() => void browser.tabs.create({ url: 'https://opencode.ai/docs' })}
            >
              open opencode docs
            </Button>
          </div>
        </li>
        <li className={bridgeConnected ? 'is-done' : ''}>
          <span className="connect-step-number">{bridgeConnected ? <span className="msym sm">check</span> : '2'}</span>
          <div>
            <strong>Add the browser bridge plugin</strong>
            <p>Download the plugin and put it in your opencode plugins folder. The bridge creates its config on first run.</p>
            <div className="connect-path">
              <code>{pluginsPath()}</code>
              <Button variant="tonal" size="sm" icon={copied ? 'check' : 'content_copy'} onClick={() => void copyPath()}>
                {copied ? 'copied' : 'copy path'}
              </Button>
            </div>
            <Button variant="tonal" size="sm" icon="download" onClick={() => void downloadPlugin()}>
              download plugin
            </Button>
            {downloadError ? <p className="connect-error">{downloadError}</p> : null}
          </div>
        </li>
        <li className={serverConnected && bridgeConnected ? 'is-done' : ''}>
          <span className="connect-step-number">
            {serverConnected && bridgeConnected ? <span className="msym sm">check</span> : '3'}
          </span>
          <div>
            <strong>Restart opencode and reconnect</strong>
            <p>
              Run <code>opencode service restart</code>, then reconnect here. The bridge remembers this extension the
              first time it connects.
            </p>
            <Button icon="refresh" onClick={onReconnect}>
              reconnect bridge
            </Button>
          </div>
        </li>
      </ol>

      <div className="connect-footer">
        <span>{serverUrl ? `Server: ${serverUrl}` : 'Server not discovered yet.'}</span>
        <Button
          variant="text"
          size="sm"
          icon="open_in_new"
          onClick={() => void browser.tabs.create({ url: 'https://morekaccino.github.io/browser-agent-for-opencode/setup.html' })}
        >
          full setup guide
        </Button>
      </div>
    </div>
  )
}
