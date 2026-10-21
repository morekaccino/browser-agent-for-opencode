import { useState } from 'react'
import { browser } from 'wxt/browser'

function pluginsPath(): string {
  return /windows/i.test(navigator.userAgent)
    ? '%USERPROFILE%\\.config\\opencode\\plugins\\'
    : '~/.config/opencode/plugins/'
}

export function SetupCard({
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
    try {
      await browser.downloads.download({
        url: browser.runtime.getURL('bridge/browser-bridge.ts' as any),
        filename: 'browser-bridge.ts',
        saveAs: true,
      })
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="setup-card">
      <div className="setup-head">
        <span className="setup-icon msym" aria-hidden="true">
          rocket_launch
        </span>
        <div>
          <h2>{serverConnected && bridgeConnected ? 'Ready when you are' : 'Set up the local agent'}</h2>
          <p>
            {serverConnected && bridgeConnected
              ? 'Your browser and opencode are connected.'
              : 'This extension is the browser side. It talks to opencode running on your computer — no account, no cloud relay.'}
          </p>
        </div>
      </div>

      <div className="setup-status">
        <span className={`setup-dot ${bridgeConnected ? 'ok' : 'wait'}`} aria-hidden="true" />
        <span>
          browser bridge <strong>{bridgeConnected ? 'connected' : bridgeState}</strong>
          {bridgeDetail ? ` — ${bridgeDetail}` : ''}
        </span>
      </div>
      <div className="setup-status">
        <span className={`setup-dot ${serverConnected ? 'ok' : 'wait'}`} aria-hidden="true" />
        <span>
          opencode server <strong>{serverConnected ? 'connected' : health === 'unknown' ? 'checking…' : 'offline'}</strong>
          {serverUrl ? ` — ${serverUrl}` : ''}
        </span>
      </div>

      <ol className="setup-steps">
        <li>
          <div className="setup-step-title">Install opencode V2</div>
          <p>Follow the installer for your platform, then run `opencode` once to finish setup.</p>
          <button className="btn-tonal compact" onClick={() => void browser.tabs.create({ url: 'https://opencode.ai/docs' })}>
            open opencode docs
          </button>
        </li>
        <li>
          <div className="setup-step-title">Add the browser bridge plugin</div>
          <p>
            Download the plugin, then put it in your opencode plugins folder. The bridge creates its config on first
            run.
          </p>
          <div className="setup-path">
            <code>{pluginsPath()}</code>
            <button className="btn-tonal compact" onClick={() => void copyPath()}>
              {copied ? 'copied' : 'copy path'}
            </button>
          </div>
          <button className="btn-tonal compact" onClick={() => void downloadPlugin()}>
            download bridge plugin
          </button>
          {downloadError && <div className="form-error">{downloadError}</div>}
        </li>
        <li>
          <div className="setup-step-title">Restart opencode and reconnect</div>
          <p>
            Run <code>opencode service restart</code> (or restart the TUI / <code>opencode serve</code>), then reconnect
            here.
          </p>
          <button className="primary compact" onClick={onReconnect}>
            reconnect bridge
          </button>
        </li>
      </ol>

      <p className="setup-foot">
        The bridge listens on loopback only and remembers this extension the first time it connects. If you switch
        between a development build and the store build, remove `allowedExtensionIds` from{' '}
        <code>browser-bridge.json</code> and reconnect.
      </p>
    </div>
  )
}
