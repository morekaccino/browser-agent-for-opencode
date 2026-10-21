import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger'
type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: string
  iconRight?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'filled', size = 'md', icon, iconRight, className = '', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`ui-button ui-button-${variant} ui-button-${size} ${className}`.trim()}
      {...props}
    >
      {icon ? <span className="msym sm" aria-hidden="true">{icon}</span> : null}
      {children ? <span className="ui-button-label">{children}</span> : null}
      {iconRight ? <span className="msym sm" aria-hidden="true">{iconRight}</span> : null}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string
  label: string
  variant?: 'standard' | 'filled' | 'tonal' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  selected?: boolean
  filledIcon?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'standard', size = 'md', selected, filledIcon, className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`ui-icon-button ui-icon-button-${variant} ui-icon-button-${size}${selected ? ' is-selected' : ''} ${className}`.trim()}
      aria-label={label}
      title={label}
      aria-pressed={selected}
      {...props}
    >
      <span className={`msym${filledIcon || selected ? ' filled' : ''}`} aria-hidden="true">
        {icon}
      </span>
    </button>
  )
})

/* -------------------------------------------------------------------------- */
/* Chip                                                                       */
/* -------------------------------------------------------------------------- */

export interface ChipProps {
  icon?: string
  label: ReactNode
  onClick?: () => void
  selected?: boolean
  variant?: 'assist' | 'filter' | 'input'
  trailingIcon?: string
  onTrailingClick?: () => void
  title?: string
  className?: string
}

export function Chip({
  icon,
  label,
  onClick,
  selected,
  variant = 'assist',
  trailingIcon,
  onTrailingClick,
  title,
  className = '',
}: ChipProps) {
  const content = (
    <>
      {icon ? <span className={`msym sm${selected ? ' filled' : ''}`} aria-hidden="true">{icon}</span> : null}
      <span className="ui-chip-label">{label}</span>
      {trailingIcon ? (
        onTrailingClick ? (
          <span
            className="ui-chip-trailing"
            role="button"
            tabIndex={0}
            aria-label="Remove"
            onClick={(event) => {
              event.stopPropagation()
              onTrailingClick()
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              event.stopPropagation()
              onTrailingClick()
            }}
          >
            <span className="msym sm" aria-hidden="true">{trailingIcon}</span>
          </span>
        ) : (
          <span className="msym sm ui-chip-trailing" aria-hidden="true">{trailingIcon}</span>
        )
      ) : null}
    </>
  )

  if (!onClick) {
    return (
      <span className={`ui-chip ui-chip-${variant}${selected ? ' is-selected' : ''} ${className}`.trim()} title={title}>
        {content}
      </span>
    )
  }

  return (
    <button
      type="button"
      className={`ui-chip ui-chip-${variant}${selected ? ' is-selected' : ''} ${className}`.trim()}
      onClick={onClick}
      aria-pressed={selected}
      title={title}
    >
      {content}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* List item                                                                  */
/* -------------------------------------------------------------------------- */

export function ListItem({
  leading,
  headline,
  supporting,
  trailing,
  onClick,
  selected,
  className = '',
  title,
}: {
  leading?: ReactNode
  headline: ReactNode
  supporting?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  selected?: boolean
  className?: string
  title?: string
}) {
  const content = (
    <>
      {leading ? <span className="ui-list-leading">{leading}</span> : null}
      <span className="ui-list-text">
        <span className="ui-list-headline">{headline}</span>
        {supporting ? <span className="ui-list-supporting">{supporting}</span> : null}
      </span>
      {trailing ? <span className="ui-list-trailing">{trailing}</span> : null}
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        className={`ui-list-item${selected ? ' is-selected' : ''} ${className}`.trim()}
        onClick={onClick}
        title={title}
      >
        {content}
      </button>
    )
  }
  return <div className={`ui-list-item ${className}`.trim()}>{content}</div>
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                      */
/* -------------------------------------------------------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  icon,
  className = '',
}: {
  children: ReactNode
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'error'
  icon?: string
  className?: string
}) {
  return (
    <span className={`ui-badge ui-badge-${tone} ${className}`.trim()}>
      {icon ? <span className="msym sm" aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Switch                                                                     */
/* -------------------------------------------------------------------------- */

export function Switch({
  checked,
  onCheckedChange,
  label,
  supporting,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: ReactNode
  supporting?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={`ui-switch-row${disabled ? ' is-disabled' : ''}`}>
      <span className="ui-switch-text">
        <span className="ui-switch-label">{label}</span>
        {supporting ? <span className="ui-switch-supporting">{supporting}</span> : null}
      </span>
      <SwitchPrimitive.Root
        className="ui-switch"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      >
        <SwitchPrimitive.Thumb className="ui-switch-thumb" />
      </SwitchPrimitive.Root>
    </label>
  )
}

export function MiniSwitch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <SwitchPrimitive.Root
      className="ui-switch ui-switch-mini"
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <SwitchPrimitive.Thumb className="ui-switch-thumb" />
    </SwitchPrimitive.Root>
  )
}

/* -------------------------------------------------------------------------- */
/* Segmented control                                                          */
/* -------------------------------------------------------------------------- */

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className = '',
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; icon?: string }>
  label?: string
  className?: string
}) {
  return (
    <div className={`ui-segmented ${className}`.trim()} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`ui-segment${option.value === value ? ' is-selected' : ''}`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.icon ? <span className="msym sm" aria-hidden="true">{option.icon}</span> : null}
          {option.label}
        </button>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                     */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  children: ReactNode
}) {
  return (
    <label className="ui-field">
      {label ? <span className="ui-field-label">{label}</span> : null}
      {children}
      {error ? <span className="ui-field-error">{error}</span> : hint ? <span className="ui-field-hint">{hint}</span> : null}
    </label>
  )
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className = '', ...props },
  ref,
) {
  return <input ref={ref} className={`ui-input ${className}`.trim()} {...props} />
})

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className = '', ...props },
  ref,
) {
  return <textarea ref={ref} className={`ui-input ui-textarea ${className}`.trim()} {...props} />
})

export function SelectField({
  label,
  hint,
  children,
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode }) {
  return (
    <Field label={label} hint={hint}>
      <select className={`ui-input ui-select ${className}`.trim()} {...props}>
        {children}
      </select>
    </Field>
  )
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
  label = 'Search',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
}) {
  return (
    <div className="ui-search">
      <span className="msym sm" aria-hidden="true">search</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
      {value ? (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')}>
          <span className="msym sm" aria-hidden="true">close</span>
        </button>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sheet / dialog                                                             */
/* -------------------------------------------------------------------------- */

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = 'bottom',
  children,
  footer,
  className = '',
  bodyClassName = '',
  hideHeader = false,
  dismissible = true,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  side?: 'bottom' | 'right' | 'left' | 'center'
  children: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
  hideHeader?: boolean
  dismissible?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-scrim" />
        <Dialog.Content
          className={`ui-sheet ui-sheet-${side} ${className}`.trim()}
          aria-describedby={description ? undefined : undefined}
          onEscapeKeyDown={(event) => {
            if (!dismissible) event.preventDefault()
          }}
          onPointerDownOutside={(event) => {
            if (!dismissible) event.preventDefault()
          }}
        >
          {hideHeader ? (
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
          ) : (
            <div className="ui-sheet-head">
              <div className="ui-sheet-heading">
                <Dialog.Title className="ui-sheet-title">{title}</Dialog.Title>
                {description ? <Dialog.Description className="ui-sheet-description">{description}</Dialog.Description> : null}
              </div>
              <Dialog.Close asChild>
                <button type="button" className="ui-icon-button ui-icon-button-standard ui-icon-button-sm" aria-label="Close">
                  <span className="msym" aria-hidden="true">close</span>
                </button>
              </Dialog.Close>
            </div>
          )}
          <div className={`ui-sheet-body ${bodyClassName}`.trim()}>{children}</div>
          {footer ? <div className="ui-sheet-footer">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* -------------------------------------------------------------------------- */
/* Menu                                                                       */
/* -------------------------------------------------------------------------- */

export interface MenuItem {
  label: string
  icon?: string
  onSelect?: () => void
  disabled?: boolean
  destructive?: boolean
  checked?: boolean
  separator?: boolean
}

export function Menu({
  trigger,
  items,
  align = 'end',
  label = 'Menu',
}: {
  trigger: ReactNode
  items: MenuItem[]
  align?: 'start' | 'center' | 'end'
  label?: string
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="ui-menu" align={align} sideOffset={6} aria-label={label}>
          {items.map((item, index) =>
            item.separator ? (
              <DropdownMenu.Separator key={`sep-${index}`} className="ui-menu-separator" />
            ) : (
              <DropdownMenu.Item
                key={`${item.label}-${index}`}
                className={`ui-menu-item${item.destructive ? ' is-destructive' : ''}`}
                disabled={item.disabled}
                onSelect={() => item.onSelect?.()}
              >
                {item.icon ? <span className="msym sm" aria-hidden="true">{item.icon}</span> : null}
                <span className="ui-menu-label">{item.label}</span>
                {item.checked ? <span className="msym sm" aria-hidden="true">check</span> : null}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                    */
/* -------------------------------------------------------------------------- */

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className="ui-tooltip" sideOffset={6}>
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export const TooltipProvider = TooltipPrimitive.Provider

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

export function Progress({ value }: { value?: number }) {
  return (
    <div className="ui-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <span
        className={`ui-progress-bar${value == null ? ' is-indeterminate' : ''}`}
        style={value == null ? undefined : { width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="ui-spinner" role="status" aria-label={label} />
}

export function Snackbar({
  message,
  action,
  onAction,
  onClose,
}: {
  message: ReactNode
  action?: string
  onAction?: () => void
  onClose?: () => void
}) {
  return (
    <div className="ui-snackbar" role="status">
      <span className="ui-snackbar-message">{message}</span>
      {action ? (
        <button type="button" className="ui-snackbar-action" onClick={onAction}>
          {action}
        </button>
      ) : null}
      {onClose ? (
        <button type="button" className="ui-snackbar-close" aria-label="Dismiss" onClick={onClose}>
          <span className="msym sm" aria-hidden="true">close</span>
        </button>
      ) : null}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
}: {
  icon: string
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  secondaryAction?: ReactNode
}) {
  return (
    <div className="ui-empty">
      <span className="ui-empty-icon">
        <span className="msym lg" aria-hidden="true">{icon}</span>
      </span>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action || secondaryAction ? (
        <div className="ui-empty-actions">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  )
}
