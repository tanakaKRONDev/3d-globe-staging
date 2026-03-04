import { useState, useEffect, useRef, useCallback } from 'react'

const DEBOUNCE_MS = 350
const MIN_LENGTH = 4
const GEOCODE_API = '/api/admin/geocode'

export interface AddressSuggestion {
  displayName: string
  lat: number
  lng: number
  city?: string
  state?: string
  postcode?: string
  countryCode?: string
}

export interface AddressPickPayload {
  displayName: string
  lat: number
  lng: number
  city?: string
  postcode?: string
  countryCode?: string
}

interface AddressInputProps {
  value: string
  countryCode: string
  onChangeAddress: (newValue: string) => void
  onPickSuggestion: (pick: AddressPickPayload) => void
  disabled?: boolean
  suppressLookupRef?: React.MutableRefObject<boolean>
  /** Optional action (e.g. "Auto-fill coords" button) shown next to the label */
  labelAction?: React.ReactNode
  onBlur?: () => void
}

export function AddressInput({
  value,
  countryCode,
  onChangeAddress,
  onPickSuggestion,
  disabled,
  suppressLookupRef,
  labelAction,
  onBlur,
}: AddressInputProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggestions = useCallback(
    async (query: string) => {
      const trimmed = query.trim()
      if (!trimmed || trimmed.length < MIN_LENGTH) {
        setSuggestions([])
        setLoading(false)
        return
      }
      if (suppressLookupRef?.current) {
        setSuggestions([])
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const params = new URLSearchParams({ q: trimmed, limit: '6' })
        if (countryCode) params.set('country', countryCode)
        const res = await fetch(`${GEOCODE_API}?${params}`, { credentials: 'include' })
        if (!res.ok) {
          setSuggestions([])
          return
        }
        const data = (await res.json()) as Array<{
          displayName: string
          lat: number
          lng: number
          address?: { city?: string; state?: string; postcode?: string; countryCode?: string }
        }>
        const list = (Array.isArray(data) ? data : []).map((item) => ({
          displayName: item.displayName ?? '',
          lat: Number(item.lat),
          lng: Number(item.lng),
          city: item.address?.city,
          state: item.address?.state,
          postcode: item.address?.postcode,
          countryCode: item.address?.countryCode,
        }))
        setSuggestions(list)
        setOpen(list.length > 0)
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    },
    [countryCode, suppressLookupRef]
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim() || value.trim().length < MIN_LENGTH) {
      setSuggestions([])
      setLoading(false)
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      fetchSuggestions(value)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, fetchSuggestions])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (s: AddressSuggestion) => {
    onPickSuggestion({
      displayName: s.displayName,
      lat: s.lat,
      lng: s.lng,
      city: s.city,
      postcode: s.postcode,
      countryCode: s.countryCode,
    })
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="address-input span2">
      <label className="admin-page__label">
        {labelAction ? (
          <span className="admin-page__label-row">
            Address
            {labelAction}
          </span>
        ) : (
          'Address'
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => onChangeAddress(e.target.value)}
          onFocus={() => value.trim().length >= MIN_LENGTH && suggestions.length > 0 && setOpen(true)}
          onBlur={onBlur}
          placeholder={countryCode ? `Start typing address…` : 'Select country first, then type address…'}
          disabled={disabled}
          className="admin-page__input"
          autoComplete="off"
        />
      </label>
      {open && (
        <div className="address-input__dropdown">
          {loading && (
            <div className="address-input__item address-input__item--muted">Searching…</div>
          )}
          {!loading && suggestions.length === 0 && value.trim().length >= MIN_LENGTH && (
            <div className="address-input__item address-input__item--muted">No results</div>
          )}
          {!loading &&
            suggestions.map((s, i) => (
              <button
                key={`${s.lat}-${s.lng}-${i}`}
                type="button"
                className="address-input__item"
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(s)
                }}
              >
                {s.displayName}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
