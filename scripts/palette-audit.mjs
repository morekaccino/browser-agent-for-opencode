#!/usr/bin/env node
/**
 * Palette CI: verifies WCAG contrast for the real UI color pairings across a set of seeds,
 * in both dark and light themes. Mirrors extension/lib/theme.ts (OKLCH tone math).
 *
 * Usage: node scripts/palette-audit.mjs   → exits 1 if any required pair fails.
 */

const SEEDS = ['#6750A4', '#146C2E', '#0B57D0', '#8F4C38', '#7D5260', '#F4B400', '#0B6E4F']

/* ---- math (mirrors lib/theme.ts) ---- */
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

function hexToOklch(hex) {
  const full = hex.replace('#', '')
  const r = srgbToLinear(parseInt(full.slice(0, 2), 16) / 255)
  const g = srgbToLinear(parseInt(full.slice(2, 4), 16) / 255)
  const b = srgbToLinear(parseInt(full.slice(4, 6), 16) / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: L, c: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 }
}

const toneToOklabL = (t) => Math.cbrt(t > 8 ? ((t + 16) / 116) ** 3 : t / 903.3)

function toneColor(h, c, t) {
  const l = toneToOklabL(t)
  const headroom = Math.max(0.02, Math.min(1, 2.2 * Math.min(l, 1 - l) + 0.12))
  const chroma = Math.max(0, c * headroom)
  const rad = (h * Math.PI) / 180
  return { L: l, a: chroma * Math.cos(rad), b: chroma * Math.sin(rad) }
}

function oklabToLuminance({ L, a, b }) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  const r = Math.min(1, Math.max(0, linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)))
  const g = Math.min(1, Math.max(0, linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)))
  const bb = Math.min(1, Math.max(0, linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)))
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(bb)
}

const ratio = (c1, c2) => {
  const [a, b] = [oklabToLuminance(c1), oklabToLuminance(c2)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

function palette(seedHex, mode) {
  const seed = hexToOklch(seedHex)
  const h = seed.h
  const cPrimary = Math.min(0.185, Math.max(0.045, seed.c))
  const cTertiary = Math.min(0.13, Math.max(0.035, seed.c * 0.85))
  const cSecondary = Math.min(0.06, Math.max(0.02, seed.c * 0.35))
  const cNV = Math.min(0.032, Math.max(0.012, seed.c * 0.18))
  const cNeutral = Math.min(0.016, Math.max(0.004, seed.c * 0.1))
  const T = toneColor
  if (mode === 'dark') {
    return {
      primary: T(h, cPrimary, 80),
      onPrimary: T(h, cPrimary, 20),
      primaryContainer: T(h, cPrimary, 30),
      onPrimaryContainer: T(h, cPrimary, 90),
      secondaryContainer: T(h, cSecondary, 30),
      onSecondaryContainer: T(h, cSecondary, 90),
      tertiaryContainer: T(h + 60, cTertiary, 30),
      onTertiaryContainer: T(h + 60, cTertiary, 90),
      error: T(28, 0.11, 80),
      errorContainer: T(28, 0.11, 30),
      onErrorContainer: T(28, 0.11, 90),
      successContainer: T(152, 0.1, 30),
      onSuccessContainer: T(152, 0.1, 90),
      surface: T(h, cNeutral, 6),
      onSurface: T(h, cNeutral, 90),
      onSurfaceVariant: T(h, cNV, 80),
      surfaceContainerHigh: T(h, cNeutral, 17),
      surfaceContainerHighest: T(h, cNeutral, 22),
      outline: T(h, cNV, 60),
      inverseSurface: T(h, cNeutral, 90),
      inverseOnSurface: T(h, cNeutral, 20),
    }
  }
  return {
    primary: T(h, cPrimary, 40),
    onPrimary: T(h, cPrimary, 100),
    primaryContainer: T(h, cPrimary, 90),
    onPrimaryContainer: T(h, cPrimary, 10),
    secondaryContainer: T(h, cSecondary, 90),
    onSecondaryContainer: T(h, cSecondary, 10),
    tertiaryContainer: T(h + 60, cTertiary, 90),
    onTertiaryContainer: T(h + 60, cTertiary, 10),
    error: T(28, 0.11, 40),
    errorContainer: T(28, 0.11, 90),
    onErrorContainer: T(28, 0.11, 10),
    successContainer: T(152, 0.1, 90),
    onSuccessContainer: T(152, 0.1, 10),
    surface: T(h, cNeutral, 98),
    onSurface: T(h, cNeutral, 10),
    onSurfaceVariant: T(h, cNV, 30),
    surfaceContainerHigh: T(h, cNeutral, 92),
    surfaceContainerHighest: T(h, cNeutral, 90),
    outline: T(h, cNV, 50),
    inverseSurface: T(h, cNeutral, 20),
    inverseOnSurface: T(h, cNeutral, 95),
  }
}

const RULES = [
  ['body text (onSurface/surface)', 'onSurface', 'surface', 4.5],
  ['secondary text (onSurfaceVariant/surface)', 'onSurfaceVariant', 'surface', 4.5],
  ['secondary text on card', 'onSurfaceVariant', 'surfaceContainerHigh', 4.5],
  ['primary text-button on card', 'primary', 'surfaceContainerHigh', 4.5],
  ['send icon (onPrimary/primaryContainer pair, large)', 'onPrimary', 'primary', 3],
  ['user bubble / chip text', 'onSecondaryContainer', 'secondaryContainer', 4.5],
  ['banner text', 'onTertiaryContainer', 'tertiaryContainer', 4.5],
  ['snackbar text', 'inverseOnSurface', 'inverseSurface', 4.5],
  ['error text-button on card', 'error', 'surfaceContainerHigh', 4.5],
  ['success text on container', 'onSuccessContainer', 'successContainer', 4.5],
  ['interactive border (outline/surface, non-text)', 'outline', 'surface', 3],
]

let failed = 0
for (const seed of SEEDS) {
  for (const mode of ['dark', 'light']) {
    const p = palette(seed, mode)
    for (const [name, fg, bg, need] of RULES) {
      const r = ratio(p[fg], p[bg])
      if (r < need) {
        failed++
        console.log(`FAIL  ${seed} ${mode.padEnd(5)} ${name.padEnd(52)} ${r.toFixed(2)} < ${need}`)
      }
    }
  }
}
const total = SEEDS.length * 2 * RULES.length
console.log(failed === 0 ? `\nAll ${total} contrast checks pass across ${SEEDS.length} seeds × 2 themes.` : `\n${failed}/${total} checks FAILED`)
process.exit(failed === 0 ? 0 : 1)
