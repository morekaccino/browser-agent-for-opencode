import { useEffect, useState } from 'react'

export type LayoutMode = 'compact' | 'medium' | 'expanded'

function readMode(): { mode: LayoutMode; short: boolean } {
  if (typeof window === 'undefined') return { mode: 'compact', short: false }
  const width = document.documentElement.clientWidth || window.innerWidth
  const height = document.documentElement.clientHeight || window.innerHeight
  return {
    mode: width >= 900 ? 'expanded' : width >= 600 ? 'medium' : 'compact',
    short: height < 680,
  }
}

/**
 * The side panel can be dragged from ~320px to half the screen. We use the
 * actual content width (not the outer browser window) to choose the layout.
 */
export function useLayoutMode(): { mode: LayoutMode; short: boolean } {
  const [state, setState] = useState(readMode)

  useEffect(() => {
    let scheduled = 0
    const update = () => {
      scheduled = 0
      setState((previous) => {
        const next = readMode()
        return previous.mode === next.mode && previous.short === next.short ? previous : next
      })
    }
    const schedule = () => {
      if (scheduled) return
      scheduled = window.requestAnimationFrame(update)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(document.documentElement)
    window.addEventListener('resize', schedule)
    update()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      if (scheduled) window.cancelAnimationFrame(scheduled)
    }
  }, [])

  return state
}
