#!/usr/bin/env node
/**
 * Cross-platform installer for the opencode browser bridge plugin.
 *
 * Copies plugin/browser-bridge.ts into the global opencode plugin directory
 * (V2: <config>/plugins) and creates browser-bridge.json with a token if it
 * does not exist yet.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(root, 'plugin', 'browser-bridge.ts')

function fallbackConfigDir() {
  return process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, 'opencode')
    : join(homedir(), '.config', 'opencode')
}

function configDir() {
  try {
    const out = execSync('opencode debug paths config', {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const labelled = out.match(/^config\s+(.+)$/m)
    if (labelled?.[1]) return labelled[1].trim()
    const lines = out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const last = lines[lines.length - 1]
    if (last) return last
  } catch {
    /* opencode not on PATH or V1 — use the documented fallback */
  }
  return fallbackConfigDir()
}

function writeTokenFile(file) {
  if (existsSync(file)) return false
  mkdirSync(dirname(file), { recursive: true })
  const token = randomUUID()
  const payload =
    JSON.stringify({ token, port: 8767, requireToken: false, allowedExtensionIds: [] }, null, 2) + '\n'
  writeFileSync(file, payload, process.platform === 'win32' ? undefined : { mode: 0o600 })
  try {
    if (process.platform !== 'win32') chmodSync(file, 0o600)
  } catch {
    /* best effort */
  }
  return true
}

if (!existsSync(source)) {
  console.error(`plugin source not found: ${source}`)
  process.exit(1)
}

const config = configDir()
const plugins = join(config, 'plugins')
const destination = join(plugins, 'browser-bridge.ts')
const tokenFile = join(config, 'browser-bridge.json')

mkdirSync(plugins, { recursive: true })
copyFileSync(source, destination)
const created = writeTokenFile(tokenFile)

console.log(`installed plugin -> ${destination}`)
console.log(`bridge config    -> ${tokenFile}${created ? ' (created)' : ' (existing)'}`)

try {
  const parsed = JSON.parse(readFileSync(tokenFile, 'utf8'))
  if (parsed?.token) console.log(`bridge token     -> ${parsed.token}`)
  if (parsed?.port) console.log(`bridge port      -> ${parsed.port}`)
  if (Array.isArray(parsed?.allowedExtensionIds) && parsed.allowedExtensionIds.length > 0) {
    console.log(`paired extensions -> ${parsed.allowedExtensionIds.join(', ')}`)
  }
} catch {
  console.warn('warning: could not read browser-bridge.json')
}

console.log('')
console.log('Restart opencode so the plugin loads:')
console.log('  opencode service restart   # shared V2 service')
console.log('  # or restart the TUI / `opencode serve` process')
console.log('')
console.log('Then run `npm run status` to print the opencode URL, password and bridge token.')
