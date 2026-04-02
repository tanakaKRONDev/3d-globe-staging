import { useEffect, useState, useCallback, useMemo } from 'react'
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

interface SimpleStop {
  id: string
  order: number
  city: string
  venue: string
  artist_id: string | null
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
  const [allStops, setAllStops] = useState<SimpleStop[]>([])
  const [stopSearch, setStopSearch] = useState('')

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
    try {
      const stopsRes = await adminFetch('/stops')
      if (stopsRes.ok) {
        const stopsData = await stopsRes.json() as SimpleStop[]
        setAllStops(Array.isArray(stopsData) ? stopsData : [])
      }
    } catch { /* non-fatal */ }
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

  // Stops assigned to the currently selected artist
  const assignedStops = useMemo(
    () => selected && !editingNew ? allStops.filter(s => s.artist_id === selected.id) : [],
    [allStops, selected, editingNew]
  )
  const unassignedStops = useMemo(() => {
    const q = stopSearch.toLowerCase().trim()
    const available = allStops.filter(s => !s.artist_id || (selected && s.artist_id === selected.id))
    return q ? available.filter(s => s.city.toLowerCase().includes(q) || s.venue.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) : available
  }, [allStops, selected, stopSearch])

  const toggleStopAssignment = useCallback(async (stopId: string, assign: boolean) => {
    if (!selected || editingNew) return
    try {
      const res = await adminFetch(`/stops/${encodeURIComponent(stopId)}/artist`, {
        method: 'PUT',
        body: JSON.stringify({ artist_id: assign ? selected.id : null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error || 'Failed to update')
        return
      }
      // Update local state immediately
      setAllStops(prev => prev.map(s => s.id === stopId ? { ...s, artist_id: assign ? selected.id : null } : s))
    } catch {
      setError('Failed to update stop assignment')
    }
  }, [selected, editingNew])

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

                  {/* Logo: URL input or file upload (stored as data URL) */}
                  <div className="admin-page__label span2">
                    Logo
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        type="url"
                        value={selected.logo_url && !selected.logo_url.startsWith('data:') ? selected.logo_url : ''}
                        onChange={(e) => updateField('logo_url', e.target.value || null)}
                        className="admin-page__input"
                        placeholder="https://... or upload below"
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <input
                          id="logo-file-input"
                          type="file"
                          accept="image/*"
                          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            if (file.size > 512 * 1024) {
                              setError('Logo must be under 512 KB')
                              return
                            }
                            const reader = new FileReader()
                            reader.onload = () => {
                              if (typeof reader.result === 'string') {
                                updateField('logo_url', reader.result)
                              }
                            }
                            reader.readAsDataURL(file)
                          }}
                        />
                        <button
                          type="button"
                          className="admin-page__btn admin-page__btn--secondary"
                          style={{ minHeight: 36, padding: '6px 14px', fontSize: 'var(--font-size-sm)' }}
                          onClick={() => document.getElementById('logo-file-input')?.click()}
                        >
                          <Palette size={14} /> Upload image
                        </button>
                        {selected.logo_url?.startsWith('data:') && (
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Uploaded (base64)</span>
                        )}
                        {selected.logo_url && (
                          <img
                            src={selected.logo_url}
                            alt="Logo preview"
                            style={{ height: 32, maxWidth: 120, objectFit: 'contain', borderRadius: 4, background: 'rgba(255,255,255,0.05)' }}
                          />
                        )}
                        {selected.logo_url && (
                          <button
                            type="button"
                            className="admin-page__inline-btn"
                            onClick={() => updateField('logo_url', null)}
                            style={{ fontSize: 'var(--font-size-xs)' }}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

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

                {/* Stop assignment section (only for existing artists) */}
                {!editingNew && selected.id && (
                  <div style={{ marginTop: 'var(--space-6)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)' }}>
                    <h3 className="admin-page__subtitle">Assigned Stops ({assignedStops.length})</h3>
                    {assignedStops.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 'var(--space-4)' }}>
                        {assignedStops.map(s => (
                          <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(var(--accent-rgb), 0.06)', borderRadius: 6, fontSize: 'var(--font-size-sm)' }}>
                            <span style={{ color: 'var(--text)' }}>#{s.order} {s.city} — {s.venue}</span>
                            <button type="button" onClick={() => toggleStopAssignment(s.id, false)} className="admin-page__inline-btn" style={{ flexShrink: 0 }}>Remove</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="admin-page__muted">No stops assigned to this artist.</p>
                    )}
                    <h4 style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: '0 0 var(--space-2) 0' }}>Add stops</h4>
                    <input
                      type="search"
                      placeholder="Search stops by city, venue, id..."
                      value={stopSearch}
                      onChange={(e) => setStopSearch(e.target.value)}
                      className="admin-page__input"
                      style={{ width: '100%', marginBottom: 'var(--space-2)' }}
                    />
                    <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {unassignedStops.filter(s => s.artist_id !== selected.id).slice(0, 30).map(s => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', fontSize: 'var(--font-size-sm)' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>#{s.order} {s.city} — {s.venue}</span>
                          <button type="button" onClick={() => toggleStopAssignment(s.id, true)} className="admin-page__inline-btn" style={{ flexShrink: 0 }}>Assign</button>
                        </div>
                      ))}
                      {unassignedStops.filter(s => s.artist_id !== selected.id).length === 0 && (
                        <p className="admin-page__muted" style={{ margin: 0 }}>{stopSearch ? 'No matches.' : 'All stops are assigned.'}</p>
                      )}
                    </div>
                  </div>
                )}
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
