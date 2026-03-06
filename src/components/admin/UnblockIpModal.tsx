/**
 * Shared modal for unblocking an IP that has scope='all'.
 * Offers: "Unblock Admin Access" (downgrade to admin) and "Unblock All Access" (full delete).
 */
export interface UnblockIpModalProps {
  isOpen: boolean
  ip: string
  onDowngrade: () => void
  onFullUnblock: () => void
  onClose: () => void
  loading: boolean
}

export function UnblockIpModal({
  isOpen,
  ip,
  onDowngrade,
  onFullUnblock,
  onClose,
  loading,
}: UnblockIpModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="admin-logs__modal-backdrop"
      onClick={() => !loading && onClose()}
    >
      <div
        className="admin-logs__modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="unblock-modal-title"
      >
        <h2 id="unblock-modal-title" className="admin-page__subtitle">
          Unblock IP
        </h2>
        <p className="admin-page__muted">{ip}</p>
        <div className="admin-logs__modal-actions">
          <button
            type="button"
            className="admin-page__btn admin-page__btn--secondary"
            onClick={onDowngrade}
            disabled={loading}
          >
            Unblock Admin Access
          </button>
          <button
            type="button"
            className="admin-page__btn admin-page__btn--primary"
            onClick={onFullUnblock}
            disabled={loading}
          >
            Unblock All Access
          </button>
          <button
            type="button"
            className="admin-page__btn admin-page__btn--secondary"
            onClick={() => !loading && onClose()}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
