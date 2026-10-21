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
  // Warm, quiet neutrals: the seed drives the accents, not every surface.
  const hNeutral = 28
  const cNV = Math.min(0.014, Math.max(0.006, seed.c * 0.08))
  const cNeutral = Math.min(0.008, Math.max(0.002, seed.c * 0.05))
  const hTertiary = h + 60
  const hError = 28
  const cError = 0.11
  const hSuccess = 152
  const cSuccess = 0.1
  const hWarning = 78
  const cWarning = 0.12

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
    warning: tone(hWarning, cWarning, 80),
    onWarning: tone(hWarning, cWarning, 20),
    warningContainer: tone(hWarning, cWarning, 30),
    onWarningContainer: tone(hWarning, cWarning, 90),
    surface: tone(hNeutral, cNeutral, 6),
    surfaceDim: tone(hNeutral, cNeutral, 6),
    surfaceBright: tone(hNeutral, cNeutral, 24),
    onSurface: tone(hNeutral, cNeutral, 91),
    surfaceVariant: tone(hNeutral, cNV, 30),
    onSurfaceVariant: tone(hNeutral, cNV, 78),
    surfaceContainerLowest: tone(hNeutral, cNeutral, 4),
    surfaceContainerLow: tone(hNeutral, cNeutral, 9),
    surfaceContainer: tone(hNeutral, cNeutral, 12),
    surfaceContainerHigh: tone(hNeutral, cNeutral, 16),
    surfaceContainerHighest: tone(hNeutral, cNeutral, 21),
    outline: tone(hNeutral, cNV, 58),
    outlineVariant: tone(hNeutral, cNV, 28),
    inverseSurface: tone(hNeutral, cNeutral, 90),
    inverseOnSurface: tone(hNeutral, cNeutral, 20),
    inversePrimary: tone(h, cPrimary, 40),
    scrim: 'rgb(0 0 0 / 0.64)',
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
    warning: tone(hWarning, cWarning, 38),
    onWarning: tone(hWarning, cWarning, 100),
    warningContainer: tone(hWarning, cWarning, 90),
    onWarningContainer: tone(hWarning, cWarning, 10),
    surface: tone(hNeutral, cNeutral, 98),
    surfaceDim: tone(hNeutral, cNeutral, 87),
    surfaceBright: tone(hNeutral, cNeutral, 99),
    onSurface: tone(hNeutral, cNeutral, 10),
    surfaceVariant: tone(hNeutral, cNV, 91),
    onSurfaceVariant: tone(hNeutral, cNV, 32),
    surfaceContainerLowest: tone(hNeutral, cNeutral, 100),
    surfaceContainerLow: tone(hNeutral, cNeutral, 97),
    surfaceContainer: tone(hNeutral, cNeutral, 94),
    surfaceContainerHigh: tone(hNeutral, cNeutral, 92),
    surfaceContainerHighest: tone(hNeutral, cNeutral, 89),
    outline: tone(hNeutral, cNV, 50),
    outlineVariant: tone(hNeutral, cNV, 82),
    inverseSurface: tone(hNeutral, cNeutral, 20),
    inverseOnSurface: tone(hNeutral, cNeutral, 95),
    inversePrimary: tone(h, cPrimary, 80),
    scrim: 'rgb(0 0 0 / 0.32)',
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
