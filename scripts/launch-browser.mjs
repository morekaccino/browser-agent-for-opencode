#!/usr/bin/env node
/**
 * Launch a dedicated Chrome profile with the built extension pre-loaded.
 *
 * Regular Chrome 137+ may ignore --load-extension; Chrome for Testing is
 * preferred. The manual "Load unpacked" flow in chrome://extensions always
 * works and is the primary install path.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(root, 'extension', '.output', 'chrome-mv3')
const localData =
  process.platform === 'win32'
    ? process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    : join(homedir(), '.local', 'share')
const cache = join(localData, 'opencode-browser-ext')
const profile = join(localData, 'opencode-browser-profile')
const counterFile = join(localData, 'opencode-browser-ext.version')

function findChromeBinary(root, depth = 5) {
  if (!root || depth < 0 || !existsSync(root)) return null
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const full = join(root, entry.name)
      if (entry.isFile()) {
        if (process.platform === 'win32') {
          if (entry.name.toLowerCase() === 'chrome.exe') return full
        } else if (entry.name === 'chrome' || entry.name === 'Google Chrome for Testing') {
          return full
        }
      } else if (entry.isDirectory()) {
        const found = findChromeBinary(full, depth - 1)
        if (found) return found
      }
    }
  } catch {
    /* unreadable directory */
  }
  return null
}

function findChromeForTesting() {
  const roots = [
    process.env.CHROME_FOR_TESTING_PATH,
    join(tmpdir(), 'chrome-for-testing'),
    ...(process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, 'chrome-for-testing')] : []),
    join(homedir(), '.cache', 'puppeteer', 'chrome'),
    join(homedir(), '.cache', 'ms-playwright'),
    join(homedir(), '.local', 'share', 'chrome-for-testing'),
  ].filter(Boolean)
  for (const root of roots) {
    if (root.endsWith('.exe') || root.endsWith('/chrome')) {
      if (existsSync(root)) return root
    }
    const found = findChromeBinary(root)
    if (found) return found
  }
  return null
}

function chromeCandidates() {
  const candidates = []
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH)
  const chromeForTesting = findChromeForTesting()
  if (chromeForTesting) candidates.push(chromeForTesting)
  if (process.platform === 'win32') {
    candidates.push(
      join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    )
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    )
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    )
  }
  return candidates.filter(Boolean)
}

const chrome = chromeCandidates().find((candidate) => existsSync(candidate))

if (!existsSync(join(source, 'manifest.json'))) {
  console.error(`extension build not found at ${source}`)
  console.error('run: npm run build')
  process.exit(1)
}

if (!chrome) {
  console.error('Chrome not found. Set CHROME_PATH to chrome.exe/chrome.')
  console.error('Or use chrome://extensions -> Developer mode -> Load unpacked and select:')
  console.error(`  ${source}`)
  process.exit(1)
}

// Sync the build into a stable cache directory.
mkdirSync(dirname(cache), { recursive: true })
rmSync(cache, { recursive: true, force: true })
cpSync(source, cache, { recursive: true })

// Bump the third version component so Chrome reloads the extension on launch.
let counter = 1000
try {
  counter = Number(readFileSync(counterFile, 'utf8').trim()) || 1000
} catch {
  /* first launch */
}
counter = (counter + 1) % 65535
writeFileSync(counterFile, String(counter))

try {
  const manifestPath = join(cache, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const base = String(manifest.version || '0.1').split('.').slice(0, 2).join('.')
  manifest.version = `${base}.${counter}`
  writeFileSync(manifestPath, JSON.stringify(manifest))
} catch (error) {
  console.warn(`could not bump manifest version: ${error instanceof Error ? error.message : String(error)}`)
}

// Chrome caches the extension service worker in the profile. Clear it when the
// profile is not locked (best effort on Windows).
for (const relative of [
  join('Default', 'Service Worker'),
  join('Default', 'Extension Scripts'),
  join('Default', 'Code Cache'),
]) {
  try {
    rmSync(join(profile, relative), { recursive: true, force: true })
  } catch {
    /* profile is in use */
  }
}

const testing = /chrome-for-testing|chrome for testing|puppeteer[\\/]chrome/i.test(chrome)
if (!testing) {
  console.warn('')
  console.warn('Note: regular Chrome 137+ may ignore --load-extension.')
  console.warn('If the extension does not appear, load it manually from chrome://extensions.')
  console.warn('')
}

const args = [
  `--user-data-dir=${profile}`,
  `--load-extension=${cache}`,
  `--disable-extensions-except=${cache}`,
  '--remote-debugging-port=9444',
  '--no-first-run',
  '--no-default-browser-check',
  ...process.argv.slice(2),
]

console.log(`chrome: ${chrome}`)
console.log(`profile: ${profile}`)
console.log(`extension: ${cache}`)

const result = spawnSync(chrome, args, { stdio: 'inherit' })
process.exit(result.status ?? 0)
