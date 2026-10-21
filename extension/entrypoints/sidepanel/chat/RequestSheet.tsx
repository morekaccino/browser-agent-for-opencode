import type { PendingForm, PendingPermission } from '../useOpencode'
import { FormBar } from '../components/FormCard'
import { Badge, Button, Chip, Sheet } from '../design/primitives'

export function RequestDock({
  permissions,
  forms,
  onClick,
}: {
  permissions: PendingPermission[]
  forms: PendingForm[]
  onClick: () => void
}) {
  const count = permissions.length + forms.length
  if (count === 0) return null
  return (
    <button type="button" className="request-dock" onClick={onClick}>
      <span className="request-dock-icon">
        <span className="msym sm" aria-hidden="true">pan_tool</span>
      </span>
      <span className="request-dock-text">
        <strong>{count} request{count === 1 ? '' : 's'} need your input</strong>
        <small>
          {permissions.length > 0 ? `${permissions.length} permission${permissions.length === 1 ? '' : 's'}` : ''}
          {permissions.length > 0 && forms.length > 0 ? ' · ' : ''}
          {forms.length > 0 ? `${forms.length} question${forms.length === 1 ? '' : 's'}` : ''}
        </small>
      </span>
      <span className="msym sm" aria-hidden="true">expand_less</span>
    </button>
  )
}

export function RequestSheet({
  open,
  onOpenChange,
  permissions,
  forms,
  onReplyPermission,
  onReplyForm,
  onCancelForm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  permissions: PendingPermission[]
  forms: PendingForm[]
  onReplyPermission: (permission: PendingPermission, response: 'once' | 'always' | 'reject') => void
  onReplyForm: (form: PendingForm, answer: Record<string, string | number | boolean | string[]>) => void
  onCancelForm: (form: PendingForm) => void
}) {
  const count = permissions.length + forms.length
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      title="Needs your input"
      description={count > 0 ? 'The agent is waiting for you.' : 'No pending requests.'}
      bodyClassName="request-sheet-body"
    >
      {permissions.length > 0 ? (
        <div className="request-section">
          <div className="sheet-section-title">Permissions</div>
          {permissions.map((permission) => (
            <div key={permission.id} className="permission-card">
              <div className="permission-head">
                <Badge tone="warning" icon="key">{permission.action}</Badge>
                <span>{permission.message ?? 'The agent wants permission to continue.'}</span>
              </div>
              {permission.resources.length > 0 ? (
                <div className="permission-resources">
                  {permission.resources.slice(0, 6).map((resource) => (
                    <Chip key={resource} icon="link" label={resource} />
                  ))}
                </div>
              ) : null}
              <div className="permission-actions">
                <Button variant="filled" size="sm" icon="check" onClick={() => onReplyPermission(permission, 'once')}>
                  Allow once
                </Button>
                <Button variant="tonal" size="sm" icon="done_all" onClick={() => onReplyPermission(permission, 'always')}>
                  Always
                </Button>
                <Button variant="text" size="sm" icon="close" onClick={() => onReplyPermission(permission, 'reject')}>
                  Deny
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {forms.length > 0 ? (
        <div className="request-section">
          <div className="sheet-section-title">Questions</div>
          <FormBar forms={forms} onReply={onReplyForm} onCancel={onCancelForm} />
        </div>
      ) : null}
    </Sheet>
  )
}
