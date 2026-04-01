import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Palette } from 'lucide-react'
import { useBodyClass } from '../lib/ui/useBodyClass'
import { AdminShell } from '../components/layout/AdminShell'
import { AdminLogin } from '../components/admin/AdminLogin'
import { AdminTopBar } from '../components/admin/AdminTopBar'
import './AdminPage.css'

interface AdminArtist {
  id: string
  slug: string
  name: string
  title: string
  subtitle: string | null
  accent_color: string
  accent_muted: string | null
  accent_dark: string | null
  logo_url: string | null
  site_password: string | null
  created_at: string
  updated_at: string
}

const API = '/api/admin'

async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers)
  if (options.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`${API}${path}`, { ...options, credentials: 'include', headers })
}

const EMPTY_ARTIST: AdminArtist = {
  id: '',
  slug: '',
  name: '',
  title: '',
  subtitle: null,
  accent_color: '#E7D1A7',
  accent_muted: null,
  accent_dark: null,
  logo_url: null,
  site_password: null,
  created_at: '',
  updated_at: '',
}

export function AdminArtistsPage() {
  useBodyClass('mode-admin')
  const [authState, setAuthState] = useState<'unknown' | 'required' | 'ok'>('unknown')
  const [artists, setArtists] = useState<AdminArtist[]>([])
  const [selected, setSelected] = useState<AdminArtist | null>(null)
  const [editingNew, setEditingNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchArtists = useCallback(async () => {
    try {
      const res = await adminFetch('/artists')
      if (res.status === 401) { setAuthState('required'); return }
      if (!res.ok) { setLoadError('Failed to load artists'); return }
      const data = await res.json() as AdminArtist[]
      setArtists(Array.isArray(data) ? data : [])
      setAuthState('ok')
    } catch {
      setLoadError('Failed to load artists')
    }
  }, [])

  useEffect(() => { fetchArtists() }, [fetchArtists])

  const handleLoginSuccess = useCallback(() => { fetchArtists() }, [fetchArtists])

  const startAdd = () => {
    setEditingNew(true)
    setSelected({ ...EMPTY_ARTIST })
    setError(null)
  }

  const selectArtist = (a: AdminArtist) => {
    setEditingNew(false)
    setSelected({ ...a })
    setError(null)
  }

  const clearSelection = () => {
    setSelected(null)
    setEditingNew(false)
    setError(null)
  }

  const updateField = <K extends keyof AdminArtist>(key: K, value: AdminArtist[K]) => {
    if (selected) setSelected({ ...selected, [key]: value })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setError(null)
    setSaving(true)
    try {
      if (editingNew) {
        const res = await adminFetch('/artists', {
          method: 'POST',
          body: JSON.stringify({
            slug: selected.slug,
            name: selected.name,
            title: selected.title,
            subtitle: selected.subtitle || null,
            accent_color: selected.accent_color,
            accent_muted: selected.accent_muted || null,
            accent_dark: selected.accent_dark || null,
            logo_url: selected.logo_url || null,
            site_password: selected.site_password || null,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError((data as { error?: string }).error || 'Failed to create artist')
          setSaving(false)
          return
        }
      } else {
        const res = await adminFetch(`/artists/${encodeURIComponent(selected.id)}`, {
          method: 'PUT',
          body: JSON.stringify({
            slug: selected.slug,
            name: selected.name,
            title: selected.title,
            subtitle: selected.subtitle || null,
            accent_color: selected.accent_color,
            accent_muted: selected.accent_muted || null,
            accent_dark: selected.accent_dark || null,
            logo_url: selected.logo_url || null,
            site_password: selected.site_password || null,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError((data as { error?: string }).error || 'Failed to update artist')
          setSaving(false)
          return
        }
      }
      await fetchArtists()
      if (editingNew) clearSelection()
      setSaving(false)
    } catch {
      setError('Request failed')
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected || editingNew) return
    if (!confirm(`Delete artist "${selected.name}"? Their stops will be unlinked.`)) return
    setDeleting(true)
    setError(null)
    try {
      const res = await adminFetch(`/artists/${encodeURIComponent(selected.id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error || 'Failed to delete')
        setDeleting(false)
        return
      }
      await fetchArtists()
      clearSelection()
    } catch {
      setError('Request failed')
    } finally {
      setDeleting(false)
    }
  }

  const handleLogout = useCallback(() => {
    fetch(`${API}/logout`, { method: 'POST', credentials: 'include' }).finally(() => {
      setAuthState('required')
    })
  }, [])

  if (authState === 'required') {
    return <AdminLogin onSuccess={handleLoginSuccess} />
  }

  return (
    <AdminShell>
      <div className="admin-page">
        <AdminTopBar
          title="Admin – Artists"
          onRollbackClick={() => {}}
          onLogout={handleLogout}
        />

        <div className="admin-page__content">
          {/* Artist list */}
          <section className="admin-page__card admin-page__table-section">
            <div className="admin-page__table-header">
              <span className="admin-page__muted" style={{ margin: 0 }}>
                {artists.length} artist{artists.length !== 1 ? 's' : ''}
              </span>
              <button type="button" onClick={startAdd} className="admin-page__btn admin-page__btn--primary">
                <Plus size={18} /> Add artist
              </button>
            </div>
            {loadError && <p className="admin-page__error">{loadError}</p>}
            <div className="admin-page__table-wrap">
              <table className="admin-page__table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slug</th>
                    <th>Title</th>
                    <th>Accent</th>
                  </tr>
                </thead>
                <tbody>
                  {artists.map((a) => (
                    <tr
                      key={a.id}
                      className={selected?.id === a.id ? 'admin-page__row--selected' : ''}
                      onClick={() => selectArtist(a)}
                    >
                      <td>{a.name}</td>
                      <td style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)' }}>{a.slug}</td>
                      <td>{a.title}</td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            background: a.accent_color,
                            border: '1px solid var(--border)',
                            verticalAlign: 'middle',
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                  {artists.length === 0 && !loadError && (
                    <tr><td colSpan={4} className="admin-page__muted">No artists yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Edit form */}
          <section className="admin-page__card admin-page__form-section">
            {selected ? (
              <>
                <h2 className="admin-page__subtitle">
                  {editingNew ? 'New artist' : `Edit: ${selected.name}`}
                </h2>
                <form onSubmit={handleSave} className="admin-page__form adminFormGrid">
                  <label className="admin-page__label">
                    Name
                    <input
                      type="text"
                      value={selected.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      className="admin-page__input"
                      placeholder="Artist Name"
                    />
                  </label>
                  <label className="admin-page__label">
                    Slug (subdomain)
                    <input
                      type="text"
                      value={selected.slug}
                      onChange={(e) => updateField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      className="admin-page__input"
                      placeholder="artist-name"
                      style={{ fontFamily: 'var(--font-family-mono)' }}
                    />
                  </label>
                  <label className="admin-page__label span2">
                    Hero Title
                    <input
                      type="text"
                      value={selected.title}
                      onChange={(e) => updateField('title', e.target.value)}
                      className="admin-page__input"
                      placeholder="WORLD TOUR 2027"
                    />
                  </label>
                  <label className="admin-page__label span2">
                    Hero Subtitle
                    <input
                      type="text"
                      value={selected.subtitle ?? ''}
                      onChange={(e) => updateField('subtitle', e.target.value || null)}
                      className="admin-page__input"
                      placeholder="Premium Experience"
                    />
                  </label>

                  {/* Colors */}
                  <label className="admin-page__label">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Palette size={14} /> Accent Color
                    </span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="color"
                        value={selected.accent_color}
                        onChange={(e) => updateField('accent_color', e.target.value)}
                        style={{ width: 36, height: 36, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        value={selected.accent_color}
                        onChange={(e) => updateField('accent_color', e.target.value)}
                        className="admin-page__input"
                        style={{ flex: 1, fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)' }}
                      />
                    </div>
                  </label>
                  <label className="admin-page__label">
                    Accent Muted
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="color"
                        value={selected.accent_muted || selected.accent_color}
                        onChange={(e) => updateField('accent_muted', e.target.value)}
                        style={{ width: 36, height: 36, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        value={selected.accent_muted ?? ''}
                        onChange={(e) => updateField('accent_muted', e.target.value || null)}
                        className="admin-page__input"
                        placeholder="auto"
                        style={{ flex: 1, fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)' }}
                      />
                    </div>
                  </label>
                  <label className="admin-page__label">
                    Accent Dark
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="color"
                        value={selected.accent_dark || selected.accent_color}
                        onChange={(e) => updateField('accent_dark', e.target.value)}
                        style={{ width: 36, height: 36, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        value={selected.accent_dark ?? ''}
                        onChange={(e) => updateField('accent_dark', e.target.value || null)}
                        className="admin-page__input"
                        placeholder="auto"
                        style={{ flex: 1, fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)' }}
                      />
                    </div>
                  </label>
                  <label className="admin-page__label">
                    Site Password
                    <input
                      type="text"
                      value={selected.site_password ?? ''}
                      onChange={(e) => updateField('site_password', e.target.value || null)}
                      className="admin-page__input"
                      placeholder="(uses platform password if empty)"
                    />
                  </label>

                  {/* Placeholder URL fields */}
                  <label className="admin-page__label span2">
                    Logo URL
                    <input
                      type="url"
                      value={selected.logo_url ?? ''}
                      onChange={(e) => updateField('logo_url', e.target.value || null)}
                      className="admin-page__input"
                      placeholder="https://..."
                    />
                  </label>

                  {error && <p className="admin-page__error span2">{error}</p>}
                  <div className="admin-page__form-actions span2">
                    <button type="submit" className="admin-page__btn admin-page__btn--primary" disabled={saving}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    {!editingNew && (
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="admin-page__btn admin-page__btn--danger"
                        disabled={deleting}
                      >
                        <Trash2 size={16} /> {deleting ? 'Deleting...' : 'Delete'}
                      </button>
                    )}
                    <button type="button" onClick={clearSelection} className="admin-page__btn admin-page__btn--secondary">
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <p className="admin-page__muted">Select an artist to edit, or add a new one.</p>
            )}
          </section>
        </div>
      </div>
    </AdminShell>
  )
}
