# Security policy

## Supported versions

The latest published Chrome Web Store release and the current `main` branch
receive security fixes.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

- Email: **contact@mrkazemi.com**
- Or use GitHub's private vulnerability reporting:
  https://github.com/morekaccino/browser-agent-for-opencode/security/advisories/new

Include a description, reproduction steps, affected version, and any relevant
logs. Please avoid including live credentials, tokens, or private page content.

## Scope

In scope:

- the Chrome extension (`extension/`)
- the opencode browser bridge plugin (`plugin/browser-bridge.ts`)
- the local bridge transport and extension-ID pairing
- the installer scripts (`scripts/`)

Out of scope:

- vulnerabilities in opencode itself or a configured model provider
- pages the user explicitly asks the agent to automate
- local processes that can already read the user's opencode configuration

## Security model

- The bridge listens on `127.0.0.1` only.
- The first Chrome extension that connects is remembered by ID in
  `browser-bridge.json`; later extensions must match it or present the bridge
  token.
- The extension stores local connection credentials in `chrome.storage.local`.
  They are not sent to the developer.
- Agent-supplied JavaScript is executed only through Chrome's Debugger API.
- The developer operates no server and receives no page data.

## Rotating local credentials

If you believe the local opencode password or bridge token was exposed:

1. Delete `~/.config/opencode/browser-bridge.json` to generate a new bridge
   token (or set `requireToken` to `true` and use a new token).
2. Restart the opencode service.
3. Remove the extension from `chrome://extensions`, reload it, and reconnect.
4. If the opencode service password was exposed, restart the opencode service
   so it generates a new one, then update the extension settings.
