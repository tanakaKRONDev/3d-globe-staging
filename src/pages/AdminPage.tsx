import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, ArrowLeft } from 'lucide-react'
import { useBodyClass } from '../lib/ui/useBodyClass'
import { AdminShell } from '../components/layout/AdminShell'
import { AuthShell } from '../components/auth/AuthShell'
import { AuthCard } from '../components/auth/AuthCard'
import { AddressInput } from '../components/admin/AddressInput'
import { CountryComboBox } from '../components/admin/CountryComboBox'
import { getCountryName, normalizeCountry } from '../lib/geo/countries'
import './AdminPage.css'

/** Stop shape: country holds ISO2 code (e.g. US, GB). */
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
  const [geoCandidates, setGeoCandidates] = useState<
    Array<{ displayName: string; lat: number; lng: number; city?: string; state?: string; postcode?: string; countryCode?: string }>
  >([])
  const [geoError, setGeoError] = useState<string | null>(null)
  const [isGeoLoading, setIsGeoLoading] = useState(false)
  const autoFillRef = useRef(false)
  const suppressLookupRef = useRef(false)

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
    const normalized = (Array.isArray(data) ? data : []).map((s) => ({
      ...s,
      country: normalizeCountry(s.country || ''),
    }))
    setStops(normalized)
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
    const country = stop.country?.trim().length ? (normalizeCountry(stop.country) || '') : (stop.country ?? '')
    setSelectedStop({ ...stop, country })
    setSaveError(null)
  }

  const clearSelection = () => {
    setSelectedStop(null)
    setEditingNew(false)
    setSaveError(null)
  }

  const resolveForSave = useCallback(async (): Promise<{ address: string; lat: number; lng: number; city: string; country: string } | null> => {
    if (!selectedStop) return null
    const addr = selectedStop.address?.trim() || ''
    const latOk = Number.isFinite(selectedStop.lat) && selectedStop.lat !== 0
    const lngOk = Number.isFinite(selectedStop.lng) && selectedStop.lng !== 0

    if (addr && (!latOk || !lngOk)) {
      const params = new URLSearchParams({ q: addr, limit: '6' })
      if (selectedStop.country) params.set('country', selectedStop.country)
      const res = await adminFetch(`/geocode?${params}`)
      const data = (await res.json()) as GeoResult[]
      const results = Array.isArray(data) ? data : []
      if (res.status === 429) {
        setSaveError('Rate limited. Please wait a moment.')
        return null
      }
      if (results.length === 1) {
        const r = results[0]
        return {
          address: selectedStop.address || '',
          lat: r.lat,
          lng: r.lng,
          city: selectedStop.city || r.address?.city || '',
          country: selectedStop.country || (r.address?.countryCode || '').toUpperCase(),
        }
      }
      if (results.length > 1) {
        setGeoCandidates(
          results.map((r) => ({
            displayName: r.displayName,
            lat: r.lat,
            lng: r.lng,
            city: r.address?.city,
            state: r.address?.state,
            postcode: r.address?.postcode,
            countryCode: r.address?.countryCode,
          }))
        )
        setSaveError('Multiple matches. Select an address from the dropdown.')
        return null
      }
      setSaveError('No match found. Enter coordinates manually.')
      return null
    }

    if ((latOk && lngOk) && !addr) {
      const res = await adminFetch(`/reverse?lat=${selectedStop.lat}&lng=${selectedStop.lng}`)
      const data = (await res.json()) as GeoResult | GeoResult[]
      const arr = Array.isArray(data) ? data : [data]
      const r = arr[0]
      if (res.status === 429) {
        setSaveError('Rate limited. Please wait a moment.')
        return null
      }
      if (r) {
        return {
          address: r.displayName,
          lat: selectedStop.lat,
          lng: selectedStop.lng,
          city: selectedStop.city || r.address?.city || '',
          country: selectedStop.country || (r.address?.countryCode || '').toUpperCase(),
        }
      }
      setSaveError('Could not reverse geocode. Enter address manually.')
      return null
    }

    return {
      address: selectedStop.address || '',
      lat: selectedStop.lat,
      lng: selectedStop.lng,
      city: selectedStop.city || '',
      country: selectedStop.country.trim(),
    }
  }, [selectedStop])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStop) return
    setSaveError(null)
    setGeoCandidates([])
    setGeoError(null)
    setSaving(true)
    try {
      const resolved = await resolveForSave()
      if (!resolved) {
        setSaving(false)
        return
      }
      const { address, lat, lng, city, country } = resolved
      const hasCoords = Number.isFinite(lat) && lat !== 0 && Number.isFinite(lng) && lng !== 0
      if (!address?.trim() || !hasCoords) {
        setSaveError('Address and coordinates are both required. Use auto-fill or enter manually.')
        setSaving(false)
        return
      }
      const body = {
        order: selectedStop.order,
        city: city || selectedStop.city,
        country: country || selectedStop.country.trim(),
        venue: selectedStop.venue,
        address,
        lat,
        lng,
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

  interface GeoResult {
    displayName: string
    lat: number
    lng: number
    address?: { city?: string; state?: string; postcode?: string; countryCode?: string }
  }

  const applyPickedLocation = useCallback(
    (pick: { displayName: string; lat: number; lng: number; city?: string; postcode?: string; countryCode?: string }) => {
      const lat = Number(pick.lat)
      const lng = Number(pick.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setGeoError('Invalid coordinates from suggestion')
        return
      }
      if (!selectedStop) return
      setGeoError(null)
      suppressLookupRef.current = true
      autoFillRef.current = true
      setSelectedStop((prev) => ({
        ...prev,
        address: pick.displayName,
        lat,
        lng,
        city: prev.city?.trim() ? prev.city : (pick.city ?? prev.city),
        country: prev.country?.trim() ? prev.country : (pick.countryCode ? (pick.countryCode as string).toUpperCase() : prev.country),
      }))
      setGeoCandidates([])
      setTimeout(() => {
        suppressLookupRef.current = false
        autoFillRef.current = false
      }, 400)
    },
    [selectedStop]
  )

  const fillFromReverseResult = useCallback(
    (r: GeoResult) => {
      if (!selectedStop) return
      setGeoError(null)
      suppressLookupRef.current = true
      autoFillRef.current = true
      setSelectedStop((prev) => ({
        ...prev,
        address: r.displayName,
        city: prev.city?.trim() ? prev.city : (r.address?.city ?? prev.city),
        country: prev.country?.trim() ? prev.country : (r.address?.countryCode ? (r.address.countryCode as string).toUpperCase() : prev.country),
      }))
      setTimeout(() => {
        suppressLookupRef.current = false
        autoFillRef.current = false
      }, 400)
    },
    [selectedStop]
  )

  const runGeocode = useCallback(async () => {
    if (!selectedStop) return
    const addr = selectedStop.address?.trim() || ''
    const latOk = Number.isFinite(selectedStop.lat) && selectedStop.lat !== 0
    const lngOk = Number.isFinite(selectedStop.lng) && selectedStop.lng !== 0
    if (!addr || (latOk && lngOk)) return

    setGeoError(null)
    setGeoCandidates([])
    setIsGeoLoading(true)
    try {
      const params = new URLSearchParams({ q: addr, limit: '6' })
      if (selectedStop.country) params.set('country', selectedStop.country)
      const res = await adminFetch(`/geocode?${params}`)
      const data = (await res.json()) as GeoResult[]
      const results = Array.isArray(data) ? data : []

      if (res.status === 429) {
        setGeoError('Rate limited. Please wait a moment.')
        return
      }
      if (!res.ok) {
        setGeoError('Geocoding failed')
        return
      }

      if (results.length === 1) {
        const r = results[0]
        applyPickedLocation({
          displayName: r.displayName,
          lat: r.lat,
          lng: r.lng,
          city: r.address?.city,
          countryCode: r.address?.countryCode,
        })
      } else if (results.length > 1) {
        setGeoCandidates(
          results.map((r) => ({
            displayName: r.displayName,
            lat: r.lat,
            lng: r.lng,
            city: r.address?.city,
            state: r.address?.state,
            postcode: r.address?.postcode,
            countryCode: r.address?.countryCode,
          }))
        )
      } else {
        setGeoError('No match found. Enter coordinates manually.')
      }
    } catch {
      setGeoError('Geocoding failed')
    } finally {
      setIsGeoLoading(false)
    }
  }, [selectedStop, applyPickedLocation])

  const runReverse = useCallback(async () => {
    if (!selectedStop) return
    const addr = selectedStop.address?.trim() || ''
    const lat = selectedStop.lat
    const lng = selectedStop.lng
    const latOk = Number.isFinite(lat) && lat !== 0
    const lngOk = Number.isFinite(lng) && lng !== 0
    if (!latOk || !lngOk || addr) return

    setGeoError(null)
    setIsGeoLoading(true)
    try {
      const res = await adminFetch(`/reverse?lat=${lat}&lng=${lng}`)
      const data = (await res.json()) as GeoResult | GeoResult[]
      const arr = Array.isArray(data) ? data : [data]
      const r = arr[0]

      if (res.status === 429) {
        setGeoError('Rate limited. Please wait a moment.')
        return
      }
      if (!res.ok) {
        setGeoError('Reverse geocoding failed')
        return
      }

      if (r) fillFromReverseResult(r)
    } catch {
      setGeoError('Reverse geocoding failed')
    } finally {
      setIsGeoLoading(false)
    }
  }, [selectedStop, fillFromReverseResult])

  const handleAddressBlur = useCallback(() => {
    if (autoFillRef.current) return
    runGeocode()
  }, [runGeocode])

  const handleCoordsBlur = useCallback(() => {
    if (autoFillRef.current) return
    runReverse()
  }, [runReverse])

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
      <AuthShell>
        <AuthCard title="Admin" subtitle="Sign in to manage stops" error={loginError || undefined}>
          <form onSubmit={handleLogin} className="auth-card__form">
            <label className="auth-label">
              Password
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="auth-input"
                autoComplete="current-password"
                autoFocus
              />
            </label>
            <button type="submit" className="auth-btn">
              Sign in
            </button>
          </form>
        </AuthCard>
      </AuthShell>
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
                    <td>{getCountryName(stop.country) || stop.country}</td>
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
              <form onSubmit={handleSave} className="admin-page__form adminFormGrid">
                {editingNew && (
                  <label className="admin-page__label span2">
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
                  <CountryComboBox
                    value={selectedStop.country}
                    onChange={(code) => updateField('country', code)}
                    placeholder="Search or select country…"
                  />
                </label>
                <label className="admin-page__label span2">
                  Venue
                  <input
                    type="text"
                    value={selectedStop.venue}
                    onChange={(e) => updateField('venue', e.target.value)}
                    className="admin-page__input"
                  />
                </label>
                <AddressInput
                  value={selectedStop.address}
                  countryCode={selectedStop.country}
                  onChangeAddress={(v) => updateField('address', v)}
                  onPickSuggestion={applyPickedLocation}
                  onBlur={handleAddressBlur}
                  suppressLookupRef={suppressLookupRef}
                  labelAction={
                    <button
                      type="button"
                      onClick={runGeocode}
                      disabled={isGeoLoading || !selectedStop.address?.trim()}
                      className="admin-page__inline-btn"
                      title="Auto-fill coordinates from address"
                    >
                      Auto-fill coords
                    </button>
                  }
                />
                {geoCandidates.length > 1 && (
                  <div className="admin-page__geo-dropdown span2">
                    <p className="admin-page__geo-dropdown-label">Select address match…</p>
                    {geoCandidates.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        className="admin-page__geo-dropdown-item"
                        onClick={() =>
                          applyPickedLocation({
                            displayName: c.displayName,
                            lat: c.lat,
                            lng: c.lng,
                            city: c.city,
                            countryCode: c.countryCode,
                          })
                        }
                      >
                        {c.displayName}
                      </button>
                    ))}
                  </div>
                )}
                {geoError && <p className="admin-page__geo-msg span2">{geoError}</p>}
                <label className="admin-page__label admin-page__label--coords">
                  <span className="admin-page__label-row">
                    Lat / Lng
                    <button
                      type="button"
                      onClick={runReverse}
                      disabled={
                        isGeoLoading ||
                        !Number.isFinite(selectedStop.lat) ||
                        selectedStop.lat === 0 ||
                        !Number.isFinite(selectedStop.lng) ||
                        selectedStop.lng === 0 ||
                        !!selectedStop.address?.trim()
                      }
                      className="admin-page__inline-btn"
                      title="Auto-fill address from coordinates"
                    >
                      Auto-fill address
                    </button>
                  </span>
                  <div className="admin-page__coords-row">
                    <input
                    type="number"
                    step="any"
                    value={selectedStop.lat}
                    onChange={(e) => updateField('lat', parseFloat(e.target.value) || 0)}
                    onBlur={handleCoordsBlur}
                    className="admin-page__input"
                    placeholder="Lat"
                  />
                    <input
                      type="number"
                      step="any"
                      value={selectedStop.lng}
                      onChange={(e) => updateField('lng', parseFloat(e.target.value) || 0)}
                      onBlur={handleCoordsBlur}
                      className="admin-page__input"
                      placeholder="Lng"
                    />
                  </div>
                </label>
                <label className="admin-page__label span2">
                  Timeline
                  <input
                    type="text"
                    value={selectedStop.timeline ?? ''}
                    onChange={(e) => updateField('timeline', e.target.value)}
                    className="admin-page__input"
                  />
                </label>
                <label className="admin-page__label span2">
                  Notes
                  <textarea
                    value={selectedStop.notes ?? ''}
                    onChange={(e) => updateField('notes', e.target.value)}
                    className="admin-page__input admin-page__textarea"
                    rows={4}
                  />
                </label>
                {saveError && (
                  <p className="admin-page__error span2">{saveError}</p>
                )}
                <div className="admin-page__form-actions span2">
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
