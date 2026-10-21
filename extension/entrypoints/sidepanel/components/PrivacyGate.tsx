import { useState } from 'react'
import { browser } from 'wxt/browser'
import { PRIVACY_URL } from '../../../lib/settings'

/**
 * Prominent in-product disclosure required by the Chrome Web Store user-data
 * policy. Nothing is sent anywhere until the user accepts this screen.
 */
export function PrivacyGate({ onAccept }: { onAccept: (includePageContext: boolean) => void }) {
  const [includePageContext, setIncludePageContext] = useState(true)

  return (
    <div className="privacy-gate">
      <div className="privacy-card">
        <div className="privacy-mark" aria-hidden="true">
          <span className="msym">shield_lock</span>
        </div>
        <div className="privacy-kicker">Before you start</div>
        <h1>Your browser, with an agent.</h1>
        <p className="privacy-lead">
          This extension connects Chrome to opencode, the AI agent running on your computer. When you send a prompt or
          run a workflow, it sends the context you ask it to work on to that local service.
        </p>

        <ul className="privacy-list">
          <li>
            <span className="msym" aria-hidden="true">travel_explore</span>
            <span>
              <strong>What can be sent.</strong> Page text, form values, URLs, tab titles, console logs, screenshots,
              and the files you attach.
            </span>
          </li>
          <li>
            <span className="msym" aria-hidden="true">hub</span>
            <span>
              <strong>Where it goes.</strong> Your local opencode service, then the AI model provider you configured in
              opencode. Their privacy policy applies to that request.
            </span>
          </li>
          <li>
            <span className="msym" aria-hidden="true">touch_app</span>
            <span>
              <strong>What the agent can do.</strong> Click, type, navigate, manage tabs, read the console, take
              screenshots, and run JavaScript in a page through Chrome&apos;s debugger.
            </span>
          </li>
          <li>
            <span className="msym" aria-hidden="true">visibility_off</span>
            <span>
              <strong>What the developer sees.</strong> Nothing. There is no developer server, analytics, advertising,
              or data sale.
            </span>
          </li>
        </ul>

        <label className="checkbox-row privacy-option">
          <input
            type="checkbox"
            checked={includePageContext}
            onChange={(event) => setIncludePageContext(event.target.checked)}
          />
          <span>
            Send page context with each prompt
            <em>Recommended. You can turn this off here or at any time in the composer.</em>
          </span>
        </label>

        <div className="privacy-actions">
          <button className="primary" onClick={() => onAccept(includePageContext)}>
            I understand — continue
          </button>
          <button className="btn-tonal" onClick={() => void browser.tabs.create({ url: PRIVACY_URL })}>
            Read the full privacy policy
          </button>
        </div>

        <p className="privacy-foot">
          Independent project, not affiliated with Anomaly Innovations, Inc., the opencode project, or Google. Only use
          the agent on pages and accounts you are allowed to automate.
        </p>
      </div>
    </div>
  )
}
