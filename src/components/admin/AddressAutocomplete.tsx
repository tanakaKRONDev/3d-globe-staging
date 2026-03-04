import { useState, useEffect, useRef, useCallback } from 'react'

export interface GeocodeSuggestion {
  displayName: string
  lat: number
  lng: number
  address: {
    city: string
    state: string
    postcode: string
    countryCode: string
  }
  raw?: unknown
}

export interface AddressPick {
  displayName: string
  lat: number
  lng: number
  city: string
  postcode: string
  countryCode: string
}

/** Matches postal/zip codes: digits, optional space + alphanumeric (e.g. 60612, M5J 3A5, SW1A 1AA) */
function looksLikePostalCode(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  return /^\d{3,}[\s\w]*$|^[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d$/i.test(t)
}

interface AddressAutocompleteProps {
  countryCode: string
  city?: string
  onPick: (pick: AddressPick) => void
}

const DEBOUNCE_MS = 350
const GEOCODE_API = '/api/admin/geocode'

export function AddressAutocomplete({ countryCode, city, onPick }: AddressAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggestions = useCallback(
    async (inputQuery: string) => {
      const trimmed = inputQuery.trim()
      if (!trimmed) {
        setSuggestions([])
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        // Postal-code-first: if input looks like postal code, bias query with city when available
        const isPostal = looksLikePostalCode(trimmed)
        const geocodeQuery =
          isPostal && countryCode && city?.trim() ? `${trimmed} ${city.trim()}` : trimmed
        const params = new URLSearchParams({ q: geocodeQuery, limit: '6' })
        if (countryCode) params.set('country', countryCode)
        const res = await fetch(`${GEOCODE_API}?${params}`, { credentials: 'include' })
        if (!res.ok) {
          setError('Search unavailable')
          setSuggestions([])
          return
        }
        const data = (await res.json()) as GeocodeSuggestion[]
        setSuggestions(Array.isArray(data) ? data : [])
      } catch {
        setError('Search failed')
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    },
    [countryCode, city]
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setSuggestions([])
      setLoading(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      fetchSuggestions(query)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, fetchSuggestions])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (s: GeocodeSuggestion) => {
    onPick({
      displayName: s.displayName,
      lat: s.lat,
      lng: s.lng,
      city: s.address?.city ?? '',
      postcode: s.address?.postcode ?? '',
      countryCode: (s.address?.countryCode ?? '').toUpperCase(),
    })
    setQuery('')
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="address-autocomplete span2">
      <label className="admin-page__label">
        Search address
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const v = e.target.value
            setQuery(v)
            setOpen(v.trim().length > 0)
          }}
          onFocus={() => query.trim() && setOpen(true)}
          placeholder={countryCode ? `Search in ${countryCode}…` : 'Search address (select country for better results)…'}
          className="admin-page__input"
          autoComplete="off"
        />
      </label>
      {open && (
        <div className="address-autocomplete__dropdown">
          {loading && (
            <div className="address-autocomplete__item address-autocomplete__item--muted">Searching…</div>
          )}
          {!loading && error && (
            <div className="address-autocomplete__item address-autocomplete__item--error">{error}</div>
          )}
          {!loading && !error && suggestions.length === 0 && query.trim() && (
            <div className="address-autocomplete__item address-autocomplete__item--muted">No results</div>
          )}
          {!loading &&
            suggestions.map((s, i) => (
              <button
                key={`${s.lat}-${s.lng}-${i}`}
                type="button"
                className="address-autocomplete__item"
                onClick={() => handleSelect(s)}
              >
                {s.displayName}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
