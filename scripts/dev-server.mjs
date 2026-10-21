#!/usr/bin/env node
/** Install the bridge plugin and start a foreground opencode server. */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const port = process.env.OPENCODE_PORT || '4096'

const install = spawnSync(process.execPath, [join(root, 'scripts', 'install-plugin.mjs')], {
  stdio: 'inherit',
})
if (install.status !== 0) process.exit(install.status ?? 1)

console.log('')
console.log(`starting: opencode serve --port ${port}  (cwd: ${process.cwd()})`)
console.log('The V2 shared service on another port is also auto-discovered by the extension.')
console.log('')

const result = spawnSync('opencode', ['serve', '--port', port], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
})
process.exit(result.status ?? 0)
