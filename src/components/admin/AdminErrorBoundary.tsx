import React from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '../layout/AdminShell'

interface State {
  hasError: boolean
  error: Error | null
}

export class AdminErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Admin ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <AdminShell>
          <div className="admin-page">
            <div className="admin-page__card">
              <h2 className="admin-page__subtitle">Something went wrong</h2>
              <p className="admin-page__muted" style={{ marginBottom: '1rem' }}>
                {this.state.error.message}
              </p>
              <Link to="/admin" className="admin-page__btn admin-page__btn--primary" onClick={() => this.setState({ hasError: false, error: null })}>
                Try again
              </Link>
            </div>
          </div>
        </AdminShell>
      )
    }
    return this.props.children
  }
}
