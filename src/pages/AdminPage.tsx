import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, ArrowLeft } from 'lucide-react'
import { useBodyClass } from '../lib/ui/useBodyClass'
import { AdminShell } from '../components/layout/AdminShell'
import './AdminPage.css'

/** Stop shape returned by GET /api/admin/stops and used in POST/PUT */
export interface AdminStop {
  id: string
  order: number
  city: string
  country: string
  venue: string
  address: string
  lat: number
  lng: number
  timeline?: string | null
  notes?: string | null
}

const API = '/api/admin'
const cred = (): RequestInit => ({ credentials: 'include' as RequestCredentials })

async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, { ...cred(), ...options })
  return res
}

export function AdminPage() {
  useBodyClass('mode-admin')
  const [authChecked, setAuthChecked] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [stops, setStops] = useState<AdminStop[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStop, setSelectedStop] = useState<AdminStop | null>(null)
  const [editingNew, setEditingNew] = useState(false)
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchStops = useCallback(async () => {
    setLoadError(null)
    const res = await adminFetch('/stops')
    if (res.status === 401) {
      setAuthenticated(false)
      setStops([])
      setAuthChecked(true)
      return
    }
    if (!res.ok) {
      setLoadError('Failed to load stops')
      setAuthChecked(true)
      return
    }
    const data = (await res.json()) as AdminStop[]
    setStops(Array.isArray(data) ? data : [])
    setAuthenticated(true)
    setAuthChecked(true)
  }, [])

  useEffect(() => {
    fetchStops()
  }, [fetchStops])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      ...cred(),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: loginPassword }),
    })
    if (res.status === 401) {
      setLoginError('Invalid password')
      return
    }
    if (!res.ok) {
      setLoginError('Login failed')
      return
    }
    setLoginPassword('')
    await fetchStops()
  }

  const filteredStops = searchQuery.trim()
    ? stops.filter(
        (s) =>
          s.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.venue.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : stops

  const startAdd = () => {
    setEditingNew(true)
    setSelectedStop({
      id: '',
      order: stops.length > 0 ? Math.max(...stops.map((s) => s.order), 0) + 1 : 1,
      city: '',
      country: '',
      venue: '',
      address: '',
      lat: 0,
      lng: 0,
      timeline: '',
      notes: '',
    })
    setSaveError(null)
  }

  const selectStop = (stop: AdminStop) => {
    setEditingNew(false)
    setSelectedStop({ ...stop })
    setSaveError(null)
  }

  const clearSelection = () => {
    setSelectedStop(null)
    setEditingNew(false)
    setSaveError(null)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStop) return
    setSaveError(null)
    setSaving(true)
    try {
      const body = {
        order: selectedStop.order,
        city: selectedStop.city,
        country: selectedStop.country,
        venue: selectedStop.venue,
        address: selectedStop.address,
        lat: selectedStop.lat,
        lng: selectedStop.lng,
        timeline: selectedStop.timeline ?? '',
        notes: selectedStop.notes ?? '',
      }
      if (editingNew) {
        if (!selectedStop.id.trim()) {
          setSaveError('ID is required for new stop')
          setSaving(false)
          return
        }
        const res = await adminFetch('/stops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedStop.id.trim(), ...body }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setSaveError((data as { error?: string }).error || 'Failed to create stop')
          setSaving(false)
          return
        }
      } else {
        const res = await adminFetch(`/stops/${encodeURIComponent(selectedStop.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setSaveError((data as { error?: string }).error || 'Failed to update stop')
          setSaving(false)
          return
        }
      }
      await fetchStops()
      if (editingNew) clearSelection()
      setSaving(false)
    } catch {
      setSaveError('Request failed')
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedStop || editingNew) return
    if (!confirm(`Delete stop "${selectedStop.city} – ${selectedStop.venue}"?`)) return
    setDeleting(true)
    setSaveError(null)
    try {
      const res = await adminFetch(`/stops/${encodeURIComponent(selectedStop.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSaveError((data as { error?: string }).error || 'Failed to delete stop')
        setDeleting(false)
        return
      }
      await fetchStops()
      clearSelection()
      setDeleting(false)
    } catch {
      setSaveError('Request failed')
      setDeleting(false)
    }
  }

  const updateField = <K extends keyof AdminStop>(key: K, value: AdminStop[K]) => {
    if (selectedStop) setSelectedStop({ ...selectedStop, [key]: value })
  }

  if (!authChecked) {
    return (
      <AdminShell>
        <div className="admin-page">
          <div className="admin-page__card">
            <p className="admin-page__muted">Checking session…</p>
          </div>
        </div>
      </AdminShell>
    )
  }

  if (!authenticated) {
    return (
      <AdminShell>
        <div className="admin-page">
          <div className="admin-page__card admin-page__card--narrow">
            <h1 className="admin-page__title">Admin</h1>
            <p className="admin-page__muted">Sign in to manage stops</p>
            <form onSubmit={handleLogin} className="admin-page__form">
              <label className="admin-page__label">
                Password
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="admin-page__input"
                  autoComplete="current-password"
                  autoFocus
                />
              </label>
              {loginError && <p className="admin-page__error">{loginError}</p>}
              <button type="submit" className="admin-page__btn admin-page__btn--primary">
                Sign in
              </button>
            </form>
          </div>
        </div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-page__header">
        <Link to="/" className="admin-page__back">
          <ArrowLeft size={20} /> Back to site
        </Link>
        <h1 className="admin-page__title">Admin – Stops</h1>
      </header>

      <div className="admin-page__content">
        <section className="admin-page__card admin-page__table-section">
          <div className="admin-page__table-header">
            <input
              type="search"
              placeholder="Search by city, country, venue, id…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="admin-page__input admin-page__search"
            />
            <button type="button" onClick={startAdd} className="admin-page__btn admin-page__btn--primary">
              <Plus size={18} /> Add stop
            </button>
          </div>
          {loadError && <p className="admin-page__error">{loadError}</p>}
          <div className="admin-page__table-wrap">
            <table className="admin-page__table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>City</th>
                  <th>Country</th>
                  <th>Venue</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {filteredStops.map((stop) => (
                  <tr
                    key={stop.id}
                    onClick={() => selectStop(stop)}
                    className={selectedStop?.id === stop.id && !editingNew ? 'admin-page__row--selected' : ''}
                  >
                    <td>{stop.order}</td>
                    <td>{stop.city}</td>
                    <td>{stop.country}</td>
                    <td>{stop.venue}</td>
                    <td className="admin-page__cell-address">{stop.address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-page__card admin-page__form-section">
          {selectedStop ? (
            <>
              <h2 className="admin-page__subtitle">
                {editingNew ? 'New stop' : `Edit: ${selectedStop.city} – ${selectedStop.venue}`}
              </h2>
              <form onSubmit={handleSave} className="admin-page__form admin-page__form--grid">
                {editingNew && (
                  <label className="admin-page__label admin-page__label--full">
                    ID
                    <input
                      type="text"
                      value={selectedStop.id}
                      onChange={(e) => updateField('id', e.target.value)}
                      className="admin-page__input"
                      placeholder="e.g. london-2026"
                    />
                  </label>
                )}
                <label className="admin-page__label">
                  Order
                  <input
                    type="number"
                    value={selectedStop.order}
                    onChange={(e) => updateField('order', parseInt(e.target.value, 10) || 0)}
                    className="admin-page__input"
                  />
                </label>
                <label className="admin-page__label">
                  City
                  <input
                    type="text"
                    value={selectedStop.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    className="admin-page__input"
                  />
                </label>
                <label className="admin-page__label">
                  Country
                  <input
                    type="text"
                    value={selectedStop.country}
                    onChange={(e) => updateField('country', e.target.value)}
                    className="admin-page__input"
                  />
                </label>
                <label className="admin-page__label admin-page__label--full">
                  Venue
                  <input
                    type="text"
                    value={selectedStop.venue}
                    onChange={(e) => updateField('venue', e.target.value)}
                    className="admin-page__input"
                  />
                </label>
                <label className="admin-page__label admin-page__label--full">
                  Address
                  <input
                    type="text"
                    value={selectedStop.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    className="admin-page__input"
                  />
                </label>
                <label className="admin-page__label">
                  Lat
                  <input
                    type="number"
                    step="any"
                    value={selectedStop.lat}
                    onChange={(e) => updateField('lat', parseFloat(e.target.value) || 0)}
                    className="admin-page__input"
                  />
                </label>
                <label className="admin-page__label">
                  Lng
                  <input
                    type="number"
                    step="any"
                    value={selectedStop.lng}
                    onChange={(e) => updateField('lng', parseFloat(e.target.value) || 0)}
                    className="admin-page__input"
                  />
                </label>
                <label className="admin-page__label admin-page__label--full">
                  Timeline
                  <input
                    type="text"
                    value={selectedStop.timeline ?? ''}
                    onChange={(e) => updateField('timeline', e.target.value)}
                    className="admin-page__input"
                  />
                </label>
                <label className="admin-page__label admin-page__label--full">
                  Notes
                  <textarea
                    value={selectedStop.notes ?? ''}
                    onChange={(e) => updateField('notes', e.target.value)}
                    className="admin-page__input admin-page__textarea"
                    rows={4}
                  />
                </label>
                {saveError && (
                  <p className="admin-page__error admin-page__label--full">{saveError}</p>
                )}
                <div className="admin-page__form-actions admin-page__label--full">
                  <button type="submit" className="admin-page__btn admin-page__btn--primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  {!editingNew && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="admin-page__btn admin-page__btn--danger"
                      disabled={deleting}
                    >
                      <Trash2 size={16} /> {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                  <button type="button" onClick={clearSelection} className="admin-page__btn admin-page__btn--secondary">
                    Cancel
                  </button>
                </div>
              </form>
            </>
          ) : (
            <p className="admin-page__muted">Select a stop from the table or click “Add stop” to create one.</p>
          )}
        </section>
      </div>
    </div>
    </AdminShell>
  )
}
