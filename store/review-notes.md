# Test instructions for Chrome Web Store reviewers

Thanks for reviewing **Browser Agent for opencode**.

## What this item is

A Chrome side-panel client for a locally installed opencode V2 agent. The extension has no developer backend and no account. It connects to `localhost` only:

- `ws://127.0.0.1:8767` — the browser bridge plugin running inside opencode
- `http://localhost:<port>` — the opencode V2 HTTP API

Until opencode is running on the review machine, the side panel shows a setup screen. That is expected.

## Two-minute setup

1. Install opencode V2 for your platform from https://opencode.ai/docs, then run `opencode` once.
2. Open the extension's side panel (click the toolbar icon). In the setup screen, click **Download bridge plugin**.
3. Put the downloaded `browser-bridge.js` in your opencode plugins folder:
   - Windows: `%USERPROFILE%\.config\opencode\plugins\`
   - macOS/Linux: `~/.config/opencode/plugins/`
4. Restart opencode: `opencode service restart` (or restart the terminal UI / `opencode serve`).
5. Return to the side panel and click **reconnect bridge**. The bridge and server dots should turn green.

Developers can also run `npm run install-plugin` from the public repository:
https://github.com/morekaccino/browser-agent-for-opencode

The extension's setup screen is part of the product; no test credentials are required.

## Suggested test steps

1. Open `https://example.com`.
2. Open the side panel. Read the first-run privacy screen and click **I understand — continue**.
3. Ask: **“What's on this page?”**
   - The agent returns a page snapshot.
4. Ask: **“Click the ‘More information’ link and tell me where I landed.”**
   - The agent navigates the active tab.
5. Ask: **“Take a screenshot of this page.”**
   - Chrome may show a yellow “debugging” banner while the screenshot is captured. This is expected; the debugger detaches afterward.
6. Open **Workflows** (clock icon in the header) → **New**.
   - Workflows are **read-only by default**. The “Allow submissions and messages” checkbox is off unless the user enables it.
7. Create a read-only workflow with a simple instruction and click **Run now**. The run appears in history and a notification is shown when it finishes.

## Permissions and remote code

- `debugger` is used for DevTools-grade console capture, JavaScript evaluation through `Runtime.evaluate`, full-page screenshots, iframe input, and file uploads. It attaches only for explicit actions and detaches afterward in the default hook engine.
- Agent-supplied JavaScript is executed **only** through the Debugger API. The release contains no `eval()` or `new Function()`.
- `<all_urls>` is required because the user can ask the agent to work on any site, and scheduled workflows can target a site chosen by the user. Content scripts are packaged and only act when the user sends a prompt or runs a workflow.
- The extension has no analytics, ads, or data sale. It stores settings, workflows, and local connection credentials in `chrome.storage.local`.

## Local pairing and credentials

- The bridge listens on loopback and remembers the first Chrome extension that pairs with it in `~/.config/opencode/browser-bridge.json` (`allowedExtensionIds`).
- If you switch between a development build and the store build, remove `allowedExtensionIds` from that file, restart opencode, and reconnect.
- The bridge creates the file on first run. No token is needed for the first extension; producers (other opencode processes) need the token.

## Data flow

- The extension sends only what the user asks it to work on: page content, URLs, tab titles, console output, screenshots, form values, workflow instructions, and local connection data.
- The destination is the user's local opencode service, then the model provider configured in opencode. The developer receives nothing.
- The first-run screen discloses this and requires affirmative consent. Settings → Data & privacy has the full policy and a “clear stored data” action.

## If opencode cannot be installed

The extension's setup screen, privacy disclosure, workflow editor, and settings remain inspectable without a local server. Full browser automation requires opencode; a recorded walkthrough can be provided on request at **contact@mrkazemi.com**.

## Contact

**contact@mrkazemi.com**
https://github.com/morekaccino/browser-agent-for-opencode/issues
