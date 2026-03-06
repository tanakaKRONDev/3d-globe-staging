import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldOff } from 'lucide-react'
import { useBodyClass } from '../lib/ui/useBodyClass'
import { AdminShell } from '../components/layout/AdminShell'
import { UnblockIpModal } from '../components/admin/UnblockIpModal'
import './AdminPage.css'

const API = '/api/admin'

export interface BlockedIpRow {
  ip: string
  scope: 'admin' | 'all'
  created_at: number
  updated_at: number
  note: string | null
}

async function fetchBlocks(): Promise<BlockedIpRow[]> {
  const res = await fetch(`${API}/blocks`, { credentials: 'include' })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error('Failed to fetch blocks')
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

function formatUpdated(ms: number): string {
  try {
    const d = new Date(ms)
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(ms)
  } catch {
    return String(ms)
  }
}

export function AdminBlockedPage() {
  useBodyClass('mode-admin')
  const [blocks, setBlocks] = useState<BlockedIpRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unblockModal, setUnblockModal] = useState<{ ip: string; scope: 'all' } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchBlocks()
      setBlocks(data)
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
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleUnblockConfirm = useCallback(
    async (ip: string, action: 'delete' | 'downgrade') => {
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

  const handleUnblockClick = useCallback(
    (row: BlockedIpRow) => {
      if (row.scope === 'admin') {
        if (confirm('Unblock Admin Access?')) {
          handleUnblockConfirm(row.ip, 'delete')
        }
      } else {
        setUnblockModal({ ip: row.ip, scope: 'all' })
      }
    },
    [handleUnblockConfirm]
  )

  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-topbar">
          <div className="admin-topbar__left">
            <Link to="/admin" className="admin-topbar__back">
              <ArrowLeft size={20} /> Back to Admin
            </Link>
            <h1 className="admin-topbar__title">Blocked IPs</h1>
          </div>
        </header>

        <section className="admin-page__card admin-page__table-section">
          {error && error !== 'unauthorized' && (
            <p className="admin-page__error" role="alert">
              {error}
            </p>
          )}
          <div className="admin-page__table-wrap">
            {loading && blocks.length === 0 ? (
              <p className="admin-page__muted">Loading…</p>
            ) : blocks.length === 0 ? (
              <p className="admin-page__muted">No blocked IPs.</p>
            ) : (
              <table className="admin-page__table">
                <thead>
                  <tr>
                    <th>IP</th>
                    <th>Scope</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((row) => (
                    <tr key={row.ip}>
                      <td>{row.ip}</td>
                      <td>{row.scope}</td>
                      <td>{formatUpdated(row.updated_at)}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-page__btn admin-page__btn--secondary admin-page__btn--sm"
                          onClick={() => handleUnblockClick(row)}
                          disabled={actionLoading}
                        >
                          <ShieldOff size={14} /> Unblock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <UnblockIpModal
          isOpen={unblockModal != null}
          ip={unblockModal?.ip ?? ''}
          onDowngrade={() => unblockModal && handleUnblockConfirm(unblockModal.ip, 'downgrade')}
          onFullUnblock={() => unblockModal && handleUnblockConfirm(unblockModal.ip, 'delete')}
          onClose={() => !actionLoading && setUnblockModal(null)}
          loading={actionLoading}
        />
      </div>
    </AdminShell>
  )
}
