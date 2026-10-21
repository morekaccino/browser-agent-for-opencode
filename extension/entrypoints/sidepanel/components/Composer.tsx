import { useEffect, useRef, useState } from 'react'
import type { ModelOption, PendingPermission } from '../useOpencode'
import { ModelPicker, VariantPicker } from './ModelPicker'

export interface AttachedFile {
  mime: string
  filename: string
  dataUrl: string
  size: number
}

const MAX_FILE_BYTES = 8 * 1024 * 1024

function readFileAsAttachment(file: File): Promise<AttachedFile | null> {
  if (file.size > MAX_FILE_BYTES) return Promise.resolve(null)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve({ mime: file.type || 'application/octet-stream', filename: file.name, dataUrl: String(reader.result), size: file.size })
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

export function PermissionBar({
  permissions,
  onReply,
}: {
  permissions: PendingPermission[]
  onReply: (permission: PendingPermission, response: 'once' | 'always' | 'reject') => void
}) {
  if (permissions.length === 0) return null
  return (
    <div className="permissions">
      {permissions.map((permission) => (
        <div key={permission.id} className="permission-card">
          <div className="permission-title">
            <span className="permission-tag">{permission.action}</span>
            {permission.message ?? 'Permission requested'}
          </div>
          {permission.resources.length > 0 && (
            <div className="permission-pattern">{permission.resources.join(', ')}</div>
          )}
          <div className="permission-actions">
            <button onClick={() => onReply(permission, 'once')}>
              <span className="msym sm" aria-hidden="true">
                check
              </span>{' '}
              Allow once
            </button>
            <button onClick={() => onReply(permission, 'always')}>
              <span className="msym sm" aria-hidden="true">
                done_all
              </span>{' '}
              Always
            </button>
            <button className="danger" onClick={() => onReply(permission, 'reject')}>
              <span className="msym sm" aria-hidden="true">
                close
              </span>{' '}
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Composer({
  disabled,
  busy,
  sessionId,
  models,
  modelValue,
  onModelChange,
  includeContext,
  onIncludeContextChange,
  commands,
  agents,
  agent,
  onAgentChange,
  variant,
  onVariantChange,
  onSend,
  onStop,
}: {
  disabled: boolean
  busy: boolean
  sessionId: string | null
  models: ModelOption[]
  modelValue: string
  onModelChange: (value: string) => void
  includeContext: boolean
  onIncludeContextChange: (value: boolean) => void
  commands: { name: string; description?: string }[]
  agents: { id: string; name: string; description?: string }[]
  agent: string
  onAgentChange: (name: string) => void
  variant: string | null
  onVariantChange: (variant: string | null) => void
  onSend: (text: string, files: AttachedFile[]) => Promise<boolean>
  onStop: () => void
}) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [suggestIndex, setSuggestIndex] = useState(0)
  const [suggestDismissed, setSuggestDismissed] = useState(false)
  const [optsOpen, setOptsOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // per-session drafts survive switching sessions
  const draftsRef = useRef<Record<string, { text: string; files: AttachedFile[] }>>({})
  const sessionRef = useRef<string | null>(sessionId)
  useEffect(() => {
    const previous = sessionRef.current
    if (previous) draftsRef.current[previous] = { text, files }
    sessionRef.current = sessionId
    const next = sessionId ? draftsRef.current[sessionId] : undefined
    setText(next?.text ?? '')
    setFiles(next?.files ?? [])
    setSuggestDismissed(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // keep the draft map in sync so a session switch restores the latest text
  useEffect(() => {
    if (sessionRef.current) draftsRef.current[sessionRef.current] = { text, files }
  }, [text, files])

  // Cmd/Ctrl+K focuses the composer from anywhere in the panel
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        textareaRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const slashQuery = !suggestDismissed && text.startsWith('/') && !text.includes(' ') ? text.slice(1).toLowerCase() : null
  const suggestions =
    slashQuery != null ? commands.filter((command) => command.name.toLowerCase().startsWith(slashQuery)).slice(0, 8) : []

  const pickCommand = (name: string) => {
    setText(`/${name} `)
    setSuggestIndex(0)
    setSuggestDismissed(false)
  }

  const addFiles = async (incoming: File[]) => {
    const attachments = (await Promise.all(incoming.map(readFileAsAttachment))).filter((file): file is AttachedFile => !!file)
    if (attachments.length > 0) setFiles((prev) => [...prev, ...attachments])
  }

  const submit = async () => {
    const trimmed = text.trim()
    if ((!trimmed && files.length === 0) || disabled || submitting) return
    const sendingFiles = files
    setText('')
    setFiles([])
    setSuggestDismissed(false)
    setSubmitting(true)
    const ok = await onSend(trimmed, sendingFiles)
    setSubmitting(false)
    if (!ok) {
      // sending failed — put the user's work back
      setText(trimmed)
      setFiles(sendingFiles)
      textareaRef.current?.focus()
    }
  }

  return (
    <div
      className={`composer${dragOver ? ' drag-over' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragOver(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        void addFiles(Array.from(event.dataTransfer.files))
      }}
    >
      {dragOver && (
        <div className="drop-hint" aria-hidden="true">
          <span className="msym">upload_file</span> drop files to attach
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="command-menu">
          {suggestions.map((command, index) => (
            <button
              key={command.name}
              className={`command-row${index === suggestIndex ? ' selected' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault()
                pickCommand(command.name)
              }}
            >
              <span className="command-name">/{command.name}</span>
              {command.description && <span className="command-desc">{command.description}</span>}
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="attach-chips">
          {files.map((file, index) => (
            <span key={`${file.filename}-${index}`} className="attach-chip" title={file.filename}>
              <span className="msym sm" aria-hidden="true">
                draft
              </span>
              <span className="attach-name">{file.filename}</span> <em>{(file.size / 1024).toFixed(0)}KB</em>
              <button
                onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                title="Remove"
                aria-label={`Remove ${file.filename}`}
              >
                <span className="msym" aria-hidden="true">
                  close
                </span>
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-field">
      <textarea
        ref={textareaRef}
        value={text}
        placeholder={disabled ? 'opencode server not reachable' : 'Ask, or tell me what to do on this page… (/ for commands · ⌘K to focus)'}
        disabled={disabled}
        rows={3}
        title="Enter to send · Shift+Enter for a new line · ⌘K to focus · Esc to stop while working"
        onChange={(event) => {
          setText(event.target.value)
          setSuggestIndex(0)
          setSuggestDismissed(false)
        }}
        onPaste={(event) => {
          const items = event.clipboardData?.items
          if (!items) return
          const pasted: File[] = []
          for (const item of Array.from(items)) {
            if (item.kind === 'file') {
              const file = item.getAsFile()
              if (file) pasted.push(file)
            }
          }
          if (pasted.length > 0) {
            event.preventDefault()
            void addFiles(pasted)
          }
        }}
        onKeyDown={(event) => {
          if (suggestions.length > 0) {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setSuggestIndex((index) => (index + 1) % suggestions.length)
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setSuggestIndex((index) => (index - 1 + suggestions.length) % suggestions.length)
              return
            }
            if (event.key === 'Tab' || event.key === 'Enter') {
              event.preventDefault()
              const command = suggestions[suggestIndex]
              if (command) pickCommand(command.name)
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setSuggestDismissed(true)
              return
            }
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void submit()
          }
        }}
      />
      <div className="field-actions">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(event) => {
            void addFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
        <button
          className="attach-btn"
          title="Attach files to this message (up to 8MB each)"
          aria-label="Attach files"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="msym" aria-hidden="true">
            attach_file
          </span>
        </button>
        {busy ? (
          <button className="send stop" onClick={onStop} title="Stop" aria-label="Stop">
            <span className="msym filled" aria-hidden="true">
              stop
            </span>
          </button>
        ) : (
          <button
            className="send"
            disabled={disabled || (!text.trim() && files.length === 0)}
            onClick={() => void submit()}
            title="Send"
            aria-label="Send message"
          >
            <span className="msym filled" aria-hidden="true">
              send
            </span>
          </button>
        )}
      </div>
      </div>
      <div className="composer-meta">
        {optsOpen && <div className="composer-opts-backdrop" onClick={() => setOptsOpen(false)} />}
        <div className={`composer-opts${optsOpen ? ' open' : ''}`}>
          <label className="context-toggle" title="Attach a snapshot of the active tab to each message">
            <input
              type="checkbox"
              checked={includeContext}
              onChange={(event) => onIncludeContextChange(event.target.checked)}
              aria-label="Include page context in messages"
            />
            <span className="toggle-label">page context</span>
          </label>
          {agents.length > 1 && (
            <div className="agent-toggle" role="group" aria-label="Agent mode">
              {agents.map((entry) => (
                <button
                  key={entry.id}
                  className={entry.id === agent ? 'selected' : ''}
                  title={entry.description}
                  aria-pressed={entry.id === agent}
                  onClick={() => onAgentChange(entry.id)}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          )}
          <ModelPicker models={models} value={modelValue} onChange={onModelChange} />
          <VariantPicker
            variants={models.find((m) => m.value === modelValue)?.variants ?? []}
            value={variant}
            onChange={onVariantChange}
          />
        </div>
        <button
          className="icon-btn composer-compact-btn"
          title="Options"
          aria-label="Message options"
          aria-expanded={optsOpen}
          onClick={() => setOptsOpen((open) => !open)}
        >
          <span className="msym" aria-hidden="true">
            tune
          </span>
        </button>
      </div>
    </div>
  )
}
