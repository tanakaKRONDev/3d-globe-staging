import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download } from 'lucide-react'
import { useBodyClass } from '../lib/ui/useBodyClass'
import { AdminShell } from '../components/layout/AdminShell'
import './AdminPage.css'

const API = '/api/admin'

export interface AccessLogRow {
  timestamp: string
  ip: string
  country: string
  region: string
  city: string
  userAgent: string
  path: string
}

async function fetchLogs(from: string, to: string): Promise<AccessLogRow[]> {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const res = await fetch(`${API}/logs?${params.toString()}`, { credentials: 'include' })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error('Failed to fetch logs')
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

function escapeCsvCell(s: string): string {
  const str = String(s ?? '')
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export function AdminLogsPage() {
  useBodyClass('mode-admin')
  const [logs, setLogs] = useState<AccessLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchLogs(from, to)
      setLogs(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load'
      setError(msg)
      if (msg === 'unauthorized') {
        window.location.href = '/admin'
        return
      }
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    load()
  }, [load])

  const handleExportCsv = useCallback(() => {
    const headers = ['timestamp', 'ip', 'country', 'region', 'city', 'userAgent', 'path']
    const rows = logs.map((r) =>
      headers.map((h) => escapeCsvCell((r as Record<string, string>)[h] ?? '')).join(',')
    )
    const csv = [headers.join(','), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `access-logs-${from || 'all'}-${to || 'all'}.csv`.replace(/[/\\?*]/g, '-')
    a.click()
    URL.revokeObjectURL(url)
  }, [logs, from, to])

  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-topbar">
          <div className="admin-topbar__left">
            <Link to="/admin" className="admin-topbar__back">
              <ArrowLeft size={20} /> Back to Admin
            </Link>
            <h1 className="admin-topbar__title">Access logs</h1>
          </div>
        </header>

        <section className="admin-page__card admin-page__table-section">
          <div className="admin-page__table-header">
            <div className="admin-logs-filters">
              <label className="admin-page__label admin-logs-filter">
                From
                <input
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="admin-page__input"
                />
              </label>
              <label className="admin-page__label admin-logs-filter">
                To
                <input
                  type="datetime-local"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="admin-page__input"
                />
              </label>
              <button type="button" onClick={load} className="admin-page__btn admin-page__btn--secondary" disabled={loading}>
                {loading ? 'Loading…' : 'Apply'}
              </button>
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              className="admin-page__btn admin-page__btn--primary"
              disabled={logs.length === 0}
            >
              <Download size={18} /> Export CSV
            </button>
          </div>
          {error && error !== 'unauthorized' && (
            <p className="admin-page__error" role="alert">
              {error}
            </p>
          )}
          <div className="admin-page__table-wrap">
            {loading && logs.length === 0 ? (
              <p className="admin-page__muted">Loading…</p>
            ) : logs.length === 0 ? (
              <p className="admin-page__muted">No logs in this range.</p>
            ) : (
              <table className="admin-page__table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>IP</th>
                    <th>Country</th>
                    <th>Region</th>
                    <th>City</th>
                    <th>User-Agent</th>
                    <th>Path</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row, i) => (
                    <tr key={`${row.timestamp}-${row.ip}-${i}`}>
                      <td>{row.timestamp}</td>
                      <td>{row.ip}</td>
                      <td>{row.country}</td>
                      <td>{row.region}</td>
                      <td>{row.city}</td>
                      <td className="admin-page__cell-address" title={row.userAgent}>
                        {row.userAgent}
                      </td>
                      <td className="admin-page__cell-address">{row.path}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </AdminShell>
  )
}
