import type { ReactNode } from 'react'
import { IconButton } from '../design/primitives'

export function AppBar({
  title,
  subtitle,
  onTitleClick,
  onMenu,
  onBack,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onTitleClick?: () => void
  onMenu?: () => void
  onBack?: () => void
  actions?: ReactNode
}) {
  return (
    <header className="app-bar">
      {onMenu ? <IconButton icon="menu" label="Open navigation" onClick={onMenu} /> : null}
      {onBack ? <IconButton icon="arrow_back" label="Back" onClick={onBack} /> : null}
      <button
        type="button"
        className={`app-bar-title${onTitleClick ? ' is-clickable' : ''}`}
        onClick={onTitleClick}
        disabled={!onTitleClick}
        title={typeof title === 'string' ? title : undefined}
      >
        <span className="app-bar-title-main">
          <span className="app-bar-title-text">{title}</span>
          {subtitle ? <span className="app-bar-subtitle">{subtitle}</span> : null}
        </span>
        {onTitleClick ? <span className="msym sm app-bar-caret" aria-hidden="true">expand_more</span> : null}
      </button>
      <div className="app-bar-actions">{actions}</div>
    </header>
  )
}
