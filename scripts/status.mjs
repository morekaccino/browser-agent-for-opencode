#!/usr/bin/env node
/** Print the local opencode V2 service details and browser bridge token. */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

function fallbackConfigDir() {
  return process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, 'opencode')
    : join(homedir(), '.config', 'opencode')
}

function fallbackStateDir() {
  return process.env.XDG_STATE_HOME
    ? join(process.env.XDG_STATE_HOME, 'opencode')
    : join(homedir(), '.local', 'state', 'opencode')
}

function debugPath(kind) {
  try {
    const out = execSync(`opencode debug paths ${kind}`, {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const labelled = out.match(new RegExp(`^${kind}\\s+(.+)$`, 'm'))
    if (labelled?.[1]) return labelled[1].trim()
    const lines = out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length > 0) return lines[lines.length - 1]
  } catch {
    /* opencode not on PATH */
  }
  return null
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function normalizeUrl(url) {
  return String(url ?? '').replace(/^(https?:\/\/)127\.0\.0\.1(?=[:/]|$)/, '$1localhost').replace(/\/$/, '')
}

const config = debugPath('config') ?? fallbackConfigDir()
const state = debugPath('state') ?? fallbackStateDir()
const registration = readJson(join(state, 'service.json'))
const privateConfig = readJson(join(config, 'service.json'))
const bridge = readJson(join(config, 'browser-bridge.json'))

let url = registration?.url ? normalizeUrl(registration.url) : ''
let password = registration?.password ?? privateConfig?.password ?? ''
const version = registration?.version ?? ''

if (!url) {
  try {
    const out = execSync('opencode service status', {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const found = out.match(/https?:\/\/\S+/)
    if (found) url = normalizeUrl(found[0])
  } catch {
    /* service not running */
  }
}

console.log(`opencode config : ${config}`)
console.log(`opencode state  : ${state}`)
console.log(`opencode server : ${url || '(not running / not registered)'}${version ? `  (v${version})` : ''}`)
console.log(`server username : opencode`)
console.log(`server password : ${password || '(none)'}`)
console.log(`bridge config   : ${join(config, 'browser-bridge.json')}`)
console.log(`bridge port     : ${bridge?.port ?? '(not created yet)'}`)
console.log(`bridge token    : ${bridge?.token ?? '(not created yet)'}`)
console.log(`require token   : ${bridge?.requireToken === true ? 'yes (manual paste required)' : 'no (paired Chrome extension auto-connects)'}`)
console.log(
  `paired extensions: ${
    Array.isArray(bridge?.allowedExtensionIds) && bridge.allowedExtensionIds.length > 0
      ? bridge.allowedExtensionIds.join(', ')
      : '(first extension that connects is remembered)'
  }`,
)

if (url) {
  try {
    const headers = password
      ? { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` }
      : undefined
    const response = await fetch(`${url}/api/info`, {
      headers,
      signal: AbortSignal.timeout(5_000),
    })
    const body = await response.text()
    if (!response.ok) throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`)
    const info = JSON.parse(body)
    console.log(`health          : ok — opencode ${info.version} (pid ${info.pid})`)
  } catch (error) {
    console.log(`health          : failed — ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (!bridge) {
  console.log('')
  console.log('Run `npm run install-plugin` (after starting opencode once) to create the bridge config.')
}
