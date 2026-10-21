import { haloCloudColors } from '../theme'

let cloudsEl: HTMLElement | null = null
let ringEl: HTMLElement | null = null
let pillEl: HTMLElement | null = null
let styleEl: HTMLStyleElement | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let compactTimer: ReturnType<typeof setTimeout> | null = null

const FADE_AFTER_MS = 20000
const COMPACT_AFTER_MS = 6000

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Is the page (probably) a light theme? Samples the nearest opaque background. */
function pageIsLight(): boolean {
  try {
    let el: Element | null = document.body ?? document.documentElement
    while (el) {
      const bg = getComputedStyle(el).backgroundColor
      const match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/.exec(bg)
      if (match) {
        const alpha = match[4] !== undefined ? Number(match[4]) : 1
        if (alpha > 0.5) {
          const luminance = 0.2126 * Number(match[1]) + 0.7152 * Number(match[2]) + 0.0722 * Number(match[3])
          return luminance > 140
        }
      }
      el = el.parentElement
    }
  } catch {
    /* fall through */
  }
  return true
}

function ensureStyle(): void {
  if (styleEl?.isConnected) return
  styleEl = document.createElement('style')
  styleEl.id = 'ocb-halo-style'
  styleEl.textContent = `
    @keyframes ocb-drift-a {
      0% { transform: translate(-6%, -6%) scale(1); }
      100% { transform: translate(4%, 3%) scale(1.12); }
    }
    @keyframes ocb-drift-b {
      0% { transform: translate(6%, -4%) scale(1.05); }
      100% { transform: translate(-4%, 4%) scale(0.95); }
    }
    @keyframes ocb-drift-c {
      0% { transform: translate(-4%, 5%) scale(0.95); }
      100% { transform: translate(5%, -5%) scale(1.1); }
    }
    @keyframes ocb-drift-d {
      0% { transform: translate(4%, 5%) scale(1.1); }
      100% { transform: translate(-5%, -4%) scale(1); }
    }
    @keyframes ocb-halo-breathe {
      0%, 100% { opacity: 0.9; }
      50% { opacity: 1; }
    }
    @keyframes ocb-halo-dot {
      0%, 100% { transform: scale(0.85); opacity: 0.75; }
      50% { transform: scale(1.25); opacity: 1; }
    }
    @keyframes ocb-halo-pill-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `
  document.documentElement.appendChild(styleEl)
}

interface HaloTheme {
  colors: [string, string, string, string]
  light: boolean
}

function ensureElements(theme: HaloTheme): void {
  ensureStyle()
  const reduce = prefersReducedMotion()

  // cloudy haze hugging the edges: four soft drifting blobs, faded inward
  if (!cloudsEl?.isConnected) {
    cloudsEl = document.createElement('div')
    cloudsEl.id = 'ocb-halo-clouds'
    cloudsEl.style.cssText = [
      'position:fixed',
      'inset:0',
      'pointer-events:none',
      'z-index:2147483643',
      '-webkit-mask:radial-gradient(ellipse 92% 92% at 50% 50%, transparent 55%, rgba(0,0,0,0.45) 72%, #000 90%)',
      'mask:radial-gradient(ellipse 92% 92% at 50% 50%, transparent 55%, rgba(0,0,0,0.45) 72%, #000 90%)',
      reduce ? '' : 'animation:ocb-halo-breathe 3s ease-in-out infinite',
    ]
      .filter(Boolean)
      .join(';')
    const spots: Array<{ pos: string; anim: string; dur: string }> = [
      { pos: 'top:-18% ; left:-12%', anim: 'ocb-drift-a', dur: '13s' },
      { pos: 'top:-20% ; right:-14%', anim: 'ocb-drift-b', dur: '16s' },
      { pos: 'bottom:-22% ; left:-14%', anim: 'ocb-drift-c', dur: '15s' },
      { pos: 'bottom:-18% ; right:-10%', anim: 'ocb-drift-d', dur: '12s' },
    ]
    spots.forEach((spot, index) => {
      const blob = document.createElement('div')
      const color = theme.colors[index] ?? theme.colors[0]
      blob.style.cssText = [
        'position:absolute',
        spot.pos,
        'width:58vmax',
        'height:58vmax',
        'border-radius:50%',
        `background:radial-gradient(closest-side, ${color} 0%, ${color} 28%, transparent 72%)`,
        `filter:blur(64px)`,
        `opacity:${theme.light ? 0.5 : 0.75}`,
        `mix-blend-mode:${theme.light ? 'multiply' : 'screen'}`,
        reduce ? '' : `animation:${spot.anim} ${spot.dur} ease-in-out infinite alternate`,
        'will-change:transform',
      ]
        .filter(Boolean)
        .join(';')
      cloudsEl!.appendChild(blob)
    })
    document.documentElement.appendChild(cloudsEl)
  } else {
    // refresh colors + blending if re-activated with a different theme
    const blobs = Array.from(cloudsEl.children) as HTMLElement[]
    blobs.forEach((blob, index) => {
      const color = theme.colors[index] ?? theme.colors[0]
      blob.style.background = `radial-gradient(closest-side, ${color} 0%, ${color} 28%, transparent 72%)`
      blob.style.opacity = theme.light ? '0.5' : '0.75'
      blob.style.mixBlendMode = theme.light ? 'multiply' : 'screen'
    })
  }

  // thin soft edge highlight
  if (!ringEl?.isConnected) {
    ringEl = document.createElement('div')
    ringEl.id = 'ocb-halo'
    ringEl.style.cssText = [
      'position:fixed',
      'inset:0',
      'pointer-events:none',
      'z-index:2147483645',
      'border:2px solid transparent',
      `background:linear-gradient(120deg, ${theme.colors[0]}, ${theme.colors[1]}, ${theme.colors[2]}, ${theme.colors[3]}) border-box`,
      '-webkit-mask:linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
      '-webkit-mask-composite:xor',
      'mask-composite:exclude',
      'filter:blur(0.75px)',
      'opacity:0.85',
    ].join(';')
    document.documentElement.appendChild(ringEl)
  }

  if (!pillEl?.isConnected) {
    pillEl = document.createElement('div')
    pillEl.id = 'ocb-halo-pill'
    const pillBg = theme.light ? 'rgba(255,255,255,0.94)' : 'rgba(20,18,24,0.92)'
    const pillFg = theme.light ? '#1d1b20' : '#e6e0e9'
    const pillShadow = theme.light
      ? '0 0 0 1px rgba(0,0,0,0.08), 0 6px 18px rgba(0,0,0,0.22)'
      : `0 0 0 1px rgba(255,255,255,0.1), 0 0 24px ${theme.colors[0]}55, 0 8px 22px rgba(0,0,0,0.45)`
    pillEl.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'right:16px',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:6px 14px',
      'border-radius:999px',
      `background:${pillBg}`,
      `color:${pillFg}`,
      'font:500 13px/20px "Roboto",system-ui,-apple-system,sans-serif',
      'letter-spacing:0.25px',
      `box-shadow:${pillShadow}`,
      'backdrop-filter:blur(8px)',
      'pointer-events:none',
      'z-index:2147483646',
      reduce ? '' : 'animation:ocb-halo-pill-in 0.3s ease-out',
    ]
      .filter(Boolean)
      .join(';')
    const dot = document.createElement('span')
    dot.style.cssText = [
      'width:9px',
      'height:9px',
      'border-radius:50%',
      `background:radial-gradient(circle, ${theme.colors[0]}, ${theme.colors[2]})`,
      reduce ? '' : 'animation:ocb-halo-dot 1.2s ease-in-out infinite',
      'display:inline-block',
      'flex:none',
    ]
      .filter(Boolean)
      .join(';')
    const label = document.createElement('span')
    label.id = 'ocb-halo-pill-label'
    label.textContent = 'opencode is working on this tab'
    pillEl.appendChild(dot)
    pillEl.appendChild(label)
    document.documentElement.appendChild(pillEl)
    // auto-compact after a few seconds: collapse to the dot so it stops occupying the page
    if (compactTimer) clearTimeout(compactTimer)
    compactTimer = setTimeout(() => {
      document.getElementById('ocb-halo-pill-label')?.remove()
    }, COMPACT_AFTER_MS)
  }
}

function removeElements(): void {
  cloudsEl?.remove()
  ringEl?.remove()
  pillEl?.remove()
  cloudsEl = null
  ringEl = null
  pillEl = null
  if (compactTimer) clearTimeout(compactTimer)
  compactTimer = null
}

export function setHalo(active: boolean, colors?: [string, string, string, string]): string {
  if (!active) {
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = null
    if (cloudsEl) cloudsEl.style.opacity = '0'
    if (ringEl) ringEl.style.opacity = '0'
    if (pillEl) pillEl.style.opacity = '0'
    setTimeout(removeElements, 300)
    return 'halo off'
  }
  const theme: HaloTheme = {
    colors: colors ?? haloCloudColors('#6750A4', pageIsLight() ? 'light' : 'dark'),
    light: pageIsLight(),
  }
  ensureElements(theme)
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => setHalo(false), FADE_AFTER_MS)
  return 'halo on'
}
