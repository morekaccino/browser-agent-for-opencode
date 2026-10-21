# Browser Agent for opencode — extension

The WXT + React MV3 side panel for [Browser Agent for opencode](../README.md).

Quick commands:

- `npm run dev` — hot-reloading extension build
- `npm run build` — production build into `.output/chrome-mv3`
- `npm run zip` — Chrome Web Store zip
- `npm run compile` — typecheck

The production build includes the bridge plugin at `bridge/browser-bridge.ts`
so the setup screen can download it. `prebuild`/`prezip` copy it from
`../plugin/browser-bridge.ts`; the generated file is gitignored.

This extension targets opencode **V2** (`@opencode/client`). Node.js 20+ is
required for development only.
