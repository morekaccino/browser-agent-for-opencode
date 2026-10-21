import { useEffect, useRef, useState } from 'react'
import type { AttachedFile } from '../attachments'
import type { ModelOption } from '../useOpencode'
import type { LayoutMode } from '../design/useLayoutMode'
import { Chip, IconButton } from '../design/primitives'
import { ModelSheet } from './ModelSheet'
import { ComposerOptionsSheet } from './ComposerOptionsSheet'
import { ProviderAvatar } from './ProviderAvatar'

const MAX_FILE_BYTES = 8 * 1024 * 1024

function readFileAsAttachment(file: File): Promise<AttachedFile | null> {
  if (file.size > MAX_FILE_BYTES) return Promise.resolve(null)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve({
        mime: file.type || 'application/octet-stream',
        filename: file.name,
        dataUrl: String(reader.result),
        size: file.size,
      })
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

export function ComposerDock({
  disabled,
  busy,
  sessionId,
  models,
  modelValue,
  onModelChange,
  includeContext,
  contextLabel,
  onOpenContext,
  showContextChip = true,
  commands,
  agents,
  agent,
  onAgentChange,
  variant,
  onVariantChange,
  onSend,
  onStop,
  mode,
}: {
  disabled: boolean
  busy: boolean
  sessionId: string | null
  models: ModelOption[]
  modelValue: string
  onModelChange: (value: string) => void
  includeContext: boolean
  contextLabel: string
  onOpenContext: () => void
  showContextChip?: boolean
  commands: Array<{ name: string; description?: string }>
  agents: Array<{ id: string; name: string; description?: string }>
  agent: string
  onAgentChange: (value: string) => void
  variant: string | null
  onVariantChange: (value: string | null) => void
  onSend: (text: string, files: AttachedFile[]) => Promise<boolean>
  onStop: () => void
  mode: LayoutMode
}) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [suggestIndex, setSuggestIndex] = useState(0)
  const [suggestDismissed, setSuggestDismissed] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const draftsRef = useRef<Record<string, { text: string; files: AttachedFile[] }>>({})
  const sessionRef = useRef<string | null>(sessionId)

  const currentModel = models.find((model) => model.value === modelValue)
  const currentAgent = agents.find((entry) => entry.id === agent)
  const currentVariants = currentModel?.variants ?? []

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

  useEffect(() => {
    if (sessionRef.current) draftsRef.current[sessionRef.current] = { text, files }
  }, [text, files])

  useEffect(() => {
    if (!attachError) return
    const timer = setTimeout(() => setAttachError(null), 4000)
    return () => clearTimeout(timer)
  }, [attachError])

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(Math.max(element.scrollHeight, 44), 168)}px`
  }, [text])

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

  const slashQuery =
    !suggestDismissed && text.startsWith('/') && !text.includes(' ') ? text.slice(1).toLowerCase() : null
  const suggestions =
    slashQuery != null
      ? commands.filter((command) => command.name.toLowerCase().startsWith(slashQuery)).slice(0, 8)
      : []

  const pickCommand = (name: string) => {
    setText(`/${name} `)
    setSuggestIndex(0)
    setSuggestDismissed(false)
  }

  const addFiles = async (incoming: File[]) => {
    const attachments = (await Promise.all(incoming.map(readFileAsAttachment))).filter(
      (file): file is AttachedFile => !!file,
    )
    if (attachments.length < incoming.length) setAttachError('Some files were skipped (8 MB limit).')
    if (attachments.length > 0) setFiles((previous) => [...previous, ...attachments])
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
      setText(trimmed)
      setFiles(sendingFiles)
      textareaRef.current?.focus()
    }
  }

  return (
    <div
      className={`composer-dock${dragOver ? ' is-dragging' : ''}`}
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
      {dragOver ? (
        <div className="composer-drop" aria-hidden="true">
          <span className="msym lg" aria-hidden="true">upload_file</span>
          Drop files to attach
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="composer-suggestions" role="listbox" aria-label="Commands">
          {suggestions.map((command, index) => (
            <button
              key={command.name}
              type="button"
              role="option"
              aria-selected={index === suggestIndex}
              className={`composer-suggestion${index === suggestIndex ? ' is-selected' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault()
                pickCommand(command.name)
              }}
            >
              <code>/{command.name}</code>
              {command.description ? <span>{command.description}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className={`composer-surface${busy ? ' is-busy' : ''}`} aria-busy={busy}>
        {files.length > 0 ? (
          <div className="composer-attachments">
            {files.map((file, index) => (
              <Chip
                key={`${file.filename}-${index}`}
                icon="draft"
                label={`${file.filename} · ${Math.max(1, Math.round(file.size / 1024))}KB`}
                trailingIcon="close"
                onTrailingClick={() => setFiles((previous) => previous.filter((_, i) => i !== index))}
                className="attachment-chip"
              />
            ))}
          </div>
        ) : null}
        {attachError ? (
          <div className="composer-attach-error" role="status">
            {attachError}
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          value={text}
          rows={1}
          className="composer-input"
          aria-label="Message"
          placeholder={disabled ? 'Connect opencode to start' : 'Ask anything…'}
          disabled={disabled}
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
              if (item.kind !== 'file') continue
              const file = item.getAsFile()
              if (file) pasted.push(file)
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
            if (event.key === 'Escape' && busy) {
              event.preventDefault()
              onStop()
              return
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
        />

        <div className="composer-controls">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              void addFiles(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          <IconButton
            icon="attach_file"
            label="Attach files"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
          />
          <button
            type="button"
            className="composer-chip model-chip"
            onClick={() => setModelOpen(true)}
            disabled={models.length === 0}
            title={currentModel?.label ?? 'Choose a model'}
          >
            {currentModel ? <ProviderAvatar providerID={currentModel.providerID} size={16} /> : null}
            <span className="composer-chip-label">{currentModel?.name ?? 'No model'}</span>
            <span className="msym sm" aria-hidden="true">arrow_drop_down</span>
          </button>

          {showContextChip ? (
            <Chip
              icon={includeContext ? 'web' : 'web_asset_off'}
              label={contextLabel}
              selected={includeContext}
              onClick={onOpenContext}
              className="composer-context-chip"
              title="Page context"
            />
          ) : null}

          {agents.length > 1 ? (
            <Chip
              icon="smart_toy"
              label={currentAgent?.name ?? agent}
              onClick={() => setOptionsOpen(true)}
              className="composer-agent-chip"
              title="Agent and reasoning options"
            />
          ) : null}

          <div className="composer-spacer" />

          {mode !== 'compact' || currentVariants.length > 0 ? (
            <IconButton
              icon="tune"
              label="Message options"
              variant="ghost"
              onClick={() => setOptionsOpen(true)}
            />
          ) : null}

          {busy ? (
            <IconButton icon="stop" label="Stop" variant="tonal" className="composer-stop" onClick={onStop} />
          ) : (
            <IconButton
              icon="send"
              label="Send message"
              variant="filled"
              className="composer-send"
              disabled={disabled || (!text.trim() && files.length === 0)}
              onClick={() => void submit()}
            />
          )}
        </div>
      </div>

      <ModelSheet
        open={modelOpen}
        onOpenChange={setModelOpen}
        models={models}
        value={modelValue}
        onChange={onModelChange}
        mode={mode}
      />
      <ComposerOptionsSheet
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        agents={agents}
        agent={agent}
        onAgentChange={onAgentChange}
        variants={currentVariants}
        variant={variant}
        onVariantChange={onVariantChange}
        mode={mode}
      />
    </div>
  )
}
