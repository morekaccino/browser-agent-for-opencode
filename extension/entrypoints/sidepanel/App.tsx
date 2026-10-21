import { useEffect, useRef, useState } from 'react'
import { PRIVACY_VERSION, settings } from '../../lib/settings'
import { callBackground } from './rpc'
import { useActiveTab, useBridgeStatus } from './hooks'
import { useOpencode } from './useOpencode'
import { useWorkflows } from './useWorkflows'
import { MessageList } from './components/MessageList'
import { Composer, PermissionBar, type AttachedFile } from './components/Composer'
import { FormBar } from './components/FormCard'
import { PrivacyGate } from './components/PrivacyGate'
import { SessionPicker } from './components/SessionPicker'
import { SettingsDrawer } from './components/SettingsDrawer'
import { SetupCard } from './components/SetupCard'
import { UsageRing } from './components/UsageRing'
import { WorkflowsView } from './components/WorkflowsView'

function shortUrl(url?: string): string {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    return parsed.host + parsed.pathname
  } catch {
    return url
  }
}

export default function App() {
  const [serverUrl, setServerUrl] = useState('')
  const [auth, setAuth] = useState<{ username: string; password: string } | null>(null)
  const [includeContext, setIncludeContext] = useState(true)
  const [followAgent, setFollowAgent] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)
  const [view, setView] = useState<'chat' | 'workflows'>('chat')
  const [consentVersion, setConsentVersion] = useState<number | null>(null)

  const bridge = useBridgeStatus()
  const tab = useActiveTab()
  const workflows = useWorkflows()

  useEffect(() => {
    let cancelled = false
    void settings.privacyConsentVersion.getValue().then((version) => {
      if (!cancelled) setConsentVersion(version)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [url, username, password, includePage, follow] = await Promise.all([
        settings.opencodeUrl.getValue(),
        settings.opencodeUsername.getValue(),
        settings.opencodePassword.getValue(),
        settings.includePageContext.getValue(),
        settings.followAgent.getValue(),
      ])
      if (cancelled) return
      setServerUrl(url)
      setAuth({ username, password })
      setIncludeContext(includePage)
      setFollowAgent(follow)
    })()

    const unwatchUrl = settings.opencodeUrl.watch((value) => {
      if (value) setServerUrl(value)
    })
    const unwatchUser = settings.opencodeUsername.watch((value) => {
      setAuth((previous) => ({ username: value ?? '', password: previous?.password ?? '' }))
    })
    const unwatchPassword = settings.opencodePassword.watch((value) => {
      setAuth((previous) => ({ username: previous?.username ?? '', password: value ?? '' }))
    })
    const unwatchFollow = settings.followAgent.watch((value) => setFollowAgent(value ?? false))

    return () => {
      cancelled = true
      unwatchUrl()
      unwatchUser()
      unwatchPassword()
      unwatchFollow()
    }
  }, [])

  const toggleFollow = () => {
    setFollowAgent((previous) => {
      const next = !previous
      void settings.followAgent.setValue(next)
      return next
    })
  }

  const revealAgentTab = () => {
    void callBackground('agent.reveal').catch((error) => {
      setContextError(error instanceof Error ? error.message : String(error))
    })
  }

  const opencode = useOpencode(serverUrl, auth)
  const busy = opencode.currentId ? opencode.statuses[opencode.currentId] === 'busy' : false
  const currentPermissions = opencode.permissions.filter((p) => p.sessionID === opencode.currentId)
  const currentForms = opencode.forms.filter((form) => form.sessionID === opencode.currentId)
  const workflowAlert = workflows.activeRun != null || workflows.drafts.length > 0

  const openWorkflowSession = async (sessionId: string) => {
    try {
      await opencode.refreshSessions()
      opencode.setCurrentId(sessionId)
      setView('chat')
    } catch (error) {
      setContextError(error instanceof Error ? error.message : String(error))
    }
  }

  // transient errors auto-hide; the persistent connectivity banner covers the rest
  useEffect(() => {
    if (!opencode.lastError) return
    const timer = setTimeout(() => opencode.clearError(), 6000)
    return () => clearTimeout(timer)
  }, [opencode.lastError, opencode.clearError])

  useEffect(() => {
    if (!contextError) return
    const timer = setTimeout(() => setContextError(null), 6000)
    return () => clearTimeout(timer)
  }, [contextError])

  // Esc stops the run (menus handle their own Escape first)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (document.querySelector('.session-menu, .model-menu, .command-menu, .composer-opts.open, .usage-pop')) return
      if (busy) void opencode.abort()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, opencode.abort])

  // concise screen-reader announcements instead of re-reading the whole stream
  const [announcement, setAnnouncement] = useState('')
  const previousBusy = useRef(false)
  useEffect(() => {
    if (previousBusy.current && !busy) setAnnouncement('assistant replied')
    previousBusy.current = busy
  }, [busy])


  const send = async (text: string, files: AttachedFile[] = []): Promise<boolean> => {
    setContextError(null)
    if (text.startsWith('/') && files.length === 0) {
      await opencode.runCommand(text)
      return true
    }
    let system: string | undefined
    let contextFiles: { mime: string; filename: string; dataUrl: string }[] = []
    if (includeContext) {
      let pageBlock = ''
      let tabsBlock = ''
      try {
        const snapshot = await callBackground<string>('snapshot', { include_console: false })
        pageBlock = `<current-page>\n${snapshot}\n</current-page>`
      } catch (error) {
        setContextError(`page context failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      try {
        const tabs = await callBackground<string>('tabs.list')
        if (tabs && tabs !== '(no tabs)') {
          tabsBlock = `<open-tabs>\n${tabs.length > 4000 ? `${tabs.slice(0, 4000)}…` : tabs}\n</open-tabs>`
        }
      } catch {
        /* tab list unavailable */
      }
      try {
        const activeModel = opencode.models.find(
          (m) => m.value === (opencode.model ? `${opencode.model.providerID}/${opencode.model.modelID}` : ''),
        )
        if (activeModel?.supportsImages) {
          let shot: { base64?: string; mime?: string } | null = (await callBackground('screenshot', { full_page: true }).catch(() => null)) as
            | { base64?: string }
            | null
          if (shot?.base64 && shot.base64.length > 8_000_000) {
            shot = (await callBackground('screenshot', { full_page: false }).catch(() => null)) as { base64?: string } | null
          }
          if (shot?.base64) {
            contextFiles = [
              { mime: 'image/png', filename: 'page-full.png', dataUrl: `data:image/png;base64,${shot.base64}` },
            ]
          }
        }
      } catch {
        /* screenshot context is best-effort */
      }
      if (pageBlock || tabsBlock) {
        system = [
          'You are running inside the user\'s Chrome browser through the opencode browser extension — you can freely interact with their browser on their behalf. The browser_* tools let you navigate, click, type, scroll, read and search the console, execute JavaScript, take screenshots, open/close/group tabs, upload local files to file inputs, and list downloads (whose files you can then read from disk). Act directly when asked; when the user wants only a plan — or you are in plan mode — research first and propose steps instead of making changes.',
          pageBlock && `Here is a fresh snapshot of their active tab (element refs may go stale after navigation — take a new browser_snapshot when acting):\n\n${pageBlock}`,
          tabsBlock && `These are all of the user's open tabs; pick whichever is relevant (the active tab is usually the right starting point) and pass its tab id to browser_ tools when working on another tab:\n\n${tabsBlock}`,
        ]
          .filter(Boolean)
          .join('\n\n')
      }
    }
    return opencode.send(text, { system, files: [...files, ...contextFiles] })
  }

  const statusLabel =
    bridge.state === 'connected'
      ? `bridge connected${bridge.port ? ` :${bridge.port}` : ''}`
      : bridge.state === 'connecting'
        ? 'bridge connecting…'
        : bridge.state === 'error'
          ? `bridge error: ${bridge.detail ?? ''}`
          : 'bridge offline'

  const acceptPrivacy = async (includePageContext: boolean) => {
    await Promise.all([
      settings.privacyConsentVersion.setValue(PRIVACY_VERSION),
      settings.includePageContext.setValue(includePageContext),
    ])
    setIncludeContext(includePageContext)
    setConsentVersion(PRIVACY_VERSION)
  }

  if (consentVersion == null) {
    return <div className="privacy-gate" aria-busy="true" />
  }

  if (consentVersion < PRIVACY_VERSION) {
    return <PrivacyGate onAccept={(includePageContext) => void acceptPrivacy(includePageContext)} />
  }

  return (
    <div className="app">
      <header className="header">
        <span className={`status-dot status-${bridge.state}`} title={statusLabel} />
        <img src="/icon/48.png" alt="" className="brand-logo" />
        <strong className="brand" title="Browser Agent for opencode">
          Browser Agent
        </strong>
        {view === 'chat' && (
          <>
            <SessionPicker
              sessions={opencode.sessions}
              currentId={opencode.currentId}
              statuses={opencode.statuses}
              serverDown={opencode.health !== 'ok'}
              loaded={opencode.sessionsLoaded}
              onSelect={(id) => {
                opencode.setCurrentId(id)
                requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus())
              }}
              onNew={() => void opencode.newSession()}
              onRename={(id, title) => void opencode.renameSession(id, title)}
              onDelete={(id) => void opencode.deleteSession(id)}
            />
            <UsageRing
              tokens={opencode.contextUsage?.tokens ?? 0}
              limit={opencode.contextUsage?.limit ?? null}
              cost={opencode.sessionCost}
            />
          </>
        )}
        <button
          className={`icon-btn view-toggle${view === 'workflows' ? ' selected' : ''}`}
          title={
            view === 'chat'
              ? `Scheduled workflows${workflowAlert ? ' — attention needed' : ''}`
              : 'Back to chat'
          }
          aria-label={
            view === 'chat'
              ? `Open scheduled workflows${workflowAlert ? ', attention needed' : ''}`
              : 'Back to chat'
          }
          onClick={() => setView(view === 'chat' ? 'workflows' : 'chat')}
        >
          <span className="msym" aria-hidden="true">
            {view === 'chat' ? 'schedule' : 'forum'}
          </span>
          {workflowAlert && <span className="header-alert" aria-hidden="true" />}
        </button>
        <button className="icon-btn" title="Settings" aria-label="Settings" onClick={() => setSettingsOpen((v) => !v)}>
          <span className="msym" aria-hidden="true">
            settings
          </span>
        </button>
      </header>

      {view === 'chat' && <div className="page-bar" title={tab.url}>
        <span className={`health-dot health-${opencode.health}`} aria-hidden="true" />
        <div className="page-info">
          <span className="page-title">{tab.title || 'no active tab'}</span>
          <span className="page-url">{shortUrl(tab.url)}</span>
        </div>
        <button
          className={`icon-btn${followAgent ? ' on' : ''}`}
          onClick={toggleFollow}
          aria-pressed={followAgent}
          aria-label="Follow the AI to the tab it is working on"
          title={
            followAgent
              ? 'Following the AI: your view switches to whichever tab it is working on. Click to stop.'
              : 'Follow the AI: switch your view to the tab it is working on.'
          }
        >
          <span className="msym" aria-hidden="true">
            {followAgent ? 'check' : 'my_location'}
          </span>
        </button>
        <button
          className="icon-btn"
          title="Reveal the tab the AI is working on right now"
          aria-label="Reveal the tab the AI is working on"
          onClick={revealAgentTab}
        >
          <span className="msym" aria-hidden="true">
            visibility
          </span>
        </button>
      </div>}

      {serverUrl && opencode.health !== 'ok' && (
        <div className="banner warn">
          opencode server unreachable at <code>{serverUrl}</code>. Start opencode (shared V2 service), or run{' '}
          <code>opencode serve --port 4096</code>, or change the URL in settings. If auto-discover is on, reconnect the
          bridge. {bridge.state !== 'connected' && 'The browser bridge is also offline — make sure the plugin is installed.'}
        </div>
      )}

      {contextError && <div className="banner error small">{contextError}</div>}
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {view === 'chat' ? (
        <main className="main">
          {opencode.health !== 'ok' || bridge.state !== 'connected' ? (
            <SetupCard
              bridgeState={bridge.state}
              bridgeDetail={bridge.detail}
              serverUrl={serverUrl}
              health={opencode.health}
              onReconnect={() => {
                void callBackground('bridge.reconnect').catch(() => {})
              }}
            />
          ) : opencode.sessions.length === 0 ? (
            <div className="empty">
              <span className="msym">forum</span>
              <p>No sessions yet. Start one to work with the browser.</p>
              <button className="primary" onClick={() => void opencode.newSession()} disabled={opencode.health !== 'ok'}>
                New session
              </button>
            </div>
          ) : (
            <MessageList
              messages={opencode.messages}
              parts={opencode.parts}
              busy={busy}
              error={opencode.lastError}
              pendingText={opencode.pendingSend?.text}
              pendingFiles={opencode.pendingSend?.files}
              onRetry={(text) => void opencode.send(text, {})}
              onDismissError={opencode.clearError}
            />
          )}
        </main>
      ) : (
        <main className="main workflows-main">
          <WorkflowsView
            workflows={workflows.workflows}
            runs={workflows.runs}
            loaded={workflows.loaded}
            activeRun={workflows.activeRun}
            models={opencode.models}
            agents={opencode.agents}
            onCreate={workflows.create}
            onUpdate={workflows.update}
            onDelete={workflows.remove}
            onRun={workflows.runNow}
            onStop={workflows.stop}
            onOpenSession={(sessionId) => void openWorkflowSession(sessionId)}
          />
        </main>
      )}

      {view === 'chat' && (
        <>
          <PermissionBar permissions={currentPermissions} onReply={opencode.replyPermission} />
          <FormBar forms={currentForms} onReply={opencode.replyForm} onCancel={opencode.cancelForm} />

          <Composer
            disabled={opencode.health !== 'ok' || !opencode.currentId}
            busy={busy}
            sessionId={opencode.currentId}
            models={opencode.models}
            modelValue={opencode.model ? `${opencode.model.providerID}/${opencode.model.modelID}` : ''}
            onModelChange={opencode.chooseModel}
            includeContext={includeContext}
            onIncludeContextChange={(value) => {
              setIncludeContext(value)
              void settings.includePageContext.setValue(value)
            }}
            commands={opencode.commands}
            agents={opencode.agents}
            agent={opencode.agent}
            onAgentChange={opencode.setAgent}
            variant={opencode.variant}
            onVariantChange={opencode.chooseVariant}
            onSend={send}
            onStop={() => void opencode.abort()}
          />
        </>
      )}

      {settingsOpen && (
        <SettingsDrawer
          onClose={() => setSettingsOpen(false)}
          onSaved={(url, username, password) => {
            setServerUrl(url)
            setAuth({ username, password })
          }}
        />
      )}
    </div>
  )
}
