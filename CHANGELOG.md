# Changelog

## 0.2.0 — first Chrome Web Store release

- Rebranded as **Browser Agent for opencode** (independent project).
- Added a first-run privacy disclosure and in-product consent gate.
- Added a Data & privacy settings section with policy link and data clearing.
- Added local setup onboarding with a one-click browser bridge plugin download.
- Agent-supplied JavaScript now runs only through Chrome's Debugger API.
- The bridge remembers the first paired extension ID and rejects other
  extensions unless they present the bridge token.
- Scheduled workflows are read-only by default; form/message submissions
  require an explicit per-workflow opt-in.
- Removed third-party provider logo requests; provider marks are local initials.
- Added a 440×280 store promo image, a new original icon set, and store
  screenshots.
- Added MIT license, third-party notices, security policy, and package
  verification.
- Added GitHub Pages documentation and privacy policy.

## Earlier development

- Side-panel chat UI for opencode V2, with streaming sessions, tools,
  permissions, and forms.
- Browser tools: snapshot, click, type, press, select, scroll, wait, navigate,
  tabs, upload, downloads, console, and screenshots.
- Scheduled workflows with run history, notifications, and per-workflow model,
  agent, start URL, and timeout.
- MV3 service worker bridge with tab grouping and follow-the-agent mode.
