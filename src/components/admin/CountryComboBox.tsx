import { useState, useRef, useEffect } from 'react'
import { getAllCountries, getCountryName, type CountryOption } from '../../lib/geo/countries'

interface CountryComboBoxProps {
  value: string
  onChange: (code: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
}

export function CountryComboBox({ value, onChange, placeholder = 'Select country…', disabled, id, className }: CountryComboBoxProps) {
  const [searchText, setSearchText] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const allCountries = getAllCountries()
  const query = searchText.trim().toLowerCase()
  const filtered =
    !query
      ? allCountries
      : allCountries.filter(
          (c) =>
            c.name.toLowerCase().includes(query) ||
            c.code.toLowerCase().includes(query)
        )

  const displayValue = open ? searchText : (value ? getCountryName(value) || value : '')

  useEffect(() => {
    if (!open && value) {
      setSearchText(getCountryName(value) || value)
    }
    if (!open) setHighlightIndex(-1)
  }, [open, value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (c: CountryOption) => {
    onChange(c.code)
    setSearchText(c.name)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        setOpen(true)
        setSearchText('')
        setHighlightIndex(0)
        e.preventDefault()
      }
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setSearchText(value ? getCountryName(value) : '')
      e.preventDefault()
      return
    }
    if (e.key === 'ArrowDown') {
      setHighlightIndex((i) => (i < filtered.length - 1 ? i + 1 : i))
      e.preventDefault()
      return
    }
    if (e.key === 'ArrowUp') {
      setHighlightIndex((i) => (i > 0 ? i - 1 : 0))
      e.preventDefault()
      return
    }
    if (e.key === 'Enter') {
      const c = filtered[highlightIndex >= 0 ? highlightIndex : 0]
      if (c) {
        handleSelect(c)
        e.preventDefault()
      }
    }
  }

  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightIndex] as HTMLElement
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [highlightIndex])

  return (
    <div ref={containerRef} className={`country-combobox ${className ?? ''}`}>
      <input
        id={id}
        type="text"
        value={displayValue}
        onChange={(e) => {
          const v = e.target.value
          setSearchText(v)
          setOpen(true)
          setHighlightIndex(0)
        }}
        onFocus={() => {
          setOpen(true)
          setSearchText(displayValue)
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className="admin-page__input country-combobox__input"
      />
      {open && (
        <div ref={listRef} className="country-combobox__dropdown">
          {filtered.length === 0 ? (
            <div className="country-combobox__item country-combobox__item--muted">No matches</div>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.code}
                type="button"
                className={`country-combobox__item ${i === highlightIndex ? 'country-combobox__item--highlight' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(c)
                }}
              >
                {c.name} ({c.code})
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
