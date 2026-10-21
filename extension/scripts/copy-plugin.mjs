#!/usr/bin/env node
/**
 * Transpile the opencode bridge plugin into a browser-downloadable JavaScript
 * file. Generated file: extension/public/bridge/browser-bridge.js (gitignored).
 *
 * The plugin source stays in plugin/browser-bridge.ts. opencode discovers both
 * .ts and .js files in ~/.config/opencode/plugins/.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const extensionRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(extensionRoot, '..', 'plugin', 'browser-bridge.ts')
const bridgeDir = join(extensionRoot, 'public', 'bridge')
const destination = join(bridgeDir, 'browser-bridge.js')
const stale = join(bridgeDir, 'browser-bridge.ts')

if (!existsSync(source)) {
  console.error(`plugin source not found: ${source}`)
  process.exit(1)
}

mkdirSync(bridgeDir, { recursive: true })
const input = readFileSync(source, 'utf8')
const output = ts.transpileModule(input, {
  fileName: 'browser-bridge.ts',
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    isolatedModules: true,
    removeComments: false,
  },
})

writeFileSync(destination, output.outputText, 'utf8')
rmSync(stale, { force: true })
console.log(`bridge plugin -> ${destination}`)
