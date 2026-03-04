import type { ReactNode } from 'react'

interface AdminShellProps {
  children: ReactNode
}

/**
 * Full viewport shell for admin pages: dark background, centered max-width container,
 * consistent padding. Use so admin layout is independent of globe UI.
 */
export function AdminShell({ children }: AdminShellProps) {
  return (
    <div className="admin-shell">
      <div className="admin-shell__inner">{children}</div>
    </div>
  )
}
