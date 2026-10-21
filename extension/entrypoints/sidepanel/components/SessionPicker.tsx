import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessionInfo } from '@opencode/client'
import type { SessionRunStatus } from '../useOpencode'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function sessionGroup(ts: number): 'today' | 'yesterday' | 'earlier' {
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ts >= startToday) return 'today'
  if (ts >= startToday - 24 * 60 * 60 * 1000) return 'yesterday'
  return 'earlier'
}

const GROUP_LABELS: Record<string, string> = { today: 'Today', yesterday: 'Yesterday', earlier: 'Earlier' }

const PAGE_SIZE = 30

export function SessionPicker({
  sessions,
  currentId,
  statuses,
  serverDown,
  loaded,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  sessions: SessionInfo[]
  currentId: string | null
  statuses: Record<string, SessionRunStatus>
  serverDown: boolean
  loaded: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLInputElement>(null)

  const current = sessions.find((s) => s.id === currentId)

  const grouped = useMemo(() => {
    const needle = filter.toLowerCase()
    const filtered = sessions.filter((s) => !needle || (s.title ?? '').toLowerCase().includes(needle))
    const capped = filter || showAll ? filtered : filtered.slice(0, PAGE_SIZE)
    const sections: Array<{ key: string; label: string; rows: SessionInfo[] }> = []
    for (const session of capped) {
      const key = sessionGroup(session.time?.updated ?? session.time?.created ?? 0)
      const section = sections.find((s) => s.key === key) ?? { key, label: GROUP_LABELS[key] ?? key, rows: [] }
      if (!sections.includes(section)) sections.push(section)
      section.rows.push(session)
    }
    const order = ['today', 'yesterday', 'earlier']
    sections.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    return { sections, total: filtered.length }
  }, [sessions, filter, showAll])

  const close = (returnFocus: boolean) => {
    setOpen(false)
    setEditingId(null)
    if (returnFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (open) filterRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (editingId) editRef.current?.focus()
  }, [editingId])

  const startRename = (session: SessionInfo) => {
    setEditingId(session.id)
    setEditTitle(session.title ?? '')
  }

  const commitRename = () => {
    if (editingId && editTitle.trim()) onRename(editingId, editTitle.trim())
    setEditingId(null)
  }

  const emptyCopy = serverDown ? "can't reach the opencode server" : loaded ? 'no sessions yet' : 'loading sessions…'

  return (
    <div className="session-picker">
      <button
        ref={triggerRef}
        className="session-current"
        onClick={() => (open ? close(true) : setOpen(true))}
        title={current?.title ?? 'no session'}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {currentId && statuses[currentId] === 'busy' && <span className="session-busy-dot" aria-hidden="true" />}
        <span className="session-initial" aria-hidden="true">
          {(current?.title || 'new').slice(0, 1).toUpperCase()}
        </span>
        <span className="session-title">{current?.title || 'no session'}</span>
        <span className="msym session-caret" aria-hidden="true">
          arrow_drop_down
        </span>
      </button>
      {open && (
        <>
          <div className="session-backdrop" onClick={() => close(false)} />
          <div className="session-menu" role="menu" aria-label="Sessions">
            <input
              ref={filterRef}
              className="session-filter"
              placeholder="filter sessions…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter sessions"
            />
            <button
              className="session-new"
              role="menuitem"
              onClick={() => {
                close(false)
                onNew()
              }}
            >
              <span className="msym" aria-hidden="true">
                add
              </span>{' '}
              new session
            </button>
            <div className="session-list" role="none">
              {grouped.sections.map((section) => (
                <div key={section.key} role="group" aria-label={section.label}>
                  <div className="session-group-label">{section.label}</div>
                  {section.rows.map((session) => (
                    <div
                      key={session.id}
                      className={`session-row${session.id === currentId ? ' current' : ''}`}
                      role="menuitemradio"
                      aria-checked={session.id === currentId}
                      tabIndex={0}
                      onClick={() => {
                        if (editingId === session.id) return
                        close(false)
                        onSelect(session.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          close(false)
                          onSelect(session.id)
                        }
                      }}
                    >
                      {editingId === session.id ? (
                        <span className="session-rename">
                          <input
                            ref={editRef}
                            className="session-rename-input"
                            value={editTitle}
                            onChange={(event) => setEditTitle(event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => {
                              event.stopPropagation()
                              if (event.key === 'Enter') commitRename()
                              if (event.key === 'Escape') setEditingId(null)
                            }}
                            aria-label="Session title"
                          />
                          <button
                            className="icon-btn tiny"
                            onClick={(event) => {
                              event.stopPropagation()
                              commitRename()
                            }}
                            aria-label="Save title"
                          >
                            <span className="msym sm" aria-hidden="true">
                              check
                            </span>
                          </button>
                          <button
                            className="icon-btn tiny"
                            onClick={(event) => {
                              event.stopPropagation()
                              setEditingId(null)
                            }}
                            aria-label="Cancel rename"
                          >
                            <span className="msym sm" aria-hidden="true">
                              close
                            </span>
                          </button>
                        </span>
                      ) : (
                        <>
                          <span className="session-row-title">{session.title || session.id.slice(0, 14)}</span>
                          <span className="session-row-meta">
                            {statuses[session.id] === 'busy' && <span className="session-busy-dot" aria-label="working" />}
                            {timeAgo(session.time?.updated ?? session.time?.created ?? Date.now())}
                          </span>
                          <span className="session-row-actions">
                            <button
                              className="icon-btn tiny"
                              title="Rename"
                              aria-label={`Rename ${session.title ?? 'session'}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                startRename(session)
                              }}
                            >
                              <span className="msym sm" aria-hidden="true">
                                edit
                              </span>
                            </button>
                            <button
                              className="icon-btn tiny"
                              title="Delete"
                              aria-label={`Delete ${session.title ?? 'session'}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                onDelete(session.id)
                              }}
                            >
                              <span className="msym sm" aria-hidden="true">
                                delete
                              </span>
                            </button>
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              {!filter && !showAll && grouped.total > PAGE_SIZE && (
                <button className="session-show-all" onClick={() => setShowAll(true)}>
                  show all {grouped.total} sessions
                </button>
              )}
              {grouped.total === 0 && <div className="session-empty">{filter ? 'no matches' : emptyCopy}</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
