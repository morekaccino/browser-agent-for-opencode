import { useEffect, useState } from 'react'
import { PRIVACY_VERSION, settings } from '../../lib/settings'
import { callBackground } from './rpc'
import { useActiveTab, useBridgeStatus } from './hooks'
import { useOpencode } from './useOpencode'
import { useWorkflows } from './useWorkflows'
import { useLayoutMode } from './design/useLayoutMode'
import { Snackbar, TooltipProvider } from './design/primitives'
import { ChatView } from './chat/ChatView'
import { OnboardingFlow } from './onboarding/OnboardingFlow'
import { SettingsView } from './settings/SettingsView'
import { NavDrawer } from './shell/NavDrawer'
import { NavRail, type Destination } from './shell/NavRail'
import { WorkflowsView } from './workflows/WorkflowsView'
import type { AttachedFile } from './attachments'

export default function App() {
  const { mode } = useLayoutMode()
  const bridge = useBridgeStatus()
  const tab = useActiveTab()
  const workflows = useWorkflows()

  const [serverUrl, setServerUrl] = useState('')
  const [auth, setAuth] = useState<{ username: string; password: string } | null>(null)
  const [includeContext, setIncludeContext] = useState(true)
  const [followAgent, setFollowAgent] = useState(false)
  const [consentVersion, setConsentVersion] = useState<number | null>(null)
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null)
  const [destination, setDestination] = useState<Destination>('chat')
  const [navOpen, setNavOpen] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [url, username, password, includePage, follow, consent, complete] = await Promise.all([
        settings.opencodeUrl.getValue(),
        settings.opencodeUsername.getValue(),
        settings.opencodePassword.getValue(),
        settings.includePageContext.getValue(),
        settings.followAgent.getValue(),
        settings.privacyConsentVersion.getValue(),
        settings.onboardingComplete.getValue(),
      ])
      if (cancelled) return
      setServerUrl(url)
      setAuth({ username, password })
      setIncludeContext(includePage)
      setFollowAgent(follow)
      setConsentVersion(consent)
      setOnboardingComplete(complete)
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
    const unwatchContext = settings.includePageContext.watch((value) => setIncludeContext(value ?? true))
    const unwatchFollow = settings.followAgent.watch((value) => setFollowAgent(value ?? false))
    const unwatchConsent = settings.privacyConsentVersion.watch((value) => setConsentVersion(value ?? 0))
    const unwatchOnboarding = settings.onboardingComplete.watch((value) => setOnboardingComplete(value ?? false))

    return () => {
      cancelled = true
      unwatchUrl()
      unwatchUser()
      unwatchPassword()
      unwatchContext()
      unwatchFollow()
      unwatchConsent()
      unwatchOnboarding()
    }
  }, [])

  const opencode = useOpencode(serverUrl, auth)

  useEffect(() => {
    if (!contextError) return
    const timer = setTimeout(() => setContextError(null), 7000)
    return () => clearTimeout(timer)
  }, [contextError])

  const reconnect = () => {
    void callBackground('bridge.reconnect').catch((error) => {
      setContextError(error instanceof Error ? error.message : String(error))
    })
  }

  const revealAgentTab = () => {
    void callBackground('agent.reveal').catch((error) => {
      setContextError(error instanceof Error ? error.message : String(error))
    })
  }

  const setFollow = (value: boolean) => {
    setFollowAgent(value)
    void settings.followAgent.setValue(value)
  }

  const setPageContext = (value: boolean) => {
    setIncludeContext(value)
    void settings.includePageContext.setValue(value)
  }

  const send = async (text: string, files: AttachedFile[] = []): Promise<boolean> => {
    setContextError(null)
    if (text.startsWith('/') && files.length === 0) {
      await opencode.runCommand(text)
      return true
    }

    let system: string | undefined
    let contextFiles: Array<{ mime: string; filename: string; dataUrl: string }> = []
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
          (model) => model.value === (opencode.model ? `${opencode.model.providerID}/${opencode.model.modelID}` : ''),
        )
        if (activeModel?.supportsImages) {
          let shot = (await callBackground('screenshot', { full_page: true }).catch(() => null)) as
            | { base64?: string }
            | null
          if (shot?.base64 && shot.base64.length > 8_000_000) {
            shot = (await callBackground('screenshot', { full_page: false }).catch(() => null)) as
              | { base64?: string }
              | null
          }
          if (shot?.base64) {
            contextFiles = [
              {
                mime: 'image/png',
                filename: 'page-full.png',
                dataUrl: `data:image/png;base64,${shot.base64}`,
              },
            ]
          }
        }
      } catch {
        /* screenshot context is best-effort */
      }
      if (pageBlock || tabsBlock) {
        system = [
          "You are running inside the user's Chrome browser through the opencode browser extension — you can freely interact with their browser on their behalf. The browser_* tools let you navigate, click, type, scroll, read and search the console, execute JavaScript, take screenshots, open/close/group tabs, upload local files to file inputs, and list downloads (whose files you can then read from disk). Act directly when asked; when the user wants only a plan — or you are in plan mode — research first and propose steps instead of making changes.",
          pageBlock &&
            `Here is a fresh snapshot of their active tab (element refs may go stale after navigation — take a new browser_snapshot when acting):\n\n${pageBlock}`,
          tabsBlock &&
            `These are all of the user's open tabs; pick whichever is relevant (the active tab is usually the right starting point) and pass its tab id to browser_* tools when working on another tab:\n\n${tabsBlock}`,
        ]
          .filter(Boolean)
          .join('\n\n')
      }
    }
    return opencode.send(text, { system, files: [...files, ...contextFiles] })
  }

  if (consentVersion == null || onboardingComplete == null) {
    return (
      <div className="app-splash" aria-busy="true">
        <img src="/icon/96.png" alt="" />
        <span>Loading…</span>
      </div>
    )
  }

  if (!onboardingComplete || consentVersion < PRIVACY_VERSION) {
    const initialStep =
      consentVersion < PRIVACY_VERSION
        ? consentVersion === 0 && !onboardingComplete
          ? 'welcome'
          : 'privacy'
        : 'connect'
    return (
      <OnboardingFlow
        initialStep={initialStep}
        bridge={bridge}
        serverUrl={serverUrl}
        health={opencode.health}
        onReconnect={reconnect}
        onComplete={() => setOnboardingComplete(true)}
      />
    )
  }

  return (
    <TooltipProvider delayDuration={350}>
      <div className={`app-shell mode-${mode}`}>
        {mode !== 'compact' ? (
          <NavRail destination={destination} onChange={setDestination} />
        ) : null}

        <main className="app-main">
          {destination === 'chat' ? (
            <ChatView
              opencode={opencode}
              bridge={bridge}
              tab={tab}
              serverUrl={serverUrl}
              mode={mode}
              onMenu={() => setNavOpen(true)}
              followAgent={followAgent}
              onToggleFollow={() => setFollow(!followAgent)}
              includeContext={includeContext}
              onIncludeContextChange={setPageContext}
              onReveal={revealAgentTab}
              onReconnect={reconnect}
              onSend={send}
            />
          ) : null}

          {destination === 'workflows' ? (
            <WorkflowsView
              mode={mode}
              onMenu={() => setNavOpen(true)}
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
              onOpenSession={(sessionId) => {
                opencode.setCurrentId(sessionId)
                setDestination('chat')
              }}
            />
          ) : null}

          {destination === 'settings' ? (
            <SettingsView
              mode={mode}
              onMenu={() => setNavOpen(true)}
              bridge={bridge}
              health={opencode.health}
              includeContext={includeContext}
              followAgent={followAgent}
              onIncludeContextChange={setPageContext}
              onToggleFollow={() => setFollow(!followAgent)}
              onReconnect={reconnect}
              onSaved={(url, username, password) => {
                setServerUrl(url)
                setAuth({ username, password })
              }}
            />
          ) : null}
        </main>

        <NavDrawer
          open={navOpen}
          onOpenChange={setNavOpen}
          destination={destination}
          onChange={setDestination}
          draftCount={workflows.drafts.length}
        />

        {contextError ? (
          <div className="app-snackbar">
            <Snackbar message={contextError} onClose={() => setContextError(null)} />
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  )
}
