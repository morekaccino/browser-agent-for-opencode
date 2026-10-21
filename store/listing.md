# Chrome Web Store listing

## Item

- **Name:** Browser Agent for opencode
- **Version:** 0.2.0
- **Category:** Developer Tools
- **Language:** English
- **Homepage:** https://morekaccino.github.io/browser-agent-for-opencode/
- **Support:** https://github.com/morekaccino/browser-agent-for-opencode/issues
- **Privacy policy:** https://morekaccino.github.io/browser-agent-for-opencode/privacy.html
- **Visibility:** Unlisted for the first review, then Public after approval
- **Price:** Free

## Short description (132 characters max)

Drive Chrome with a local opencode AI agent — page snapshots, clicks, typing, navigation, console access, and scheduled tasks.

## Detailed description

**Browser Agent for opencode** turns Chrome's side panel into a workspace for a local opencode V2 agent. Ask it to look at the page, click, type, navigate, read the console, take a screenshot, or run a scheduled browser task — while you keep browsing in the same tabs.

This extension is the browser side. It connects to opencode running on your computer. There is no developer server, no account, and no cloud relay.

### What it does

- **Page snapshots** with stable `[ref=eN]` element references.
- **Browser actions** — click, hover, type, press keys, select, scroll, wait for elements, navigate, and manage tabs.
- **Console access** — read recent logs and errors; evaluate JavaScript through Chrome's debugger API.
- **Screenshots** for visual tasks, charts, layouts, and broken styling.
- **Tabs and downloads** — list, open, close, group, and inspect recent downloads.
- **Scheduled workflows** — save a self-contained instruction and run it on a schedule. Workflows are read-only by default; you can opt in to form submissions or messages per workflow.

### How it works

The extension talks to opencode V2 over a loopback bridge on your machine. opencode does the reasoning and tool calls, and the extension carries out the browser actions. The bridge listens on `127.0.0.1` only.

### Requirements

- Chrome 114 or newer.
- opencode V2 installed and running on the same computer.
- The browser bridge plugin installed in opencode. The side panel's setup screen can download it.
- A model provider configured in opencode (hosted or local).

Setup takes about two minutes. The side panel includes the plugin download and a connection check.

### Privacy

The extension has no analytics, ads, or data sales. It stores settings, workflows, and local connection credentials in Chrome's local storage. Page context is sent to your local opencode service and then to the model provider you configured; the developer receives nothing. See the privacy policy for details, including how to clear stored data.

### Independent project

Browser Agent for opencode is not affiliated with, endorsed by, or sponsored by Anomaly Innovations, Inc., the opencode project, or Google. opencode and Chrome are trademarks of their respective owners.

## What's new in 0.2.0

- First Chrome Web Store release.
- First-run privacy disclosure and consent.
- One-click browser bridge plugin download.
- Debugger-only JavaScript execution.
- Read-only scheduled workflows by default.
- Redesigned Material 3 side panel with light/dark themes, adaptive navigation, and a quieter chat layout.
- Reworked workflows and settings, with clearer read-only safety and run detail.
- New original icon, store screenshots, and setup docs.

## Store assets

| Asset | File |
| --- | --- |
| Store icon (128×128, 96×96 artwork) | `store/icon/icon-128.png` |
| Small promo (440×280) | `store/promo/small-440x280.png` |
| Screenshot 1 — chat | `store/screenshots/01-chat.png` |
| Screenshot 2 — privacy disclosure | `store/screenshots/02-privacy.png` |
| Screenshot 3 — workflows | `store/screenshots/03-workflows.png` |
| Screenshot 4 — settings and appearance | `store/screenshots/04-settings.png` |

All screenshots are 1280×800 PNGs with square corners. They show a clean demo profile and a fictional Acme dashboard — no personal tabs, sessions, or account data.

## Reviewer-facing notes

Use `store/review-notes.md` in the dashboard's **Test instructions** field. The extension requires a local opencode install; the notes explain the two-minute setup and what to test.

## Submission strategy

1. Upload `store/browser-agent-for-opencode-0.2.0-chrome.zip`.
2. Submit with **Unlisted** visibility.
3. After approval, switch to **Public** and update the docs “Chrome Web Store” link.
4. Keep the GitHub issue tracker available for support.
