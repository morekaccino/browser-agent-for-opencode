/**
 * Material Design 3 tonal palette, generated from a seed color with real tone math.
 *
 * Tones are Material's 0–100 scale (CIELAB L*). We convert L* → relative luminance → OKLab L
 * (exact for grays) and emit `oklch()` colors, so the same tone numbers produce the same
 * perceptual lightness for every seed — which is what keeps M3 color pairs at their intended
 * contrast ratios. Chrome has no API for its theme seed, so the seed is user-configurable.
 */

export type ThemeMode = 'auto' | 'light' | 'dark'
export type ResolvedMode = 'light' | 'dark'

/* ------------------------------ color math ------------------------------ */

function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
}

/** sRGB hex → OKLCh ({ l: 0..1, c: 0..~0.4, h: degrees }) */
export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const clean = hex.replace('#', '').trim()
  const full = clean.length === 3 ? clean.split('').map((x) => x + x).join('') : clean.padEnd(6, '0').slice(0, 6)
  const r = srgbChannelToLinear(parseInt(full.slice(0, 2), 16) / 255)
  const g = srgbChannelToLinear(parseInt(full.slice(2, 4), 16) / 255)
  const b = srgbChannelToLinear(parseInt(full.slice(4, 6), 16) / 255)

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: L, c: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 }
}

/** Material tone (CIELAB L* 0–100) → OKLab lightness (exact for achromatic colors). */
export function toneToOklabL(t: number): number {
  const y = t > 8 ? ((t + 16) / 116) ** 3 : t / 903.3
  return Math.cbrt(y)
}

/**
 * A tonal color in OKLCh: hue h, OKLCh chroma c, Material tone t.
 * Chroma is reduced towards the extreme tones, mirroring how M3 keeps tones in gamut.
 */
function tone(h: number, c: number, t: number): string {
  const l = toneToOklabL(t)
  // gamut guard: sRGB cannot hold high chroma near black/white
  const headroom = Math.max(0.02, Math.min(1, 2.2 * Math.min(l, 1 - l) + 0.12))
  const chroma = Math.max(0, c * headroom)
  return `oklch(${l.toFixed(4)} ${chroma.toFixed(4)} ${(((h % 360) + 360) % 360).toFixed(1)})`
}

/* ------------------------------ palette ------------------------------ */

export interface Palette {
  [role: string]: string
}

export function seedToPalette(seedHex: string, mode: ResolvedMode): Palette {
  const seed = hexToOklch(seedHex)
  const h = seed.h
  // OKLCh chroma families derived from the seed (M3: primary > tertiary > secondary > nv > neutral)
  const cPrimary = Math.min(0.185, Math.max(0.045, seed.c))
  const cTertiary = Math.min(0.13, Math.max(0.035, seed.c * 0.85))
  const cSecondary = Math.min(0.06, Math.max(0.02, seed.c * 0.35))
  const cNV = Math.min(0.032, Math.max(0.012, seed.c * 0.18))
  const cNeutral = Math.min(0.016, Math.max(0.004, seed.c * 0.1))
  const hTertiary = h + 60
  const hError = 28
  const cError = 0.11
  const hSuccess = 152
  const cSuccess = 0.1

  const dark: Palette = {
    primary: tone(h, cPrimary, 80),
    onPrimary: tone(h, cPrimary, 20),
    primaryContainer: tone(h, cPrimary, 30),
    onPrimaryContainer: tone(h, cPrimary, 90),
    secondary: tone(h, cSecondary, 80),
    onSecondary: tone(h, cSecondary, 20),
    secondaryContainer: tone(h, cSecondary, 30),
    onSecondaryContainer: tone(h, cSecondary, 90),
    tertiary: tone(hTertiary, cTertiary, 80),
    onTertiary: tone(hTertiary, cTertiary, 20),
    tertiaryContainer: tone(hTertiary, cTertiary, 30),
    onTertiaryContainer: tone(hTertiary, cTertiary, 90),
    error: tone(hError, cError, 80),
    onError: tone(hError, cError, 20),
    errorContainer: tone(hError, cError, 30),
    onErrorContainer: tone(hError, cError, 90),
    success: tone(hSuccess, cSuccess, 80),
    onSuccess: tone(hSuccess, cSuccess, 20),
    successContainer: tone(hSuccess, cSuccess, 30),
    onSuccessContainer: tone(hSuccess, cSuccess, 90),
    surface: tone(h, cNeutral, 6),
    onSurface: tone(h, cNeutral, 90),
    surfaceVariant: tone(h, cNV, 30),
    onSurfaceVariant: tone(h, cNV, 80),
    surfaceContainerLowest: tone(h, cNeutral, 4),
    surfaceContainerLow: tone(h, cNeutral, 10),
    surfaceContainer: tone(h, cNeutral, 12),
    surfaceContainerHigh: tone(h, cNeutral, 17),
    surfaceContainerHighest: tone(h, cNeutral, 22),
    outline: tone(h, cNV, 60),
    outlineVariant: tone(h, cNV, 30),
    inverseSurface: tone(h, cNeutral, 90),
    inverseOnSurface: tone(h, cNeutral, 20),
    inversePrimary: tone(h, cPrimary, 40),
    scrim: 'rgb(0 0 0 / 0.6)',
  }

  const light: Palette = {
    primary: tone(h, cPrimary, 40),
    onPrimary: tone(h, cPrimary, 100),
    primaryContainer: tone(h, cPrimary, 90),
    onPrimaryContainer: tone(h, cPrimary, 10),
    secondary: tone(h, cSecondary, 40),
    onSecondary: tone(h, cSecondary, 100),
    secondaryContainer: tone(h, cSecondary, 90),
    onSecondaryContainer: tone(h, cSecondary, 10),
    tertiary: tone(hTertiary, cTertiary, 40),
    onTertiary: tone(hTertiary, cTertiary, 100),
    tertiaryContainer: tone(hTertiary, cTertiary, 90),
    onTertiaryContainer: tone(hTertiary, cTertiary, 10),
    error: tone(hError, cError, 40),
    onError: tone(hError, cError, 100),
    errorContainer: tone(hError, cError, 90),
    onErrorContainer: tone(hError, cError, 10),
    success: tone(hSuccess, cSuccess, 40),
    onSuccess: tone(hSuccess, cSuccess, 100),
    successContainer: tone(hSuccess, cSuccess, 90),
    onSuccessContainer: tone(hSuccess, cSuccess, 10),
    surface: tone(h, cNeutral, 98),
    onSurface: tone(h, cNeutral, 10),
    surfaceVariant: tone(h, cNV, 90),
    onSurfaceVariant: tone(h, cNV, 30),
    surfaceContainerLowest: tone(h, cNeutral, 100),
    surfaceContainerLow: tone(h, cNeutral, 96),
    surfaceContainer: tone(h, cNeutral, 94),
    surfaceContainerHigh: tone(h, cNeutral, 92),
    surfaceContainerHighest: tone(h, cNeutral, 90),
    outline: tone(h, cNV, 50),
    outlineVariant: tone(h, cNV, 80),
    inverseSurface: tone(h, cNeutral, 20),
    inverseOnSurface: tone(h, cNeutral, 95),
    inversePrimary: tone(h, cPrimary, 80),
    scrim: 'rgb(0 0 0 / 0.4)',
  }

  return mode === 'dark' ? dark : light
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

export function applyPaletteToCss(palette: Palette): void {
  const root = document.documentElement
  for (const [role, value] of Object.entries(palette)) {
    root.style.setProperty(`--md-${kebab(role)}`, value)
  }
}

/** Four cloud colors for the halo — soft, seed-derived (M3 AI-style blends). */
export function haloCloudColors(seedHex: string, mode: ResolvedMode): [string, string, string, string] {
  const seed = hexToOklch(seedHex)
  const c = Math.min(0.16, Math.max(0.07, seed.c))
  const t = mode === 'dark' ? 72 : 78
  return [
    tone(seed.h, c, t),
    tone(seed.h + 70, c * 0.85, t - 4),
    tone(seed.h - 60, c * 0.7, t + 2),
    tone(seed.h + 170, c * 0.6, t - 6),
  ]
}

export function resolveMode(mode: ThemeMode): ResolvedMode {
  if (mode === 'light' || mode === 'dark') return mode
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}
