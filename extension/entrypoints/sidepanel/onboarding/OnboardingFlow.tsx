import { useState } from 'react'
import { browser } from 'wxt/browser'
import type { BridgeStatus } from '../../../lib/protocol'
import { PRIVACY_URL, PRIVACY_VERSION, settings } from '../../../lib/settings'
import { Button, Switch } from '../design/primitives'
import { ConnectView } from '../chat/ConnectView'

type Step = 'welcome' | 'privacy' | 'connect'

export function OnboardingFlow({
  initialStep,
  bridge,
  serverUrl,
  health,
  onReconnect,
  onComplete,
}: {
  initialStep: Step
  bridge: BridgeStatus
  serverUrl: string
  health: 'ok' | 'down' | 'unknown'
  onReconnect: () => void
  onComplete: () => void
}) {
  const [step, setStep] = useState<Step>(initialStep)
  const [includePageContext, setIncludePageContext] = useState(true)

  const acceptPrivacy = async () => {
    const returning = await settings.onboardingComplete.getValue()
    await Promise.all([
      settings.privacyConsentVersion.setValue(PRIVACY_VERSION),
      settings.includePageContext.setValue(includePageContext),
    ])
    if (returning) {
      onComplete()
      return
    }
    setStep('connect')
  }

  const finish = async () => {
    // The "I already have opencode" shortcut may skip the privacy step.
    // Never finish onboarding without a current consent.
    const consent = await settings.privacyConsentVersion.getValue()
    if (consent < PRIVACY_VERSION) {
      setStep('privacy')
      return
    }
    await settings.onboardingComplete.setValue(true)
    onComplete()
  }

  const stepIndex = step === 'welcome' ? 0 : step === 'privacy' ? 1 : 2

  return (
    <div className="onboarding">
      <div className="onboarding-top">
        <div className="onboarding-brand">
          <img src="/icon/48.png" alt="" />
          <span>Browser Agent</span>
        </div>
        <div className="onboarding-progress" aria-label={`Step ${stepIndex + 1} of 3`}>
          {[0, 1, 2].map((index) => (
            <span key={index} className={index <= stepIndex ? 'is-active' : ''} />
          ))}
        </div>
      </div>

      {step === 'welcome' ? (
        <div className="onboarding-card">
          <span className="onboarding-kicker">Welcome</span>
          <h1>Your browser, with an agent.</h1>
          <p className="onboarding-lead">
            Browser Agent connects Chrome to opencode running on your computer. Ask it to look at the page, click, type,
            navigate, or run a task on a schedule.
          </p>
          <div className="onboarding-features">
            <div>
              <span className="msym" aria-hidden="true">visibility</span>
              <div>
                <strong>See the page</strong>
                <p>Snapshots, console output, and screenshots give the agent context.</p>
              </div>
            </div>
            <div>
              <span className="msym" aria-hidden="true">ads_click</span>
              <div>
                <strong>Act on it</strong>
                <p>Click, type, navigate, and manage tabs while you keep browsing.</p>
              </div>
            </div>
            <div>
              <span className="msym" aria-hidden="true">schedule</span>
              <div>
                <strong>Run it later</strong>
                <p>Scheduled workflows are read-only unless you explicitly allow submissions.</p>
              </div>
            </div>
          </div>
          <div className="onboarding-actions">
            <Button iconRight="arrow_forward" onClick={() => setStep('privacy')}>
              Get started
            </Button>
            <Button variant="text" onClick={() => setStep('privacy')}>
              I already have opencode
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'privacy' ? (
        <div className="onboarding-card">
          <span className="onboarding-kicker">Before you start</span>
          <h1>What leaves the browser?</h1>
          <p className="onboarding-lead">
            The extension sends the context you ask it to work on to opencode on your computer. opencode then sends
            your prompt and that context to the model provider you configured.
          </p>
          <ul className="onboarding-privacy-list">
            <li>
              <span className="msym" aria-hidden="true">travel_explore</span>
              <span><strong>What can be sent.</strong> Page text, form values, URLs, tab titles, console logs, screenshots, and attached files.</span>
            </li>
            <li>
              <span className="msym" aria-hidden="true">hub</span>
              <span><strong>Where it goes.</strong> Your local opencode service, then your AI model provider. Their policy applies to that request.</span>
            </li>
            <li>
              <span className="msym" aria-hidden="true">touch_app</span>
              <span><strong>What the agent can do.</strong> Click, type, navigate, read the console, take screenshots, and run JavaScript through Chrome's debugger.</span>
            </li>
            <li>
              <span className="msym" aria-hidden="true">visibility_off</span>
              <span><strong>What the developer sees.</strong> Nothing. No developer server, analytics, ads, or data sale.</span>
            </li>
          </ul>
          <div className="onboarding-option">
            <Switch
              checked={includePageContext}
              onCheckedChange={setIncludePageContext}
              label="Send page context with each prompt"
              supporting="Recommended. You can turn this off at any time in the composer."
            />
          </div>
          <div className="onboarding-actions">
            <Button icon="check" onClick={() => void acceptPrivacy()}>
              I understand — continue
            </Button>
            <Button variant="text" onClick={() => void browser.tabs.create({ url: PRIVACY_URL })}>
              Read the full privacy policy
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'connect' ? (
        <div className="onboarding-connect">
          <ConnectView
            bridgeState={bridge.state}
            bridgeDetail={bridge.detail}
            serverUrl={serverUrl}
            health={health}
            onReconnect={onReconnect}
          />
          <div className="onboarding-actions onboarding-connect-actions">
            <Button icon="arrow_forward" onClick={() => void finish()}>
              Continue to chat
            </Button>
            <Button
              variant="text"
              onClick={() => {
                void browser.tabs.create({ url: 'https://morekaccino.github.io/browser-agent-for-opencode/setup.html' })
              }}
            >
              Open the full setup guide
            </Button>
          </div>
        </div>
      ) : null}

      <p className="onboarding-foot">
        Independent project. Not affiliated with Anomaly Innovations, Inc., the opencode project, or Google. Only use the
        agent on pages and accounts you are allowed to automate.
      </p>
    </div>
  )
}
