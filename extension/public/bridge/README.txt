Browser bridge plugin for opencode
==================================

The side panel downloads browser-bridge.ts from this folder. Put that file in
your opencode plugins directory:

  Windows:  %USERPROFILE%\.config\opencode\plugins\
  macOS/Linux: ~/.config/opencode/plugins/

Then restart opencode:

  opencode service restart

The plugin listens on 127.0.0.1 and creates browser-bridge.json on first run.
The first Chrome extension that connects is remembered in allowedExtensionIds.
To reset pairing, remove that field from browser-bridge.json and reconnect.

Source: https://github.com/morekaccino/browser-agent-for-opencode
License: MIT
