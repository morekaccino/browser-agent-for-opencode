#!/usr/bin/env node
/**
 * Verify the Chrome Web Store package before upload.
 *
 * Checks the built extension for forbidden development files, hardcoded
 * secrets, personal paths, remote-code patterns, manifest mistakes, and zip
 * layout. Exits non-zero on any failure.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const outDir = join(root, 'extension', '.output', 'chrome-mv3')
const extensionPkg = JSON.parse(readFileSync(join(root, 'extension', 'package.json'), 'utf8'))

const failures = []
const warnings = []
const fail = (message) => failures.push(message)
const warn = (message) => warnings.push(message)

if (!existsSync(outDir)) {
  console.error(`build output not found: ${outDir}\nrun: npm run store:build`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'))

/* ------------------------------------------------------------------ manifest */
if (manifest.manifest_version !== 3) fail('manifest_version must be 3')
if (manifest.name !== 'Browser Agent for opencode') fail(`unexpected name: ${manifest.name}`)
if (manifest.version !== extensionPkg.version) {
  fail(`manifest version ${manifest.version} does not match extension/package.json ${extensionPkg.version}`)
}
if (!manifest.description || manifest.description.length > 132) {
  fail(`description must be 1-132 characters (got ${manifest.description?.length ?? 0})`)
}
if (manifest.key) fail('manifest must not contain a key (Chrome Web Store assigns one)')
if (manifest.update_url) fail('manifest must not contain update_url')
if (!manifest.background?.service_worker) fail('missing background.service_worker')
if (!manifest.side_panel?.default_path) fail('missing side_panel.default_path')
if (!manifest.permissions?.includes('debugger')) warn('debugger permission is not declared')
if (!manifest.host_permissions?.includes('<all_urls>')) warn('host_permissions does not include <all_urls>')

const iconSizes = ['16', '32', '48', '96', '128']
for (const size of iconSizes) {
  const icon = manifest.icons?.[size]
  if (!icon) {
    fail(`manifest.icons is missing ${size}.png`)
    continue
  }
  if (!existsSync(join(outDir, icon))) fail(`manifest icon does not exist: ${icon}`)
}

for (const referenced of [manifest.background?.service_worker, manifest.side_panel?.default_path]) {
  if (referenced && !existsSync(join(outDir, referenced))) fail(`manifest target missing: ${referenced}`)
}

/* --------------------------------------------------------------------- files */
const forbiddenNames = [
  '.env',
  '.env.local',
  '.env.production',
  'desktop.ini',
  'Thumbs.db',
  '.DS_Store',
  'stats.html',
]
const forbiddenExt = new Set(['.map', '.pem', '.key', '.p12', '.pfx', '.crt', '.log'])
const textExt = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.css', '.txt', '.ts', '.md'])

function walk(dir) {
  const entries = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) entries.push(...walk(full))
    else entries.push(full)
  }
  return entries
}

const files = walk(outDir)
const relativeFiles = files.map((file) => relative(outDir, file))

for (const file of relativeFiles) {
  const base = file.split(/[\\/]/).pop() ?? ''
  if (forbiddenNames.includes(base)) fail(`forbidden file in package: ${file}`)
  if (forbiddenExt.has(extname(base).toLowerCase())) fail(`forbidden file type in package: ${file}`)
  if (/(^|[\\/])(node_modules|\.git|\.wxt|store)([\\/]|$)/.test(file)) {
    fail(`development folder in package: ${file}`)
  }
  if (/(^|[\\/])bridge[\\/]browser-bridge\.js$/.test(file)) {
    // Intentionally bundled so users can install the local plugin.
    continue
  }
}

/* ------------------------------------------------------------------- secrets */
const secretPatterns = [
  ['OpenAI-style key', /(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['GitHub fine-grained token', /github_pat_[A-Za-z0-9_]{20,}/],
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['Google OAuth token', /ya29\.[0-9A-Za-z_-]+/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Personal email', /mrkazemi95@gmail\.com/i],
  ['Local user path', /C:\\Users\\morekaccino/i],
  ['Local user path (POSIX)', /\/Users\/morekaccino/i],
]

const remoteCodePatterns = [
  ['eval()', /\beval\s*\(/g],
  ['new Function()', /\bnew Function\s*\(/g],
]

let scanned = 0
for (const file of files) {
  if (!textExt.has(extname(file).toLowerCase())) continue
  const text = readFileSync(file, 'utf8')
  scanned++
  const shown = relative(outDir, file)
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) fail(`${label} found in ${shown}`)
  }
  for (const [label, pattern] of remoteCodePatterns) {
    if (pattern.test(text)) fail(`${label} found in ${shown} — MV3 remote-code policy`)
  }
}

/* ----------------------------------------------------------------------- zip */
const outputDir = join(root, 'extension', '.output')
const zips = existsSync(outputDir)
  ? readdirSync(outputDir)
      .filter((name) => name.endsWith('-chrome.zip'))
      .map((name) => join(outputDir, name))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  : []
if (zips.length === 0) {
  fail('no *-chrome.zip found in extension/.output — run: npm run store:zip')
}

let sha256 = ''
let zipPath = ''
if (zips.length > 0) {
  zipPath = zips[0]
  const zipFiles = execFileSync('tar', ['-tf', zipPath], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!zipFiles.includes('manifest.json')) fail('zip must contain manifest.json at its root')
  if (zipFiles.some((file) => /^[^/]+\/manifest\.json$/.test(file))) {
    fail('zip contains a parent folder; the store expects manifest.json at the root')
  }
  for (const file of zipFiles) {
    const base = file.split('/').pop() ?? ''
    if (forbiddenNames.includes(base)) fail(`forbidden file in zip: ${file}`)
    if (forbiddenExt.has(extname(base).toLowerCase())) fail(`forbidden file type in zip: ${file}`)
    if (/(^|\/)(node_modules|\.git|\.wxt|store)\//.test(file)) fail(`development folder in zip: ${file}`)
  }
  if (!zipFiles.some((file) => file === 'bridge/browser-bridge.js')) {
    warn('zip does not contain bridge/browser-bridge.js (plugin download will not work)')
  }

  sha256 = createHash('sha256').update(readFileSync(zipPath)).digest('hex')
  mkdirSync(join(root, 'store'), { recursive: true })
  const stableName = `browser-agent-for-opencode-${manifest.version}-chrome.zip`
  copyFileSync(zipPath, join(root, 'store', stableName))
  writeFileSync(
    join(root, 'store', 'SHA256SUMS.txt'),
    `${sha256}  ${stableName}\n`,
    'utf8',
  )
}

/* -------------------------------------------------------------------- report */
console.log(`package : ${zipPath || '(missing)'}`)
console.log(`files   : ${relativeFiles.length} (${scanned} text files scanned)`)
console.log(`size    : ${(zipPath ? statSync(zipPath).size / 1024 / 1024 : 0).toFixed(2)} MB compressed`)
console.log(`sha256  : ${sha256 || '(missing)'}`)
console.log(`name    : ${manifest.name}`)
console.log(`version : ${manifest.version}`)
console.log(`perms   : ${(manifest.permissions ?? []).join(', ')}`)

if (warnings.length > 0) {
  console.log('\nWarnings:')
  for (const warning of warnings) console.log(`  - ${warning}`)
}
if (failures.length > 0) {
  console.error('\nFAILED:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('\nOK: package looks clean and ready to upload.')
