import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download, ShieldOff, Shield } from 'lucide-react'
import { useBodyClass } from '../lib/ui/useBodyClass'
import { AdminShell } from '../components/layout/AdminShell'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { ChoiceModal } from '../components/ui/ChoiceModal'
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
  if (from) {
    const fromMs = new Date(from).getTime()
    if (Number.isFinite(fromMs)) params.set('fromMs', String(fromMs))
    else params.set('from', from)
  }
  if (to) {
    const toMs = new Date(to).getTime()
    if (Number.isFinite(toMs)) params.set('toMs', String(toMs))
    else params.set('to', to)
  }
  const res = await fetch(`${API}/logs?${params.toString()}`, { credentials: 'include' })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error('Failed to fetch logs')
  const data = await res.json()
  if (data != null && Array.isArray(data.logs)) return data.logs
  if (Array.isArray(data)) return data
  return []
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
  const [blockChoiceIp, setBlockChoiceIp] = useState<string | null>(null)
  const [unblockConfirmIp, setUnblockConfirmIp] = useState<string | null>(null)
  const [unblockChoiceIp, setUnblockChoiceIp] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
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
      setModalError(null)
      setActionLoading(true)
      try {
        const res = await adminFetch('/blocks', {
          method: 'POST',
          body: JSON.stringify({ ip, scope }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setModalError((data as { error?: string }).error || 'Failed to block')
          return
        }
        setBlockChoiceIp(null)
        setError(null)
        await load()
      } catch {
        setModalError('Failed to block')
      } finally {
        setActionLoading(false)
      }
    },
    [load]
  )

  const handleUnblockConfirm = useCallback(
    async (ip: string, _scope: 'admin' | 'all', action: 'delete' | 'downgrade') => {
      setModalError(null)
      setActionLoading(true)
      try {
        if (action === 'delete') {
          const res = await adminFetch(`/blocks/${encodeURIComponent(ip)}`, { method: 'DELETE' })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setModalError((data as { error?: string }).error || 'Failed to unblock')
            return
          }
        } else {
          const res = await adminFetch(`/blocks/${encodeURIComponent(ip)}`, {
            method: 'PUT',
            body: JSON.stringify({ scope: 'admin' }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setModalError((data as { error?: string }).error || 'Failed to update block')
            return
          }
        }
        setUnblockConfirmIp(null)
        setUnblockChoiceIp(null)
        setError(null)
        await load()
      } catch {
        setModalError('Failed to unblock')
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
                                setModalError(null)
                                if (row.block_scope === 'admin') {
                                  setUnblockConfirmIp(row.ip)
                                } else {
                                  setUnblockChoiceIp(row.ip)
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
                              onClick={() => {
                                setModalError(null)
                                setBlockChoiceIp(row.ip)
                              }}
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

        <ChoiceModal
          open={blockChoiceIp != null}
          title="Block IP"
          message={
            blockChoiceIp == null
              ? ''
              : currentUserIp != null && blockChoiceIp === currentUserIp
                ? `Choose block type for ${blockChoiceIp}. You cannot block your current IP.`
                : `Choose block type for ${blockChoiceIp}:`
          }
          choices={[
            {
              label: 'Block Admin Access',
              variant: 'neutral',
              onClick: () => blockChoiceIp && handleBlock(blockChoiceIp, 'admin'),
              disabled: currentUserIp != null && blockChoiceIp === currentUserIp,
            },
            {
              label: 'Block All Access',
              variant: 'danger',
              onClick: () => blockChoiceIp && handleBlock(blockChoiceIp, 'all'),
              disabled: currentUserIp != null && blockChoiceIp === currentUserIp,
            },
          ]}
          cancelText="Cancel"
          onCancel={() => {
            if (!actionLoading) {
              setBlockChoiceIp(null)
              setModalError(null)
            }
          }}
          error={modalError}
          loading={actionLoading}
        />

        <ConfirmModal
          open={unblockConfirmIp != null}
          title="Unblock Admin Access"
          message={unblockConfirmIp ? `Unblock admin access for ${unblockConfirmIp}?` : ''}
          confirmText="Unblock"
          cancelText="Cancel"
          confirmVariant="primary"
          onConfirm={() =>
            unblockConfirmIp && handleUnblockConfirm(unblockConfirmIp, 'admin', 'delete')
          }
          onCancel={() => {
            if (!actionLoading) {
              setUnblockConfirmIp(null)
              setModalError(null)
            }
          }}
          error={modalError}
          loading={actionLoading}
        />

        <ChoiceModal
          open={unblockChoiceIp != null}
          title="Unblock Access"
          message={unblockChoiceIp ? `Choose how to unblock ${unblockChoiceIp}:` : ''}
          choices={[
            {
              label: 'Unblock Admin Access',
              variant: 'primary',
              onClick: () =>
                unblockChoiceIp && handleUnblockConfirm(unblockChoiceIp, 'all', 'downgrade'),
            },
            {
              label: 'Unblock All Access',
              variant: 'neutral',
              onClick: () =>
                unblockChoiceIp && handleUnblockConfirm(unblockChoiceIp, 'all', 'delete'),
            },
          ]}
          cancelText="Cancel"
          onCancel={() => {
            if (!actionLoading) {
              setUnblockChoiceIp(null)
              setModalError(null)
            }
          }}
          error={modalError}
          loading={actionLoading}
        />
      </div>
    </AdminShell>
  )
}
