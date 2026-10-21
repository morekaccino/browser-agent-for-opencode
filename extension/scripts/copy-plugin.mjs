#!/usr/bin/env node
/**
 * Copy the opencode bridge plugin into the extension's public assets so the
 * side panel can offer a one-click download during setup. Generated file:
 * extension/public/bridge/browser-bridge.ts (gitignored).
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const extensionRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(extensionRoot, '..', 'plugin', 'browser-bridge.ts')
const destination = join(extensionRoot, 'public', 'bridge', 'browser-bridge.ts')

if (!existsSync(source)) {
  console.error(`plugin source not found: ${source}`)
  process.exit(1)
}

mkdirSync(dirname(destination), { recursive: true })
copyFileSync(source, destination)
console.log(`bridge plugin -> ${destination}`)
