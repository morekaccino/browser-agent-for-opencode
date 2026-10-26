import { useMemo, useState } from 'react'
import type { SessionInfo } from '@opencode/client'
import { isRunActive, type SessionRunStatus } from '../useOpencode'
import { Button, IconButton, Menu, SearchField, TextInput } from '../design/primitives'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function group(ts: number): { key: string; label: string } {
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ts >= startToday) return { key: 'today', label: 'Today' }
  if (ts >= startToday - 86_400_000) return { key: 'yesterday', label: 'Yesterday' }
  return { key: 'earlier', label: 'Earlier' }
}

function displayTitle(session: SessionInfo): string {
  const title = (session.title ?? '').trim()
  if (!title || title.startsWith('ses_')) return 'New session'
  return title
}

export function SessionList({
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
  const [query, setQuery] = useState('')
  const [renameTarget, setRenameTarget] = useState<SessionInfo | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<SessionInfo | null>(null)

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = sessions.filter((session) => !needle || displayTitle(session).toLowerCase().includes(needle))
    const map = new Map<string, { label: string; rows: SessionInfo[] }>()
    for (const session of filtered) {
      const at = session.time?.updated ?? session.time?.created ?? 0
      const section = group(at)
      const entry = map.get(section.key) ?? { label: section.label, rows: [] }
      entry.rows.push(session)
      map.set(section.key, entry)
    }
    return Array.from(map.entries())
  }, [sessions, query])

  const startRename = (session: SessionInfo) => {
    setRenameTarget(session)
    setRenameValue(displayTitle(session) === 'New session' ? '' : displayTitle(session))
  }

  return (
    <div className="session-list-wrap">
      <div className="session-list-tools">
        <SearchField value={query} onChange={setQuery} placeholder="Search sessions" label="Search sessions" />
        <Button variant="tonal" size="sm" icon="add" onClick={onNew}>
          New
        </Button>
      </div>

      {renameTarget ? (
        <div className="session-rename-bar">
          <TextInput
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            placeholder="Session name"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Escape') setRenameTarget(null)
              if (event.key !== 'Enter' || !renameValue.trim()) return
              onRename(renameTarget.id, renameValue.trim())
              setRenameTarget(null)
            }}
          />
          <Button
            size="sm"
            icon="check"
            onClick={() => {
              if (!renameValue.trim()) return
              onRename(renameTarget.id, renameValue.trim())
              setRenameTarget(null)
            }}
          >
            save
          </Button>
          <IconButton icon="close" label="Cancel rename" variant="ghost" size="sm" onClick={() => setRenameTarget(null)} />
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="session-rename-bar session-delete-bar" role="alert">
          <span className="session-delete-text">Delete “{displayTitle(deleteTarget)}”?</span>
          <Button variant="text" size="sm" onClick={() => setDeleteTarget(null)}>
            cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon="delete"
            onClick={() => {
              onDelete(deleteTarget.id)
              setDeleteTarget(null)
            }}
          >
            delete
          </Button>
        </div>
      ) : null}

      {!loaded ? (
        <div className="session-list-status">Loading sessions…</div>
      ) : groups.length === 0 ? (
        <div className="session-list-status">{query ? 'No matching sessions' : 'No sessions yet'}</div>
      ) : (
        <div className="session-list">
          {groups.map(([key, section]) => (
            <section key={key} className="session-group">
              <div className="session-group-label">{section.label}</div>
              {section.rows.map((session) => {
                const selected = session.id === currentId
                const status = statuses[session.id]
                const busy = isRunActive(status)
                return (
                  <div key={session.id} className={`session-item${selected ? ' is-selected' : ''}`}>
                    <button
                      type="button"
                      className="session-item-main"
                      onClick={() => onSelect(session.id)}
                      title={displayTitle(session)}
                    >
                      <span className="session-avatar" aria-hidden="true">
                        {displayTitle(session).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="session-item-text">
                        <span className="session-item-title">
                          <span className="session-item-title-text">{displayTitle(session)}</span>
                          {busy ? (
                            <span
                              className="session-busy-dot"
                              aria-label={status === 'retry' ? 'Retrying' : 'Working'}
                            />
                          ) : null}
                        </span>
                        <span className="session-item-meta">
                          {timeAgo(session.time?.updated ?? session.time?.created ?? Date.now())}
                          {busy ? (status === 'retry' ? ' · retrying' : ' · working') : ''}
                        </span>
                      </span>
                      {selected ? <span className="msym sm session-check" aria-hidden="true">check</span> : null}
                    </button>
                    <Menu
                      label={`Actions for ${displayTitle(session)}`}
                      trigger={
                        <IconButton
                          icon="more_vert"
                          label="Session actions"
                          variant="ghost"
                          size="sm"
                        />
                      }
                      items={[
                        {
                          label: 'Rename',
                          icon: 'edit',
                          onSelect: () => startRename(session),
                        },
                        {
                          label: 'Delete',
                          icon: 'delete',
                          destructive: true,
                          onSelect: () => setDeleteTarget(session),
                        },
                      ]}
                    />
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      )}

    </div>
  )
}
