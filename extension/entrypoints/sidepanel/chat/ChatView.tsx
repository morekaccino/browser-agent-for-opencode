import { useMemo, useState } from 'react'
import type { BridgeStatus } from '../../../lib/protocol'
import type { ActiveTab } from '../hooks'
import { isRunActive, type useOpencode } from '../useOpencode'
import type { AttachedFile } from '../attachments'
import type { LayoutMode } from '../design/useLayoutMode'
import { AppBar } from '../shell/AppBar'
import { IconButton, Menu } from '../design/primitives'
import { ChatFeed } from './ChatFeed'
import { ComposerDock } from './ComposerDock'
import { ConnectView } from './ConnectView'
import { ConnectionSheet } from './ConnectionSheet'
import { ContextSheet, ContextStrip } from './ContextBar'
import { RequestDock, RequestSheet } from './RequestSheet'
import { SessionPane, SessionSheet } from './SessionPane'
import { UsageSheet } from './UsageSheet'

type OpencodeController = ReturnType<typeof useOpencode>

export function ChatView({
  opencode,
  bridge,
  tab,
  serverUrl,
  mode,
  onMenu,
  followAgent,
  onToggleFollow,
  includeContext,
  onIncludeContextChange,
  onReveal,
  onReconnect,
  onSend,
}: {
  opencode: OpencodeController
  bridge: BridgeStatus
  tab: ActiveTab
  serverUrl: string
  mode: LayoutMode
  onMenu: () => void
  followAgent: boolean
  onToggleFollow: () => void
  includeContext: boolean
  onIncludeContextChange: (value: boolean) => void
  onReveal: () => void
  onReconnect: () => void
  onSend: (text: string, files: AttachedFile[]) => Promise<boolean>
}) {
  const [sessionSheetOpen, setSessionSheetOpen] = useState(false)
  const [contextSheetOpen, setContextSheetOpen] = useState(false)
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [usageOpen, setUsageOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)

  const current = opencode.sessions.find((session) => session.id === opencode.currentId)
  const currentStatus = current ? opencode.statuses[current.id] : undefined
  const currentActive = isRunActive(currentStatus)
  const activeLabel = currentStatus === 'retry' ? 'retrying…' : 'working…'
  const currentTitle =
    current?.title && !current.title.trim().startsWith('ses_') ? current.title : 'New session'
  const connected = opencode.health === 'ok' && bridge.state === 'connected'
  const needsSetup = !connected
  const lastUserText = useMemo(() => {
    for (let index = opencode.messages.length - 1; index >= 0; index--) {
      const message = opencode.messages[index]
      if (message?.role !== 'user') continue
      const text = (opencode.parts[message.id] ?? [])
        .filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('\n')
        .trim()
      if (text) return text
    }
    return ''
  }, [opencode.messages, opencode.parts])

  const send = (text: string) => {
    if (!text.trim()) return
    void onSend(text, [])
  }

  const appBar = (
    <AppBar
      title={currentTitle}
      subtitle={current ? (currentActive ? activeLabel : undefined) : 'Ask about this page'}
      onMenu={mode === 'compact' ? onMenu : undefined}
      onTitleClick={mode === 'expanded' ? undefined : () => setSessionSheetOpen(true)}
      actions={
        <>
          <button
            type="button"
            className="app-bar-health-button"
            onClick={() => setConnectionOpen(true)}
            title={connected ? 'opencode and browser bridge connected' : 'connection needs attention'}
            aria-label={connected ? 'opencode and browser bridge connected' : 'connection needs attention'}
          >
            <span className={`app-bar-health${connected ? ' is-ok' : ' is-warn'}`} aria-hidden="true" />
          </button>
          <IconButton icon="add" label="New session" onClick={() => void opencode.newSession()} />
          <Menu
            label="Chat actions"
            trigger={<IconButton icon="more_vert" label="Chat actions" variant="ghost" />}
            items={[
              { label: 'New session', icon: 'add', onSelect: () => void opencode.newSession() },
              { label: 'Sessions', icon: 'forum', onSelect: () => setSessionSheetOpen(true) },
              { label: 'Usage', icon: 'data_usage', onSelect: () => setUsageOpen(true) },
              { label: 'Connection', icon: 'cable', onSelect: () => setConnectionOpen(true) },
            ]}
          />
        </>
      }
    />
  )

  const composer = (
    <ComposerDock
      disabled={needsSetup}
      busy={isRunActive(opencode.statuses[opencode.currentId ?? ''])}
      sessionId={opencode.currentId}
      models={opencode.models}
      modelValue={opencode.model ? `${opencode.model.providerID}/${opencode.model.modelID}` : ''}
      onModelChange={opencode.chooseModel}
      includeContext={includeContext}
      contextLabel={mode === 'compact' ? (tab.title ? 'Page' : 'No page') : tab.title || 'No page'}
      onOpenContext={() => setContextSheetOpen(true)}
      showContextChip={mode === 'compact' || !tab.url}
      commands={opencode.commands}
      agents={opencode.agents}
      agent={opencode.agent}
      onAgentChange={opencode.setAgent}
      variant={opencode.variant}
      onVariantChange={opencode.chooseVariant}
      onSend={onSend}
      onStop={() => void opencode.abort()}
      mode={mode}
    />
  )

  return (
    <div className="chat-view">
      <div className="chat-body">
        {mode === 'expanded' ? (
          <SessionPane
            sessions={opencode.sessions}
            currentId={opencode.currentId}
            statuses={opencode.statuses}
            loaded={opencode.sessionsLoaded}
            onSelect={opencode.setCurrentId}
            onNew={() => void opencode.newSession()}
            onRename={(id, title) => void opencode.renameSession(id, title)}
            onDelete={(id) => void opencode.deleteSession(id)}
          />
        ) : null}

        <div className="chat-pane">
          {appBar}
          {mode !== 'compact' && tab.url ? (
            <div className="context-strip-wrap">
              <ContextStrip tab={tab} includeContext={includeContext} onClick={() => setContextSheetOpen(true)} />
            </div>
          ) : null}

          {needsSetup ? (
            <div className="chat-scroll">
              <ConnectView
                bridgeState={bridge.state}
                bridgeDetail={bridge.detail}
                serverUrl={serverUrl}
                health={opencode.health}
                onReconnect={onReconnect}
              />
            </div>
          ) : (
            <ChatFeed
              messages={opencode.messages}
              parts={opencode.parts}
              busy={isRunActive(opencode.statuses[opencode.currentId ?? ''])}
              error={opencode.lastError}
              pendingText={opencode.pendingSend?.text}
              pendingFiles={opencode.pendingSend?.files?.map((filename) => ({ filename }))}
              onRetry={lastUserText ? () => send(lastUserText) : undefined}
              onDismissError={opencode.clearError}
              onSuggestion={send}
            />
          )}

          {!needsSetup ? (
            <>
              <RequestDock
                permissions={opencode.permissions.filter((permission) => permission.sessionID === opencode.currentId)}
                forms={opencode.forms.filter((form) => form.sessionID === opencode.currentId)}
                onClick={() => setRequestOpen(true)}
              />
              {composer}
            </>
          ) : null}
        </div>
      </div>

      <SessionSheet
        open={sessionSheetOpen}
        onOpenChange={setSessionSheetOpen}
        mode={mode}
        sessions={opencode.sessions}
        currentId={opencode.currentId}
        statuses={opencode.statuses}
        loaded={opencode.sessionsLoaded}
        onSelect={(id) => {
          opencode.setCurrentId(id)
          setSessionSheetOpen(false)
        }}
        onNew={() => {
          void opencode.newSession()
          setSessionSheetOpen(false)
        }}
        onRename={(id, title) => void opencode.renameSession(id, title)}
        onDelete={(id) => void opencode.deleteSession(id)}
      />

      <ContextSheet
        open={contextSheetOpen}
        onOpenChange={setContextSheetOpen}
        tab={tab}
        includeContext={includeContext}
        onIncludeContextChange={onIncludeContextChange}
        followAgent={followAgent}
        onToggleFollow={onToggleFollow}
        onReveal={onReveal}
      />

      <ConnectionSheet
        open={connectionOpen}
        onOpenChange={setConnectionOpen}
        bridge={bridge}
        serverUrl={serverUrl}
        health={opencode.health}
        onReconnect={onReconnect}
      />

      <UsageSheet
        open={usageOpen}
        onOpenChange={setUsageOpen}
        usage={opencode.contextUsage}
        cost={opencode.sessionCost}
      />

      <RequestSheet
        open={requestOpen}
        onOpenChange={setRequestOpen}
        permissions={opencode.permissions.filter((permission) => permission.sessionID === opencode.currentId)}
        forms={opencode.forms.filter((form) => form.sessionID === opencode.currentId)}
        onReplyPermission={opencode.replyPermission}
        onReplyForm={opencode.replyForm}
        onCancelForm={opencode.cancelForm}
      />
    </div>
  )
}
