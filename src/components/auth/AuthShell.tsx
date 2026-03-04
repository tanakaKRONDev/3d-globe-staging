import type { ReactNode } from 'react'
import './AuthShell.css'

interface AuthShellProps {
  children: ReactNode
}

/**
 * Fixed full-screen auth overlay: flex center, dark gradient, safe-area padding.
 * Use for both site login and admin login so layout matches exactly.
 */
export function AuthShell({ children }: AuthShellProps) {
  return <div className="auth-shell">{children}</div>
}
