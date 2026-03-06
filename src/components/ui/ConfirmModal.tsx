import { Modal } from './Modal'

export interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
  error?: string | null
  loading?: boolean
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
  error,
  loading = false,
}: ConfirmModalProps) {
  const confirmClass =
    confirmVariant === 'danger'
      ? 'admin-page__btn admin-page__btn--danger'
      : 'admin-page__btn admin-page__btn--primary'

  return (
    <Modal
      open={open}
      title={title}
      onClose={loading ? undefined : onCancel}
      width="md"
      footer={
        <>
          <button
            type="button"
            className="admin-page__btn admin-page__btn--secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={confirmClass}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmText}
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
