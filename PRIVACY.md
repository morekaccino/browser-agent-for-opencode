# Privacy policy — Browser Agent for opencode

**Effective date:** October 21, 2026

Browser Agent for opencode is an independent Chrome side-panel extension that
connects your browser to an opencode V2 service running on your computer. This
policy explains what data the extension handles, where it goes, and the choices
you have.

The short version: **the developer does not operate a server and does not
receive your data.** The extension sends the context you ask it to work on to
the opencode service on your machine. opencode then sends your prompt and that
context to the AI model provider you configured.

## 1. Who we are

Browser Agent for opencode is maintained by Mohamad Kazemi (“we”, “us”).
Contact: **contact@mrkazemi.com**.

This is an independent project. It is not affiliated with, endorsed by, or
sponsored by Anomaly Innovations, Inc., the opencode project, or Google.

## 2. Scope

This policy applies to:

- the Browser Agent for opencode Chrome extension;
- the `browser-bridge.ts` plugin that runs inside your opencode service; and
- the local loopback connection between them.

It does not apply to opencode itself, to a model provider you configure, or to
websites you visit. Those services have their own policies.

## 3. Data the extension handles

The extension works only when you send a prompt or run a workflow. Depending on
what you ask it to do, it may handle:

- **Website content** — page text, HTML/DOM structure, form values, selected
  text, console output, and screenshots of the tab the agent is working on.
- **Browsing activity** — the URL and title of the active tab, the list of open
  tabs (titles and URLs), and tab-group information.
- **Form data** — values you or the agent enter into forms, and files you attach
  to a prompt or ask the agent to upload to a file input.
- **Console data** — page console messages, uncaught errors, and the results of
  JavaScript expressions you ask the agent to evaluate.
- **Downloads metadata** — recent download names, URLs, and local file paths
  when you ask the agent to list downloads.
- **Workflow data** — workflow names, instructions, schedules, run history,
  summaries, model/agent choices, and results.
- **Connection data** — the local opencode server URL, optional username and
  password, and the bridge token or paired extension ID.
- **Settings** — theme, page-context preference, console engine, and similar
  extension preferences.

Some of this data can include personal information, personal communications,
authentication information, financial information, health information, or other
sensitive content if you use the extension on pages that contain it. Only use
the agent on pages and accounts you are allowed to automate, and avoid sensitive
pages unless you trust the model provider you configured.

## 4. How the data is used

The extension uses the data only to provide its single purpose: letting a local
opencode agent inspect and operate your browser on your instructions. That
includes taking page snapshots, clicking, typing, navigating, reading the
console, taking screenshots, managing tabs, uploading files, and running
scheduled workflows.

The extension does not use your data for advertising, profiling, credit
decisions, or any purpose unrelated to the browser task you requested.

## 5. Where data goes

- **Your local opencode service.** The extension sends prompts and context to
  the opencode V2 service running on your computer, normally over loopback
  (`localhost` / `127.0.0.1`). The bridge creates a local configuration file at
  `~/.config/opencode/browser-bridge.json` (Windows:
  `%USERPROFILE%\.config\opencode\browser-bridge.json`).
- **Your model provider.** opencode sends your prompt and the context you
  provided to the AI model provider you configured in opencode (for example, a
  hosted API or a local model). That provider’s privacy policy and retention
  practices apply to that request.
- **The developer.** Nothing is sent to the developer. There is no developer
  backend, no analytics SDK, no advertising SDK, and no data sale.

The extension previously requested provider logos from `models.dev`; that
request has been removed. Provider marks are now rendered locally as initials.

## 6. Storage and retention

- Extension settings, connection credentials, workflow definitions, run
  history, and cached session data are stored in `chrome.storage.local` on your
  device. This storage is local to the extension and is not synced by us.
- The bridge token and opencode connection credentials are stored locally so the
  extension can reconnect. They are not transmitted to the developer.
- opencode stores its own sessions, logs, and generated files (including
  screenshots saved to `.opencode-screenshots/`) on your device under its
  configured directories.
- Your model provider may retain prompts and responses according to its own
  policy. We do not control that retention.

## 7. Your choices and deletion

- **Page context:** Turn “Send page context with each prompt” off in the first-run
  screen, the composer, or settings. The agent can still take a snapshot when
  you explicitly ask it to.
- **Workflows:** Workflows are read-only by default. You can choose per workflow
  whether submissions and messages are allowed, and you can disable or delete a
  workflow at any time.
- **Clear extension data:** Settings → Data & privacy → “clear stored data”
  removes extension settings, workflows, run history, and local connection
  credentials. You can also uninstall the extension to remove its Chrome
  storage.
- **opencode data:** Delete opencode sessions, screenshots, and
  `browser-bridge.json` using opencode or your file manager. Uninstalling the
  extension does not delete opencode’s own data.
- **Model provider data:** Use your provider’s account controls to delete or
  export data held by that provider.

## 8. Security

- The bridge listens on loopback (`127.0.0.1`) only.
- The bridge remembers the first Chrome extension that pairs with it and rejects
  other extensions unless they present the configured bridge token.
- Agent-supplied JavaScript is executed only through Chrome’s Debugger API.
  The extension does not load remote scripts or execute remotely hosted files.
- Page data sent between the extension and a native program on the same
  computer is not required to be encrypted by the Chrome Web Store policy. If
  you point the extension at a remote opencode server, use HTTPS.
- No method of storage or transmission is completely secure. Do not use the
  extension on pages or accounts you cannot safely share with your configured
  model provider.

## 9. Children

The extension is not directed to children under 13. Do not use it to process a
child’s personal information.

## 10. Changes

If we change this policy or the extension’s data practices, we will update this
page and the effective date. If the change is material, the extension will ask
you to review the new disclosure before continuing to send data.

## 11. Chrome Web Store Limited Use

The use of information received from Google APIs will adhere to the Chrome Web
Store User Data Policy, including the Limited Use requirements. We do not sell
user data, do not use it for personalized advertising, and do not transfer it to
data brokers or advertising platforms.

## 12. Contact

Questions or requests: **contact@mrkazemi.com**

Project and issue tracker:
https://github.com/morekaccino/browser-agent-for-opencode
