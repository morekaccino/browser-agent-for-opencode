import type { SessionInfo } from '@opencode/client'
import type { SessionRunStatus } from '../useOpencode'
import { Sheet } from '../design/primitives'
import type { LayoutMode } from '../design/useLayoutMode'
import { SessionList } from './SessionList'

export function SessionPane({
  sessions,
  currentId,
  statuses,
  loaded,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  sessions: SessionInfo[]
  currentId: string | null
  statuses: Record<string, SessionRunStatus>
  loaded: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <aside className="session-pane" aria-label="Sessions">
      <div className="session-pane-head">
        <strong>Sessions</strong>
      </div>
      <SessionList
        sessions={sessions}
        currentId={currentId}
        statuses={statuses}
        loaded={loaded}
        onSelect={onSelect}
        onNew={onNew}
        onRename={onRename}
        onDelete={onDelete}
      />
    </aside>
  )
}

export function SessionSheet({
  open,
  onOpenChange,
  mode,
  ...props
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: LayoutMode
  sessions: SessionInfo[]
  currentId: string | null
  statuses: Record<string, SessionRunStatus>
  loaded: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side={mode === 'compact' ? 'bottom' : 'right'}
      title="Sessions"
      description="Switch conversations or start a new one."
      bodyClassName="session-sheet-body"
    >
      <SessionList {...props} />
    </Sheet>
  )
}
