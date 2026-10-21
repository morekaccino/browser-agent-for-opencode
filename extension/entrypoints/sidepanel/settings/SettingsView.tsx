import { useEffect, useRef, useState, type RefObject } from 'react'
import { browser } from 'wxt/browser'
import type { BridgeStatus } from '../../../lib/protocol'
import { PRIVACY_URL, settings } from '../../../lib/settings'
import { basicAuthHeader } from '../../../lib/auth'
import type { LayoutMode } from '../design/useLayoutMode'
import { Button, Field, ListItem, SegmentedControl, Switch, TextInput } from '../design/primitives'
import { AppBar } from '../shell/AppBar'

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
  opencodeUrl: 'http://localhost:4096',
  username: '',
  password: '',
  autoDiscover: true,
  bridgePort: 8767,
  bridgeToken: '',
  consoleEngine: 'hook',
  seed: '#6750A4',
  themeMode: 'auto',
}

export function SettingsView({
  mode,
  onMenu,
  bridge,
  health,
  includeContext,
  followAgent,
  onIncludeContextChange,
  onToggleFollow,
  onReconnect,
  onSaved,
}: {
  mode: LayoutMode
  onMenu: () => void
  bridge: BridgeStatus
  health: 'ok' | 'down' | 'unknown'
  includeContext: boolean
  followAgent: boolean
  onIncludeContextChange: (value: boolean) => void
  onToggleFollow: () => void
  onReconnect: () => void
  onSaved: (url: string, username: string, password: string) => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [tokenVisible, setTokenVisible] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [discovered, setDiscovered] = useState<{ version?: string; directory?: string; url?: string } | null>(null)
  const [activeSection, setActiveSection] = useState('connection')
  const connectionRef = useRef<HTMLElement>(null)
  const appearanceRef = useRef<HTMLElement>(null)
  const assistantRef = useRef<HTMLElement>(null)
  const privacyRef = useRef<HTMLElement>(null)
  const aboutRef = useRef<HTMLElement>(null)

  useEffect(() => {
    void (async () => {
      const [opencodeUrl, username, password, autoDiscover, bridgePort, bridgeToken, consoleEngine, seed, themeMode, endpoint] =
        await Promise.all([
          settings.opencodeUrl.getValue(),
          settings.opencodeUsername.getValue(),
          settings.opencodePassword.getValue(),
          settings.opencodeAutoDiscover.getValue(),
          settings.bridgePort.getValue(),
          settings.bridgeToken.getValue(),
          settings.consoleEngine.getValue(),
          settings.themeSeed.getValue(),
          settings.themeMode.getValue(),
          settings.opencodeEndpoint.getValue(),
        ])
      setForm({ opencodeUrl, username, password, autoDiscover, bridgePort, bridgeToken, consoleEngine, seed, themeMode })
      setDiscovered(endpoint)
      setLoaded(true)
    })()
  }, [])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }))

  const saveConnection = async () => {
    const url = form.opencodeUrl.trim().replace(/^(https?:\/\/)127\.0\.0\.1(?=[:/]|$)/, '$1localhost').replace(/\/$/, '')
    await Promise.all([
      settings.opencodeUrl.setValue(url || 'http://localhost:4096'),
      settings.opencodeUsername.setValue(form.username.trim()),
      settings.opencodePassword.setValue(form.password),
      settings.opencodeAutoDiscover.setValue(form.autoDiscover),
      settings.bridgePort.setValue(Number(form.bridgePort) || 8767),
      settings.bridgeToken.setValue(form.bridgeToken.trim()),
    ])
    set('opencodeUrl', url || 'http://localhost:4096')
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
    onSaved(url || 'http://localhost:4096', form.username.trim(), form.password)
  }

  const testConnection = async () => {
    setTestResult('testing…')
    try {
      const url = form.opencodeUrl.trim().replace(/\/$/, '') || 'http://localhost:4096'
      const headers: Record<string, string> = {}
      if (form.password || form.username) headers.Authorization = basicAuthHeader(form.username.trim(), form.password)
      const response = await fetch(`${url}/api/info`, { headers, signal: AbortSignal.timeout(4000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as { version?: string }
      setTestResult(`connected — opencode ${data.version ?? 'ok'}`)
    } catch (error) {
      setTestResult(`failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const updateConsoleEngine = async (value: 'hook' | 'debugger') => {
    set('consoleEngine', value)
    await settings.consoleEngine.setValue(value)
  }

  const updateTheme = async (seed: string, themeMode: FormState['themeMode']) => {
    setForm((previous) => ({ ...previous, seed, themeMode }))
    await Promise.all([settings.themeSeed.setValue(seed), settings.themeMode.setValue(themeMode)])
  }

  const scrollTo = (id: string) => {
    setActiveSection(id)
    const map: Record<string, RefObject<HTMLElement | null>> = {
      connection: connectionRef,
      appearance: appearanceRef,
      assistant: assistantRef,
      privacy: privacyRef,
      about: aboutRef,
    }
    map[id]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const reviewDisclosure = async () => {
    await Promise.all([
      settings.privacyConsentVersion.setValue(0),
      settings.onboardingComplete.setValue(false),
    ])
    window.location.reload()
  }

  if (!loaded) {
    return (
      <div className="settings-view">
        <AppBar title="Settings" onMenu={mode === 'compact' ? onMenu : undefined} />
        <div className="settings-loading">Loading settings…</div>
      </div>
    )
  }

  return (
    <div className="settings-view">
      <AppBar title="Settings" subtitle="Connection, appearance, privacy" onMenu={mode === 'compact' ? onMenu : undefined} />
      <div className="settings-layout">
        {mode !== 'compact' ? (
          <aside className="settings-nav" aria-label="Settings sections">
            {(
              [
                { id: 'connection', icon: 'cable', label: 'Connection' },
                { id: 'appearance', icon: 'palette', label: 'Appearance' },
                { id: 'assistant', icon: 'smart_toy', label: 'Assistant' },
                { id: 'privacy', icon: 'shield', label: 'Data & privacy' },
                { id: 'about', icon: 'info', label: 'About' },
              ] as const
            ).map((item) => (
              <ListItem
                key={item.id}
                selected={activeSection === item.id}
                leading={
                  <span className={`msym sm${activeSection === item.id ? ' filled' : ''}`} aria-hidden="true">
                    {item.icon}
                  </span>
                }
                headline={item.label}
                onClick={() => scrollTo(item.id)}
              />
            ))}
          </aside>
        ) : null}

        <div className="settings-content">
          <section ref={connectionRef} className="settings-section">
            <div className="settings-section-head">
              <h2>Connection</h2>
              <p>Where the extension finds opencode and how it pairs with the browser bridge.</p>
            </div>
            <div className="settings-card">
              <div className="connection-status-row">
                <span className="connection-status-label">Browser bridge</span>
                <span className={`status-chip ${bridge.state === 'connected' ? 'is-ok' : 'is-warn'}`}>
                  <span className="status-dot" />
                  {bridge.state === 'connected' ? `connected${bridge.port ? ` :${bridge.port}` : ''}` : bridge.state}
                </span>
              </div>
              <div className="connection-status-row">
                <span className="connection-status-label">opencode server</span>
                <span className={`status-chip ${health === 'ok' ? 'is-ok' : 'is-warn'}`}>
                  <span className="status-dot" />
                  {health === 'ok' ? 'connected' : health === 'unknown' ? 'checking' : 'offline'}
                </span>
              </div>
              {discovered ? (
                <div className="settings-note">discovered opencode {discovered.version ?? 'local'}</div>
              ) : null}
              <div className="settings-row-actions">
                <Button variant="tonal" size="sm" icon="refresh" onClick={onReconnect}>
                  reconnect bridge
                </Button>
              </div>
            </div>

            <div className="settings-card">
              <Switch
                checked={form.autoDiscover}
                onCheckedChange={(value) => {
                  set('autoDiscover', value)
                  void settings.opencodeAutoDiscover.setValue(value)
                }}
                label="Auto-discover the local opencode service"
                supporting="The bridge reads the service registration and fills the URL and password automatically."
              />
              <button type="button" className="settings-disclosure" onClick={() => setManualOpen((value) => !value)}>
                <span>Manual connection</span>
                <span className={`msym sm${manualOpen ? ' is-open' : ''}`} aria-hidden="true">expand_more</span>
              </button>
              {manualOpen ? (
                <div className="settings-manual">
                  <Field label="Server URL" hint="Use localhost, not 127.0.0.1, for Chrome local network access.">
                    <TextInput
                      value={form.opencodeUrl}
                      onChange={(event) => set('opencodeUrl', event.target.value)}
                      placeholder="http://localhost:4096"
                      disabled={form.autoDiscover}
                    />
                  </Field>
                  <Field label="Username (optional)">
                    <TextInput
                      value={form.username}
                      onChange={(event) => set('username', event.target.value)}
                      placeholder="opencode"
                      autoComplete="off"
                      disabled={form.autoDiscover}
                    />
                  </Field>
                  <Field label="Password (optional)">
                    <TextInput
                      type="password"
                      value={form.password}
                      onChange={(event) => set('password', event.target.value)}
                      placeholder="OPENCODE_SERVER_PASSWORD"
                      autoComplete="off"
                      disabled={form.autoDiscover}
                    />
                  </Field>
                  <Field label="Bridge port" hint="Default 8767. Must match browser-bridge.json.">
                    <TextInput
                      type="number"
                      value={form.bridgePort}
                      onChange={(event) => set('bridgePort', Number(event.target.value))}
                    />
                  </Field>
                  <Field label="Bridge token (optional)" hint="Only needed when requireToken is true in browser-bridge.json.">
                    <div className="settings-secret">
                      <TextInput
                        type={tokenVisible ? 'text' : 'password'}
                        value={form.bridgeToken}
                        onChange={(event) => set('bridgeToken', event.target.value)}
                        placeholder="auto-paired by default"
                        autoComplete="off"
                      />
                      <Button variant="text" size="sm" icon={tokenVisible ? 'visibility_off' : 'visibility'} onClick={() => setTokenVisible((value) => !value)}>
                        {tokenVisible ? 'hide' : 'show'}
                      </Button>
                    </div>
                  </Field>
                  <div className="settings-row-actions">
                    <Button size="sm" icon="save" onClick={() => void saveConnection()}>
                      {saved ? 'saved' : 'save connection'}
                    </Button>
                    <Button variant="tonal" size="sm" icon="network_check" onClick={() => void testConnection()}>
                      test
                    </Button>
                    {testResult ? <span className={`settings-test ${testResult.startsWith('connected') ? 'is-ok' : ''}`}>{testResult}</span> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section ref={appearanceRef} className="settings-section">
            <div className="settings-section-head">
              <h2>Appearance</h2>
              <p>Material 3 color and theme. Changes apply immediately.</p>
            </div>
            <div className="settings-card">
              <div className="settings-field">
                <span className="settings-field-label">Theme</span>
                <SegmentedControl
                  value={form.themeMode}
                  onChange={(value) => void updateTheme(form.seed, value)}
                  options={[
                    { value: 'auto', label: 'Auto', icon: 'brightness_auto' },
                    { value: 'light', label: 'Light', icon: 'light_mode' },
                    { value: 'dark', label: 'Dark', icon: 'dark_mode' },
                  ]}
                  label="Theme mode"
                />
              </div>
              <div className="settings-field">
                <span className="settings-field-label">Accent</span>
                <div className="seed-row">
                  <div className="seed-swatches">
                    {SEED_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`seed-swatch${form.seed.toLowerCase() === preset.toLowerCase() ? ' is-selected' : ''}`}
                        style={{ background: preset }}
                        title={preset}
                        aria-label={`Accent ${preset}`}
                        onClick={() => void updateTheme(preset, form.themeMode)}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={form.seed}
                    onChange={(event) => void updateTheme(event.target.value, form.themeMode)}
                    title="Custom accent color"
                  />
                </div>
              </div>
            </div>
          </section>

          <section ref={assistantRef} className="settings-section">
            <div className="settings-section-head">
              <h2>Assistant</h2>
              <p>How the agent captures the page and follows its work.</p>
            </div>
            <div className="settings-card">
              <div className="settings-field">
                <span className="settings-field-label">Console engine</span>
                <SegmentedControl
                  value={form.consoleEngine}
                  onChange={(value) => void updateConsoleEngine(value)}
                  options={[
                    { value: 'hook', label: 'Hook', icon: 'terminal' },
                    { value: 'debugger', label: 'Debugger', icon: 'bug_report' },
                  ]}
                  label="Console engine"
                />
                <p className="settings-hint">
                  Hook captures new logs without keeping the debugger attached. Debugger keeps full DevTools fidelity
                  and shows a debugging banner.
                </p>
              </div>
              <Switch
                checked={includeContext}
                onCheckedChange={onIncludeContextChange}
                label="Send page context by default"
                supporting="Include a snapshot of the active tab with each prompt."
              />
              <Switch
                checked={followAgent}
                onCheckedChange={() => onToggleFollow()}
                label="Follow the agent"
                supporting="Switch your view to the tab the agent is working on."
              />
            </div>
          </section>

          <section ref={privacyRef} className="settings-section">
            <div className="settings-section-head">
              <h2>Data &amp; privacy</h2>
              <p>The developer operates no server and receives no page data.</p>
            </div>
            <div className="settings-card">
              <ListItem
                leading={<span className="msym sm" aria-hidden="true">policy</span>}
                headline="Privacy policy"
                supporting="What is sent to opencode and your model provider."
                trailing={<span className="msym sm" aria-hidden="true">open_in_new</span>}
                onClick={() => void browser.tabs.create({ url: PRIVACY_URL })}
              />
              <ListItem
                leading={<span className="msym sm" aria-hidden="true">visibility</span>}
                headline="Review privacy disclosure"
                supporting="Show the first-run explanation again."
                onClick={() => void reviewDisclosure()}
              />
              <div className="settings-danger">
                <Button
                  variant="text"
                  size="sm"
                  icon="delete"
                  onClick={() => {
                    if (!confirmClear) {
                      setConfirmClear(true)
                      return
                    }
                    void browser.storage.local.clear().then(() => window.location.reload())
                  }}
                >
                  {confirmClear ? 'click again to clear everything' : 'clear stored data'}
                </Button>
                <p>Removes extension settings, workflows, run history, and local connection credentials.</p>
              </div>
            </div>
          </section>

          <section ref={aboutRef} className="settings-section">
            <div className="settings-section-head">
              <h2>About</h2>
            </div>
            <div className="settings-card settings-about">
              <div className="settings-about-brand">
                <img src="/icon/48.png" alt="" />
                <div>
                  <strong>Browser Agent for opencode</strong>
                  <span>v{browser.runtime.getManifest().version} · MIT</span>
                </div>
              </div>
              <p>
                An independent Chrome side-panel client for opencode V2. Not affiliated with Anomaly Innovations, Inc.,
                the opencode project, or Google.
              </p>
              <div className="settings-row-actions">
                <Button
                  variant="text"
                  size="sm"
                  icon="open_in_new"
                  onClick={() => void browser.tabs.create({ url: 'https://github.com/morekaccino/browser-agent-for-opencode' })}
                >
                  source
                </Button>
                <Button
                  variant="text"
                  size="sm"
                  icon="bug_report"
                  onClick={() => void browser.tabs.create({ url: 'https://github.com/morekaccino/browser-agent-for-opencode/issues' })}
                >
                  report an issue
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
