import { useEffect, useMemo, useRef, useState } from 'react'
import { browser } from 'wxt/browser'
import { basicAuthHeader } from '../../../lib/auth'
import type { OpencodeEndpoint } from '../../../lib/protocol'
import { PRIVACY_URL, settings } from '../../../lib/settings'

const SEED_PRESETS = ['#6750A4', '#0B57D0', '#146C2E', '#8F4C38', '#7D5260', '#3F5AA6']

interface FormState {
  opencodeUrl: string
  username: string
  password: string
  autoDiscover: boolean
  bridgePort: number
  bridgeToken: string
  consoleEngine: 'hook' | 'debugger'
  seed: string
  themeMode: 'auto' | 'light' | 'dark'
}

const EMPTY: FormState = {
  opencodeUrl: '',
  username: '',
  password: '',
  autoDiscover: true,
  bridgePort: 8767,
  bridgeToken: '',
  consoleEngine: 'hook',
  seed: '#6750A4',
  themeMode: 'auto',
}

export function SettingsDrawer({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (url: string, username: string, password: string) => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saved, setSaved] = useState(false)
  const [tokenVisible, setTokenVisible] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [discovered, setDiscovered] = useState<(OpencodeEndpoint & { at: number }) | null>(null)
  const initialRef = useRef<FormState | null>(null)

  useEffect(() => {
    void (async () => {
      const loaded: FormState = {
        opencodeUrl: await settings.opencodeUrl.getValue(),
        username: await settings.opencodeUsername.getValue(),
        password: await settings.opencodePassword.getValue(),
        autoDiscover: await settings.opencodeAutoDiscover.getValue(),
        bridgePort: await settings.bridgePort.getValue(),
        bridgeToken: await settings.bridgeToken.getValue(),
        consoleEngine: await settings.consoleEngine.getValue(),
        seed: await settings.themeSeed.getValue(),
        themeMode: await settings.themeMode.getValue(),
      }
      initialRef.current = loaded
      setForm(loaded)
      setDiscovered(await settings.opencodeEndpoint.getValue())
    })()
    const unwatch = settings.opencodeEndpoint.watch((value) => setDiscovered(value))
    return () => unwatch()
  }, [])

  const dirty = useMemo(() => !!initialRef.current && JSON.stringify(initialRef.current) !== JSON.stringify(form), [form])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  const normalizedUrl = form.opencodeUrl.trim().replace(/^(https?:\/\/)127\.0\.0\.1(?=[:/]|$)/, '$1localhost') || 'http://localhost:4096'

  const save = async () => {
    await settings.opencodeUrl.setValue(normalizedUrl)
    await settings.opencodeUsername.setValue(form.username.trim())
    await settings.opencodePassword.setValue(form.password)
    await settings.opencodeAutoDiscover.setValue(form.autoDiscover)
    await settings.bridgePort.setValue(Number(form.bridgePort) || 8767)
    await settings.bridgeToken.setValue(form.bridgeToken.trim())
    await settings.consoleEngine.setValue(form.consoleEngine)
    await settings.themeSeed.setValue(form.seed)
    await settings.themeMode.setValue(form.themeMode)
    initialRef.current = { ...form, opencodeUrl: normalizedUrl, username: form.username.trim(), bridgeToken: form.bridgeToken.trim() }
    setForm(initialRef.current)
    setSaved(true)
    onSaved(normalizedUrl, form.username.trim(), form.password)
    setTimeout(() => setSaved(false), 1500)
  }

  const testConnection = async () => {
    setTestResult('testing…')
    try {
      const headers: Record<string, string> = {}
      if (form.password || form.username) {
        headers.Authorization = basicAuthHeader(form.username.trim(), form.password)
      }
      const res = await fetch(`${normalizedUrl.replace(/\/$/, '')}/api/info`, {
        headers,
        signal: AbortSignal.timeout(4000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { version?: string }
      setTestResult(`connected — opencode ${data.version ?? 'ok'}`)
    } catch (error) {
      setTestResult(`failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  const reconnect = () => {
    void browser.runtime.sendMessage({ kind: 'internal', method: 'bridge.reconnect' }).catch(() => {})
  }

  return (
    <div className="drawer">
      <div className="drawer-head">
        <strong>Settings</strong>
        <button className="icon-btn" onClick={requestClose} title="Close" aria-label="Close settings">
          <span className="msym" aria-hidden="true">
            close
          </span>
        </button>
      </div>

      <div className="section-title">Connection</div>

      <div className="field">
        <label className="auto-discover">
          <input
            type="checkbox"
            checked={form.autoDiscover}
            onChange={(e) => set('autoDiscover', e.target.checked)}
          />
          <span>auto-discover the local opencode V2 service</span>
        </label>
        <em>
          The plugin bridge reads <code>~/.local/state/opencode/service.json</code> and fills the URL/password
          automatically. Turn this off to point at a remote or manually started server.
        </em>
        {discovered && (
          <div className="test-result ok">
            discovered opencode {discovered.version ?? 'local'}
            {discovered.directory ? ` · ${discovered.directory}` : ''}
          </div>
        )}
      </div>

      <label className="field">
        <span>opencode server URL</span>
        <input
          value={form.opencodeUrl}
          onChange={(e) => set('opencodeUrl', e.target.value)}
          placeholder="http://localhost:4096"
          disabled={form.autoDiscover}
        />
        <em>
          Use <code>localhost</code>, not <code>127.0.0.1</code>: newer Chrome may gate IP-literal loopback requests
          (Local Network Access). For a manual server: <code>opencode serve --port 4096</code>.
        </em>
      </label>

      <label className="field">
        <span>server username (optional)</span>
        <input
          value={form.username}
          onChange={(e) => set('username', e.target.value)}
          placeholder="opencode"
          autoComplete="off"
          disabled={form.autoDiscover}
        />
      </label>

      <label className="field">
        <span>server password (optional)</span>
        <input
          type="password"
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
          placeholder="OPENCODE_SERVER_PASSWORD"
          autoComplete="off"
          disabled={form.autoDiscover}
        />
      </label>

      <div className="field">
        <div className="test-row">
          <button className="btn-tonal" onClick={() => void testConnection()}>
            test connection
          </button>
          {testResult && <span className={`test-result${testResult.startsWith('connected') ? ' ok' : ''}`}>{testResult}</span>}
        </div>
      </div>

      <div className="section-title">Appearance</div>

      <div className="field">
        <span>accent color (theme seed)</span>
        <div className="seed-row">
          <div className="seed-swatches">
            {SEED_PRESETS.map((preset) => (
              <button
                key={preset}
                className={`seed-swatch${form.seed.toLowerCase() === preset.toLowerCase() ? ' selected' : ''}`}
                style={{ background: preset }}
                title={preset}
                aria-label={`Accent ${preset}`}
                onClick={() => set('seed', preset)}
              />
            ))}
          </div>
          <input type="color" value={form.seed} onChange={(e) => set('seed', e.target.value)} title="Custom accent color" />
        </div>
        <em>Drives the whole M3 palette (buttons, cards, highlights) and the AI halo colors — applied instantly.</em>
      </div>

      <div className="field">
        <span>theme</span>
        <div className="segmented">
          {(['auto', 'light', 'dark'] as const).map((mode) => (
            <button key={mode} className={form.themeMode === mode ? 'selected' : ''} onClick={() => set('themeMode', mode)}>
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="section-title">Browser bridge</div>

      <label className="field">
        <span>plugin bridge port</span>
        <input type="number" value={form.bridgePort} onChange={(e) => set('bridgePort', Number(e.target.value))} />
        <em>
          Must match the <code>port</code> in <code>~/.config/opencode/browser-bridge.json</code> (Windows:{' '}
          <code>%USERPROFILE%\.config\opencode\browser-bridge.json</code>, default 8767). Run <code>npm run status</code> to
          print it.
        </em>
      </label>

      <label className="field">
        <span>plugin bridge token (optional)</span>
        <span className="secret-row">
          <input
            type={tokenVisible ? 'text' : 'password'}
            value={form.bridgeToken}
            onChange={(e) => set('bridgeToken', e.target.value)}
            placeholder="auto-paired by default"
            autoComplete="off"
          />
          <button
            className="icon-btn tiny"
            onClick={() => setTokenVisible((v) => !v)}
            aria-label={tokenVisible ? 'Hide token' : 'Show token'}
            title={tokenVisible ? 'Hide token' : 'Show token'}
          >
            <span className="msym sm" aria-hidden="true">
              {tokenVisible ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        </span>
        <em>
          Leave blank: the bridge pairs with this extension automatically and remembers its ID. Only set it manually if{' '}
          <code>requireToken: true</code> is set in <code>browser-bridge.json</code>.
        </em>
      </label>

      <div className="field">
        <span>console engine</span>
        <div className="segmented">
          <button className={form.consoleEngine === 'hook' ? 'selected' : ''} onClick={() => set('consoleEngine', 'hook')}>
            hook
          </button>
          <button className={form.consoleEngine === 'debugger' ? 'selected' : ''} onClick={() => set('consoleEngine', 'debugger')}>
            debugger
          </button>
        </div>
        <em>
          hook: captures new logs without keeping the debugger attached; console exec briefly attaches it. debugger:
          full DevTools fidelity, keeps the debugger attached and shows a debugging banner.
        </em>
      </div>

      <div className="section-title">Data &amp; privacy</div>

      <div className="field">
        <div className="test-row">
          <button className="btn-tonal" onClick={() => void browser.tabs.create({ url: PRIVACY_URL })}>
            privacy policy
          </button>
          <button
            className="btn-tonal"
            onClick={() => {
              void settings.privacyConsentVersion.setValue(0).then(() => window.location.reload())
            }}
          >
            review disclosure
          </button>
        </div>
        <em>
          Page context, tabs, console output, and screenshots are sent to the opencode service on this computer and the
          model provider configured there. The developer does not receive them.
        </em>
      </div>

      <div className="field">
        <button
          className={`danger-text${confirmClear ? ' confirm' : ''}`}
          onClick={() => {
            if (!confirmClear) {
              setConfirmClear(true)
              return
            }
            void browser.storage.local.clear().then(() => window.location.reload())
          }}
        >
          {confirmClear ? 'click again to clear everything' : 'clear stored data'}
        </button>
        <em>
          Removes extension settings, workflows, run history, and local connection credentials. opencode sessions and
          screenshots live outside the extension and are not deleted.
        </em>
      </div>

      {confirmDiscard ? (
        <div className="discard-bar" role="alert">
          <span>Discard unsaved changes?</span>
          <div className="drawer-actions">
            <button
              className="danger-text"
              onClick={() => {
                setConfirmDiscard(false)
                onClose()
              }}
            >
              discard
            </button>
            <button onClick={() => setConfirmDiscard(false)}>keep editing</button>
          </div>
        </div>
      ) : (
        <div className="drawer-actions">
          <button className="primary" onClick={() => void save()}>
            {saved ? 'saved' : 'save'}
          </button>
          <button onClick={reconnect}>reconnect bridge</button>
        </div>
      )}
    </div>
  )
}
