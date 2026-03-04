import type { ReactNode } from 'react'
import './AuthCard.css'

interface AuthCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  error?: string | null
}

/**
 * Glass auth card: title, subtitle, content (form), error.
 * max-width 420px, consistent typography and spacing. Same for site + admin.
 */
export function AuthCard({ title, subtitle, children, error }: AuthCardProps) {
  return (
    <div className="auth-card">
      <h1 className="auth-card__title">{title}</h1>
      {subtitle && <p className="auth-card__subtitle">{subtitle}</p>}
      <div className="auth-card__body">
        {children}
        {error && <p className="auth-card__error">{error}</p>}
      </div>
    </div>
  )
}
