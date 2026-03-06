import { Modal } from './Modal'

export interface ChoiceOption {
  label: string
  variant?: 'primary' | 'danger' | 'neutral'
  onClick: () => void
  disabled?: boolean
}

export interface ChoiceModalProps {
  open: boolean
  title: string
  message: string
  choices: ChoiceOption[]
  cancelText?: string
  onCancel: () => void
  error?: string | null
  loading?: boolean
}

function buttonClass(variant: ChoiceOption['variant'] = 'neutral'): string {
  const base = 'admin-page__btn'
  if (variant === 'primary') return `${base} admin-page__btn--primary`
  if (variant === 'danger') return `${base} admin-page__btn--danger`
  return `${base} admin-page__btn--secondary`
}

export function ChoiceModal({
  open,
  title,
  message,
  choices,
  cancelText = 'Cancel',
  onCancel,
  error,
  loading = false,
}: ChoiceModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={loading ? undefined : onCancel}
      width="md"
      footer={
        <>
          {choices.map((choice, i) => (
            <button
              key={i}
              type="button"
              className={buttonClass(choice.variant)}
              onClick={choice.onClick}
              disabled={loading || choice.disabled}
            >
              {choice.label}
            </button>
          ))}
          <button
            type="button"
            className="admin-page__btn admin-page__btn--secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText}
          </button>
        </>
      }
    >
      <>
        {message}
        {error && (
          <p className="ui-modal-error" role="alert">
            {error}
          </p>
        )}
      </>
    </Modal>
  )
}
