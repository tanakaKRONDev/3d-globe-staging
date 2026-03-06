import { Link } from 'react-router-dom'
import { ArrowLeft, RotateCcw, LogOut, FileText, ShieldAlert } from 'lucide-react'

export interface AdminTopBarProps {
  title?: string
  onRollbackClick: () => void
  onLogout?: () => void
  showLogsLink?: boolean
  showBlockedLink?: boolean
}

export function AdminTopBar({ title = 'Admin – Stops', onRollbackClick, onLogout, showLogsLink = true, showBlockedLink = true }: AdminTopBarProps) {
  return (
    <header className="admin-topbar">
      <div className="admin-topbar__left">
        <Link to="/" className="admin-topbar__back">
          <ArrowLeft size={20} /> Back to site
        </Link>
        <h1 className="admin-topbar__title">{title}</h1>
      </div>
      <div className="admin-topbar__actions">
        {showLogsLink && (
          <Link to="/admin/logs" className="admin-topbar__btn admin-topbar__btn--secondary">
            <FileText size={18} /> Logs
          </Link>
        )}
        {showBlockedLink && (
          <Link to="/admin/blocked" className="admin-topbar__btn admin-topbar__btn--secondary">
            <ShieldAlert size={18} /> Blocked
          </Link>
        )}
        <button
          type="button"
          className="admin-topbar__btn admin-topbar__btn--primary"
          onClick={onRollbackClick}
        >
          <RotateCcw size={18} /> Rollback
        </button>
        {onLogout != null && (
          <button
            type="button"
            className="admin-topbar__btn admin-topbar__btn--secondary"
            onClick={onLogout}
          >
            <LogOut size={18} /> Logout
          </button>
        )}
      </div>
    </header>
  )
}
