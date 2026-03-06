import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download, ShieldOff, Shield } from 'lucide-react'
import { useBodyClass } from '../lib/ui/useBodyClass'
import { AdminShell } from '../components/layout/AdminShell'
import { UnblockIpModal } from '../components/admin/UnblockIpModal'
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
  block_scope?: 'admin' | 'all' | null
}

function toDateTimeLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

function defaultFrom(): string {
  const d = new Date()
  d.setTime(d.getTime() - 24 * 60 * 60 * 1000)
  return toDateTimeLocal(d)
}

function defaultTo(): string {
  return toDateTimeLocal(new Date())
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

async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers)
  if (options.body != null && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`${API}${path}`, { ...options, credentials: 'include', headers })
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
  const [from, setFrom] = useState(() => defaultFrom())
  const [to, setTo] = useState(() => defaultTo())
  const [blockModalIp, setBlockModalIp] = useState<string | null>(null)
  const [unblockModal, setUnblockModal] = useState<{ ip: string; scope: 'admin' | 'all' } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [currentUserIp, setCurrentUserIp] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API}/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && typeof data.ip === 'string' && setCurrentUserIp(data.ip))
      .catch(() => {})
  }, [])

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

  const handleBlock = useCallback(
    async (ip: string, scope: 'admin' | 'all') => {
      setActionLoading(true)
      try {
        const res = await adminFetch('/blocks', {
          method: 'POST',
          body: JSON.stringify({ ip, scope }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError((data as { error?: string }).error || 'Failed to block')
          return
        }
        setBlockModalIp(null)
        setError(null)
        await load()
      } catch {
        setError('Failed to block')
      } finally {
        setActionLoading(false)
      }
    },
    [load]
  )

  const handleUnblockConfirm = useCallback(
    async (ip: string, scope: 'admin' | 'all', action: 'delete' | 'downgrade') => {
      setActionLoading(true)
      try {
        if (action === 'delete') {
          const res = await adminFetch(`/blocks/${encodeURIComponent(ip)}`, { method: 'DELETE' })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setError((data as { error?: string }).error || 'Failed to unblock')
            return
          }
        } else {
          const res = await adminFetch(`/blocks/${encodeURIComponent(ip)}`, {
            method: 'PUT',
            body: JSON.stringify({ scope: 'admin' }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setError((data as { error?: string }).error || 'Failed to update block')
            return
          }
        }
        setUnblockModal(null)
        setError(null)
        await load()
      } catch {
        setError('Failed to unblock')
      } finally {
        setActionLoading(false)
      }
    },
    [load]
  )
  const handleExportCsv = useCallback(() => {
    const headers = ['timestamp', 'ip', 'country', 'region', 'city', 'userAgent', 'path', 'block_scope']
    const rows = logs.map((r) =>
      headers.map((h) => escapeCsvCell(String((r as Record<string, unknown>)[h] ?? ''))).join(',')
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
                    <th className="admin-logs__action-col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row, i) => {
                    const blocked = row.block_scope === 'admin' || row.block_scope === 'all'
                    return (
                      <tr
                        key={`${row.timestamp}-${row.ip}-${i}`}
                        className={blocked ? 'admin-logs__row--blocked' : ''}
                      >
                        <td>{row.timestamp}</td>
                        <td>{row.ip}</td>
                        <td>{row.country}</td>
                        <td>{row.region}</td>
                        <td>{row.city}</td>
                        <td className="admin-page__cell-address" title={row.userAgent}>
                          {row.userAgent}
                        </td>
                        <td className="admin-page__cell-address">{row.path}</td>
                        <td className="admin-logs__action-col">
                          {blocked ? (
                            <button
                              type="button"
                              className="admin-page__btn admin-page__btn--secondary admin-page__btn--sm"
                              onClick={() => {
                                if (row.block_scope === 'admin') {
                                  if (confirm('Unblock Admin Access?')) {
                                    handleUnblockConfirm(row.ip, 'admin', 'delete')
                                  }
                                } else {
                                  setUnblockModal({ ip: row.ip, scope: 'all' })
                                }
                              }}
                              disabled={actionLoading}
                            >
                              <ShieldOff size={14} /> Unblock
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="admin-page__btn admin-page__btn--secondary admin-page__btn--sm"
                              onClick={() => setBlockModalIp(row.ip)}
                              disabled={actionLoading}
                            >
                              <Shield size={14} /> Block
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Block IP modal */}
        {blockModalIp != null && (
          <div className="admin-logs__modal-backdrop" onClick={() => !actionLoading && setBlockModalIp(null)}>
            <div
              className="admin-logs__modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-labelledby="block-modal-title"
            >
              <h2 id="block-modal-title" className="admin-page__subtitle">
                Block IP
              </h2>
              <p className="admin-page__muted">{blockModalIp}</p>
              {currentUserIp != null && blockModalIp === currentUserIp && (
                <p className="admin-page__error admin-logs__modal-warning" role="alert">
                  You cannot block your current IP.
                </p>
              )}
              <div className="admin-logs__modal-actions">
                <button
                  type="button"
                  className="admin-page__btn admin-page__btn--secondary"
                  onClick={() => handleBlock(blockModalIp, 'admin')}
                  disabled={actionLoading || (currentUserIp != null && blockModalIp === currentUserIp)}
                >
                  Block Admin Access
                </button>
                <button
                  type="button"
                  className="admin-page__btn admin-page__btn--danger"
                  onClick={() => handleBlock(blockModalIp, 'all')}
                  disabled={actionLoading || (currentUserIp != null && blockModalIp === currentUserIp)}
                >
                  Block All Access
                </button>
                <button
                  type="button"
                  className="admin-page__btn admin-page__btn--secondary"
                  onClick={() => !actionLoading && setBlockModalIp(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <UnblockIpModal
          isOpen={unblockModal != null && unblockModal.scope === 'all'}
          ip={unblockModal?.ip ?? ''}
          onDowngrade={() => unblockModal && handleUnblockConfirm(unblockModal.ip, 'all', 'downgrade')}
          onFullUnblock={() => unblockModal && handleUnblockConfirm(unblockModal.ip, 'all', 'delete')}
          onClose={() => !actionLoading && setUnblockModal(null)}
          loading={actionLoading}
        />
      </div>
    </AdminShell>
  )
}
