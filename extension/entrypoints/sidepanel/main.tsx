import React from 'react'
import ReactDOM from 'react-dom/client'
import './design/fonts.css'
import './design/tokens.css'
import App from './App'
import './styles.css'
import { settings } from '../../lib/settings'
import { applyPaletteToCss, resolveMode, seedToPalette } from '../../lib/theme'

async function applyTheme(): Promise<void> {
  const [seed, mode] = await Promise.all([settings.themeSeed.getValue(), settings.themeMode.getValue()])
  const resolved = resolveMode(mode)
  document.documentElement.dataset.theme = resolved
  applyPaletteToCss(seedToPalette(seed, resolved))
}

void applyTheme()

settings.themeSeed.watch(() => void applyTheme())
settings.themeMode.watch(() => void applyTheme())
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  void settings.themeMode.getValue().then((mode) => {
    if (mode === 'auto') void applyTheme()
  })
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
