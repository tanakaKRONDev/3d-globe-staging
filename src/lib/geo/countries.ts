import * as countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

countries.registerLocale(enLocale as { locale: string; countries: Record<string, string | string[]> })

export type CountryOption = { code: string; name: string }

let cachedAll: CountryOption[] | null = null

/** All ISO-3166 countries sorted by name (official English). */
export function getAllCountries(): CountryOption[] {
  if (cachedAll) return cachedAll
  const names = countries.getNames('en', { select: 'official' }) as Record<string, string>
  cachedAll = Object.entries(names)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return cachedAll
}

/** Get friendly name for ISO2 code, or the code itself if not found. */
export function getCountryName(code: string): string {
  if (!code) return ''
  const name = countries.getName(code, 'en', { select: 'official' })
  if (typeof name === 'string') return name
  return code
}

/** Normalize legacy country values (e.g. "Chicago, US" -> "US"). Returns blank if not parseable. */
export function normalizeCountry(value: string): string {
  const v = (value || '').trim()
  if (!v) return ''
  if (v.length <= 2) return v.toUpperCase()
  const m = v.match(/,\s*([A-Za-z]{2})\s*$/)
  if (m) return (m[1] || '').toUpperCase()
  return ''
}
