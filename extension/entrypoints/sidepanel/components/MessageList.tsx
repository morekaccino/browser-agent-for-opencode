import { useEffect, useRef, useState } from 'react'
import type { UiMessage, UiPart } from '../useOpencode'
import { Markdown } from './Markdown'

function truncate(text: string, max = 4000): string {
  return text.length > max ? text.slice(0, max) + `\n… (${text.length - max} chars truncated)` : text
}

function copyText(text: string): void {
  try {
    void navigator.clipboard.writeText(text)
  } catch {
    /* clipboard unavailable */
  }
}

function ToolView({ part }: { part: any }) {
  const state = part.state ?? {}
  const status: string = state.status ?? 'pending'
  const input = state.input ? JSON.stringify(state.input, null, 2) : ''
  const output: string = state.output ?? state.error ?? ''
  const title: string = state.title ?? ''
  const [copied, setCopied] = useState(false)
  return (
    <div className={`tool tool-${status}`}>
      <div className="tool-head">
        <span className={`tool-dot tool-dot-${status}`} aria-hidden="true" />
        <span className="tool-name">{part.tool}</span>
        {title && <span className="tool-title">{title}</span>}
        {output && (
          <button
            className="tool-copy"
            title="Copy output"
            aria-label={`Copy output of ${part.tool}`}
            onClick={() => {
              copyText(output)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            }}
          >
            <span className="msym" aria-hidden="true">
              {copied ? 'check' : 'content_copy'}
            </span>
          </button>
        )}
      </div>
      {(input || output) && (
        <details className="tool-body">
          <summary>{status === 'completed' ? 'details' : status}</summary>
          {input && (
            <>
              <div className="tool-label">input</div>
              <pre>{truncate(input, 2000)}</pre>
            </>
          )}
          {output && (
            <>
              <div className="tool-label">output</div>
              <pre>{truncate(output, 4000)}</pre>
            </>
          )}
        </details>
      )}
      {!input && !output && status === 'running' && <div className="tool-running">running…</div>}
    </div>
  )
}

/** Consecutive tool calls collapse into a single quiet summary row. */
function ToolGroup({ parts }: { parts: any[] }) {
  const [open, setOpen] = useState(false)
  const statuses = parts.map((p) => p.state?.status)
  const running = statuses.includes('running')
  const failed = statuses.includes('error')
  const names = parts.map((p) => p.tool)
  const summary = names.slice(0, 3).join(' · ') + (names.length > 3 ? ' …' : '')
  return (
    <div className="tool-group">
      <button className="tool-group-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`tool-dot tool-dot-${running ? 'running' : failed ? 'error' : 'completed'}`} aria-hidden="true" />
        <span className="tool-group-count">{parts.length} steps</span>
        <span className="tool-group-names">{summary}</span>
        <span className="msym" aria-hidden="true">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && (
        <div className="tool-group-body">
          {parts.map((part) => (
            <ToolView key={part.id} part={part} />
          ))}
        </div>
      )}
    </div>
  )
}

function PartView({ part, stripContext, markdown }: { part: UiPart; stripContext?: boolean; markdown?: boolean }) {
  const anyPart = part as any
  switch (anyPart.type) {
    case 'text': {
      if (!anyPart.text) return null
      const text: string = anyPart.text
      if (stripContext && text.includes('<current-page>')) {
        const clean = text.replace(/<current-page>[\s\S]*?<\/current-page>/g, '').trim()
        return (
          <div className="part text">
            {clean && <div>{clean}</div>}
            <span className="context-chip" title="The active tab's snapshot was attached as hidden context for the model">
              page context
            </span>
          </div>
        )
      }
      if (markdown) return <Markdown text={text} />
      return <div className="part text">{text}</div>
    }
    case 'reasoning':
      return anyPart.text ? (
        <details className="part reasoning">
          <summary>reasoning</summary>
          <div>{anyPart.text}</div>
        </details>
      ) : null
    case 'tool':
      return <ToolView part={anyPart} />
    case 'file':
      return <div className="part file">file: {anyPart.filename ?? anyPart.url ?? 'attachment'}</div>
    default:
      return null
  }
}

function messageText(message: UiMessage, parts: UiPart[]): string {
  return parts
    .filter((p) => (p as any).type === 'text')
    .map((p) => (p as any).text)
    .join('\n\n')
    .trim()
}

function MessageRow({
  message,
  parts,
  isLastUser,
  onRetry,
  copied,
  onCopied,
}: {
  message: UiMessage
  parts: UiPart[]
  isLastUser: boolean
  onRetry?: (text: string) => void
  copied: string | null
  onCopied: (id: string | null) => void
}) {
  const role = message.role
  const error = (message as any).error as { name?: string; message?: string } | undefined
  const text = messageText(message, parts)

  const groups: Array<{ kind: 'part'; part: UiPart } | { kind: 'tools'; parts: UiPart[] }> = []
  for (const part of parts) {
    const type = (part as any).type
    // step markers are invisible separators — never break a run of tool calls
    if (type === 'step-start' || type === 'step-finish') continue
    if (type === 'tool') {
      const last = groups[groups.length - 1]
      if (last && last.kind === 'tools') last.parts.push(part)
      else groups.push({ kind: 'tools', parts: [part] })
    } else {
      groups.push({ kind: 'part', part })
    }
  }

  return (
    <div className={`message message-${role}`}>
      <div className="message-role">
        {role === 'assistant' && <img src="/icon/48.png" alt="" className="role-logo" />}
        {role === 'user' ? 'you' : 'agent'}
      </div>
      <div className="message-parts">
        {groups.map((group, index) =>
          group.kind === 'tools' ? (
            group.parts.length > 1 ? (
              <ToolGroup key={`tools-${index}`} parts={group.parts} />
            ) : (
              <ToolView key={group.parts[0]!.id} part={group.parts[0]} />
            )
          ) : (
            <PartView key={group.part.id} part={group.part} stripContext={role === 'user'} markdown={role === 'assistant'} />
          ),
        )}
        {role === 'assistant' && parts.length === 0 && <div className="part muted">thinking…</div>}
        {error && <div className="part error-text">{error.message ?? error.name ?? 'error'}</div>}
      </div>
      {role === 'assistant' && text && (
        <div className="message-actions">
          <button
            className="msg-action"
            onClick={() => {
              copyText(text)
              onCopied(message.id)
              setTimeout(() => onCopied(null), 1200)
            }}
          >
            <span className="msym" aria-hidden="true">
              {copied === message.id ? 'check' : 'content_copy'}
            </span>
            {copied === message.id ? 'copied' : 'copy'}
          </button>
        </div>
      )}
      {role === 'user' && isLastUser && text && onRetry && (
        <div className="message-actions">
          <button className="msg-action" onClick={() => onRetry(text)}>
            <span className="msym" aria-hidden="true">
              refresh
            </span>
            retry
          </button>
        </div>
      )}
    </div>
  )
}

export function MessageList({
  messages,
  parts,
  busy,
  error,
  pendingText,
  pendingFiles,
  onRetry,
  onDismissError,
}: {
  messages: UiMessage[]
  parts: Record<string, UiPart[]>
  busy: boolean
  error: string | null
  pendingText?: string | null
  pendingFiles?: string[]
  onRetry?: (text: string) => void
  onDismissError?: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el && pinned) el.scrollTop = el.scrollHeight
  }, [messages, parts, busy, pinned])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
  }

  const jumpToLatest = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setPinned(true)
  }

  let lastUserId: string | null = null
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m && m.role === 'user') {
      lastUserId = m.id
      break
    }
  }
  const lastUserMessage = messages.find((m) => m.id === lastUserId)
  const lastUserText = lastUserMessage ? messageText(lastUserMessage, parts[lastUserMessage.id] ?? []) : ''
  const showPending = !!pendingText && !lastUserText.includes(pendingText)

  return (
    <div
      className="messages-scroll"
      ref={scrollRef}
      onScroll={onScroll}
      tabIndex={0}
      role="region"
      aria-label="Conversation messages"
    >
      <div className="messages" role="log" aria-live="off">
        {messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            parts={parts[message.id] ?? []}
            isLastUser={message.id === lastUserId}
            onRetry={onRetry}
            copied={copied}
            onCopied={setCopied}
          />
        ))}
        {showPending && (
          <div className="message message-user">
            <div className="message-role">you</div>
            <div className="message-parts">
              <div className="part text">{pendingText}</div>
              {pendingFiles && pendingFiles.length > 0 && (
                <span className="context-chip">{pendingFiles.join(', ')}</span>
              )}
            </div>
          </div>
        )}
        {busy && (
          <div className="working" role="status" aria-label="The agent is working">
            <span className="pulse" aria-hidden="true" /> working…
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <span className="error-text-content">{error}</span>
            {onDismissError && (
              <button className="icon-btn error-dismiss" onClick={onDismissError} aria-label="Dismiss error">
                <span className="msym sm" aria-hidden="true">
                  close
                </span>
              </button>
            )}
          </div>
        )}
      </div>
      {!pinned && (
        <button className="jump-latest" onClick={jumpToLatest} title="Back to the latest message">
          <span className="msym" aria-hidden="true">
            arrow_downward
          </span>{' '}
          latest
        </button>
      )}
    </div>
  )
}
