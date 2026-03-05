import { useState } from 'react'
import { AuthShell } from '../auth/AuthShell'
import { AuthCard } from '../auth/AuthCard'

const API = '/api/admin'

async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers)
  if (options.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  })
}

interface AdminLoginProps {
  onSuccess: () => void
}

export function AdminLogin({ onSuccess }: AdminLoginProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoggingIn(true)
    try {
      const res = await adminFetch('/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      if (res.status === 401) {
        setError('Invalid password')
        return
      }
      if (!res.ok) {
        setError('Login failed')
        return
      }
      setPassword('')
      onSuccess()
    } finally {
      setLoggingIn(false)
    }
  }

  return (
    <AuthShell>
      <AuthCard title="Admin" subtitle="Sign in to manage stops" error={error || undefined}>
        <form onSubmit={handleSubmit} className="auth-card__form">
          <label className="auth-label">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input"
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <button type="submit" className="auth-btn" disabled={loggingIn}>
            {loggingIn ? 'Signing in…' : 'Sign in'}
          </button>
          {loggingIn && (
            <p className="admin-page__muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
              Loading stops…
            </p>
          )}
        </form>
      </AuthCard>
    </AuthShell>
  )
}
