# Permission justifications

Use these texts in the Chrome Web Store **Privacy practices → Permissions** fields.

## Single purpose

> An AI browser-automation side panel that connects to the user's locally installed opencode V2 agent to inspect and operate the active Chrome tab and run user-defined scheduled browser tasks.

## `storage`

> Saves extension settings, theme choice, the user's workflow definitions and run history, cached session metadata, and the local opencode connection URL/credentials so the extension can reconnect. All data stays in `chrome.storage.local`; it is not synced or sent to the developer.

## `tabs`

> Lists open tabs and their titles/URLs for the agent's context, and lets the agent create, activate, close, and group tabs when the user asks it to work on a tab. The extension does not read browsing history.

## `scripting`

> Injects the extension's own packaged content scripts into tabs that were open before install/update, and runs the packaged page actions (snapshot, click, type, scroll, wait). No remote scripts are loaded.

## `debugger`

> Attaches Chrome's debugger only for explicit actions that need DevTools-level access: console capture in debugger mode, JavaScript evaluation through `Runtime.evaluate`, full-page screenshots, iframe input, and attaching local files to file inputs. The extension detaches when the action finishes unless the user selected the persistent debugger console engine. This permission is central to the extension's browser-automation fidelity.

## `sidePanel`

> Provides the extension's main chat and workflow UI in Chrome's side panel.

## `alarms`

> Fires scheduled workflows and retries the local bridge connection after Chrome's service worker has been suspended.

## `tabGroups`

> Groups tabs opened by the agent so the user can see and close them together, and updates the group title/color while the agent works.

## `downloads`

> Lists recent downloads and their local file paths when the user asks the agent where a downloaded file went. The extension does not download files on its own.

## `notifications`

> Notifies the user when a scheduled workflow finishes, fails, or needs attention.

## Host permission: `<all_urls>`

> The user can ask the agent to work on any website, and scheduled workflows can target a site chosen by the user. The extension cannot know in advance which site will be used. Content scripts are packaged with the extension and only act when the user sends a prompt or runs a workflow. The extension also needs to reach the opencode service on `localhost`.

## Remote code declaration

**Does the extension use remote code?** Yes.

> All extension logic is packaged in the extension. The extension connects to the user's locally installed opencode V2 agent over a loopback WebSocket. When the user asks the agent to evaluate a JavaScript expression in the current tab, the extension executes that expression only through Chrome's Debugger API (`Runtime.evaluate`), which is the documented MV3 exemption for remote logic. No remote scripts or remotely hosted files are loaded or evaluated in the extension. The extension does not use `eval()` or `new Function()`; the packaged `browser_console` tool description and the hook-mode fallback were removed. The agent can also request fixed browser actions (click, type, navigate, screenshot, tabs, upload, downloads), which are data operations implemented in packaged code.

## Data usage disclosures

See `store/privacy-practices.md` for the recommended checkbox values and certification statements.
