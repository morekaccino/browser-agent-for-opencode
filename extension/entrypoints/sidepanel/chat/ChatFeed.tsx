import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { UiMessage, UiPart } from '../useOpencode'
import { Markdown } from '../components/Markdown'
import { Badge, Button, Chip, EmptyState, IconButton, Spinner } from '../design/primitives'

function copy(text: string): void {
  try {
    void navigator.clipboard.writeText(text)
  } catch {
    /* clipboard unavailable */
  }
}

function partText(parts: UiPart[]): string {
  return parts
    .map((part) => {
      if (part.type === 'text' || part.type === 'reasoning') return part.text ?? ''
      if (part.type === 'tool') return `[${part.tool ?? 'tool'}] ${part.state?.output ?? ''}`
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function toolIcon(tool?: string): string {
  switch (tool) {
    case 'browser_snapshot':
      return 'capture'
    case 'browser_click':
      return 'ads_click'
    case 'browser_type':
      return 'keyboard'
    case 'browser_navigate':
      return 'explore'
    case 'browser_screenshot':
      return 'photo_camera'
    case 'browser_console':
      return 'terminal'
    case 'browser_tabs':
      return 'tab'
    case 'browser_downloads':
      return 'download'
    case 'browser_upload':
      return 'upload_file'
    default:
      return 'build'
  }
}

function ActivityRow({ part }: { part: UiPart }) {
  const state = (part.state ?? {}) as NonNullable<UiPart['state']>
  const status = state.status ?? 'running'
  const isRunning = status === 'running' || status === 'streaming' || status === 'pending'
  const hasDetails = !!state.input || !!state.output || !!state.error
  return (
    <div className={`tool-row tool-row-${status}`}>
      <span className="tool-row-icon">
        <span className="msym sm" aria-hidden="true">{toolIcon(part.tool)}</span>
      </span>
      <div className="tool-row-main">
        <div className="tool-row-head">
          <code>{part.tool}</code>
          {isRunning ? (
            <Badge tone="primary" icon="progress_activity">running</Badge>
          ) : status === 'error' ? (
            <Badge tone="error" icon="error">error</Badge>
          ) : (
            <Badge tone="neutral" icon="check">done</Badge>
          )}
          {hasDetails ? (
            <IconButton
              icon="content_copy"
              label="Copy tool output"
              variant="ghost"
              size="sm"
              onClick={() => copy(String(state.output ?? state.error ?? JSON.stringify(state.input ?? {}, null, 2)))}
            />
          ) : null}
        </div>
        {state.title ? <div className="tool-row-title">{state.title}</div> : null}
        {hasDetails ? (
          <details className="tool-row-details">
            <summary>Details</summary>
            {state.input ? (
              <pre className="tool-pre">{JSON.stringify(state.input, null, 2)}</pre>
            ) : null}
            {state.output ? <pre className="tool-pre">{state.output}</pre> : null}
            {state.error ? <pre className="tool-pre tool-pre-error">{state.error}</pre> : null}
          </details>
        ) : null}
      </div>
    </div>
  )
}

function ActivityGroup({ parts }: { parts: UiPart[] }) {
  const [open, setOpen] = useState(false)
  const running = parts.some((part) => {
    const status = part.state?.status
    return status === 'running' || status === 'streaming' || status === 'pending'
  })
  const failed = parts.some((part) => part.state?.status === 'error')
  const names = parts.map((part) => part.tool).filter(Boolean) as string[]
  const summary = names.length > 2 ? `${names.slice(0, 2).join(' · ')} +${names.length - 2}` : names.join(' · ')

  return (
    <div className={`activity-group${open ? ' is-open' : ''}`}>
      <button type="button" className="activity-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className={`activity-status${running ? ' is-running' : failed ? ' is-error' : ' is-done'}`}>
          <span className="msym sm" aria-hidden="true">
            {running ? 'progress_activity' : failed ? 'error' : 'check'}
          </span>
        </span>
        <span className="activity-title">Activity</span>
        <span className="activity-summary">
          {summary || `${parts.length} step${parts.length === 1 ? '' : 's'}`}
        </span>
        <span className={`msym sm activity-chevron${open ? ' is-open' : ''}`} aria-hidden="true">expand_more</span>
      </button>
      {open ? <div className="activity-body">{parts.map((part) => <ActivityRow key={part.id} part={part} />)}</div> : null}
    </div>
  )
}

function ReasoningGroup({ parts }: { parts: UiPart[] }) {
  const text = parts.map((part) => part.text ?? '').filter(Boolean).join('\n\n').trim()
  if (!text) return null
  return (
    <details className="reasoning-group">
      <summary>
        <span className="msym sm" aria-hidden="true">psychology</span>
        <span>Reasoning</span>
        <span className="reasoning-meta">{parts.length > 1 ? `${parts.length} steps` : '1 step'}</span>
        <span className="msym sm reasoning-chevron" aria-hidden="true">expand_more</span>
      </summary>
      <div className="reasoning-body">{text}</div>
    </details>
  )
}

function AssistantParts({ parts }: { parts: UiPart[] }) {
  const blocks = useMemo(() => {
    const out: Array<{ kind: 'text'; part: UiPart } | { kind: 'tools'; parts: UiPart[] } | { kind: 'reasoning'; parts: UiPart[] }> = []
    for (const part of parts) {
      if (part.type === 'tool') {
        const last = out[out.length - 1]
        if (last?.kind === 'tools') last.parts.push(part)
        else out.push({ kind: 'tools', parts: [part] })
      } else if (part.type === 'reasoning') {
        const last = out[out.length - 1]
        if (last?.kind === 'reasoning') last.parts.push(part)
        else out.push({ kind: 'reasoning', parts: [part] })
      } else if (part.type === 'text') {
        out.push({ kind: 'text', part })
      }
    }
    return out
  }, [parts])

  return (
    <div className="message-parts">
      {blocks.map((block) => {
        if (block.kind === 'tools') return <ActivityGroup key={block.parts[0]?.id ?? 'tools'} parts={block.parts} />
        if (block.kind === 'reasoning') return <ReasoningGroup key={block.parts[0]?.id ?? 'reasoning'} parts={block.parts} />
        return block.part.text ? <Markdown key={block.part.id} text={block.part.text} /> : null
      })}
    </div>
  )
}

function UserMessage({
  parts,
  pending,
}: {
  parts: UiPart[]
  pending?: boolean
}) {
  return (
    <div className={`message message-user${pending ? ' is-pending' : ''}`}>
      <div className="user-bubble">
        {parts.map((part) =>
          part.type === 'file' ? (
            <Chip key={part.id} icon="draft" label={part.filename ?? 'attachment'} className="user-file" />
          ) : part.type === 'text' && part.text ? (
            <Markdown key={part.id} text={part.text} />
          ) : null,
        )}
        {pending ? <span className="pending-dot" aria-label="Sending" /> : null}
      </div>
    </div>
  )
}

function AssistantMessage({
  message,
  parts,
  busy,
  showIdentity,
}: {
  message: UiMessage
  parts: UiPart[]
  busy: boolean
  showIdentity: boolean
}) {
  const text = partText(parts)
  return (
    <div className={`message message-assistant${showIdentity ? '' : ' is-continuation'}`}>
      {showIdentity ? (
        <div className="assistant-identity">
          <span className="assistant-avatar" aria-hidden="true">
            <img src="/icon/32.png" alt="" />
          </span>
          <span>agent</span>
        </div>
      ) : null}
      <AssistantParts parts={parts} />
      {busy && !text ? (
        <div className="typing-indicator" aria-label="The agent is working">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {message.error ? (
        <div className="message-error" role="alert">
          <span className="msym sm" aria-hidden="true">error</span>
          <span>{message.error.message ?? 'The run failed.'}</span>
        </div>
      ) : null}
      {text ? (
        <div className="assistant-actions">
          <IconButton icon="content_copy" label="Copy reply" variant="ghost" size="sm" onClick={() => copy(text)} />
        </div>
      ) : null}
    </div>
  )
}

export function ChatFeed({
  messages,
  parts,
  busy,
  error,
  pendingText,
  pendingFiles,
  onRetry,
  onDismissError,
  onSuggestion,
}: {
  messages: UiMessage[]
  parts: Record<string, UiPart[]>
  busy: boolean
  error: string | null
  pendingText?: string
  pendingFiles?: Array<{ filename: string }>
  onRetry?: () => void
  onDismissError?: () => void
  onSuggestion?: (text: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [showJump, setShowJump] = useState(false)

  const scrollToBottom = (smooth = false) => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    pinned.current = true
    setShowJump(false)
  }

  useEffect(() => {
    if (pinned.current) {
      requestAnimationFrame(() => scrollToBottom())
    }
  }, [messages, parts, busy, pendingText])

  const onScroll = () => {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    pinned.current = distance < 90
    setShowJump(distance > 180)
  }

  const hasPending = !!pendingText || (pendingFiles?.length ?? 0) > 0
  const isEmpty = messages.length === 0 && !hasPending && !busy

  return (
    <div className="chat-feed-wrap">
      <div className="chat-feed" ref={scrollRef} onScroll={onScroll}>
        {isEmpty ? (
          <EmptyState
            icon="forum"
            title="Ask about this page"
            description="The agent can read the page, click, type, navigate, and explain what it finds."
            action={
              <div className="suggestion-row">
                <Chip icon="summarize" label="Summarize this page" onClick={() => onSuggestion?.('Summarize this page and give me the key points.')} />
                <Chip icon="search" label="Find something" onClick={() => onSuggestion?.('Help me find something on this page. What can you see?')} />
                <Chip icon="edit_note" label="Fill a form" onClick={() => onSuggestion?.('Find the form on this page and help me fill it out.')} />
              </div>
            }
          />
        ) : (
          <div className="chat-feed-inner">
            {messages.map((message, index) => {
              const messageParts = parts[message.id] ?? []
              if (message.role === 'user') {
                return <UserMessage key={message.id} parts={messageParts} />
              }
              return (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  parts={messageParts}
                  busy={busy && index === messages.length - 1}
                  showIdentity={messages[index - 1]?.role !== 'assistant'}
                />
              )
            })}
            {hasPending ? (
              <UserMessage
                parts={[
                  ...(pendingText ? [{ id: 'pending-text', type: 'text' as const, text: pendingText }] : []),
                  ...(pendingFiles ?? []).map((file, index) => ({
                    id: `pending-file-${index}`,
                    type: 'file' as const,
                    filename: file.filename,
                  })),
                ]}
                pending
              />
            ) : null}
            {busy && !pendingText ? (
              <div className="working-row">
                <Spinner label="The agent is working" />
                <span>working…</span>
              </div>
            ) : null}
            {error ? (
              <div className="chat-error" role="alert">
                <span className="msym sm" aria-hidden="true">error</span>
                <span>{error}</span>
                <div className="chat-error-actions">
                  {onRetry ? (
                    <Button variant="text" size="sm" onClick={onRetry}>
                      Retry
                    </Button>
                  ) : null}
                  {onDismissError ? (
                    <Button variant="text" size="sm" onClick={onDismissError}>
                      Dismiss
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
      {showJump ? (
        <button type="button" className="jump-latest" onClick={() => scrollToBottom(true)} aria-label="Jump to latest">
          <span className="msym sm" aria-hidden="true">arrow_downward</span>
          Latest
        </button>
      ) : null}
    </div>
  )
}
