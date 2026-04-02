import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Artist } from '../lib/data/types'
import { DEFAULT_TITLE, DEFAULT_SUBTITLE } from '../config/defaults'

const DEFAULT_ARTIST: Artist = {
  slug: null,
  name: 'Platform',
  title: DEFAULT_TITLE,
  subtitle: DEFAULT_SUBTITLE,
  accentColor: '#E7D1A7',
  accentMuted: '#D4C1A0',
  accentDark: '#C1AE8D',
  logoUrl: null,
}

interface ArtistContextValue {
  artist: Artist
  loading: boolean
}

const ArtistContext = createContext<ArtistContextValue>({
  artist: DEFAULT_ARTIST,
  loading: true,
})

export function useArtist(): ArtistContextValue {
  return useContext(ArtistContext)
}

/** Parse hex color to "r, g, b" string for use in rgba(). */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

/** Apply artist accent colors + data attribute on :root. */
function applyAccentVars(artist: Artist) {
  const el = document.documentElement
  const root = el.style
  root.setProperty('--accent', artist.accentColor)
  root.setProperty('--accent-rgb', hexToRgb(artist.accentColor))
  if (artist.accentMuted) root.setProperty('--accent-muted', artist.accentMuted)
  if (artist.accentDark) root.setProperty('--accent-dark', artist.accentDark)

  // Set data-artist attribute for CSS scoping
  if (artist.slug) {
    el.setAttribute('data-artist', artist.slug)
  } else {
    el.removeAttribute('data-artist')
  }
}

export function ArtistProvider({ children }: { children: ReactNode }) {
  const [artist, setArtist] = useState<Artist>(DEFAULT_ARTIST)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchBranding() {
      try {
        // Forward ?artist= param from page URL so worker can resolve context
        const artistParam = new URLSearchParams(window.location.search).get('artist')
        const apiUrl = artistParam ? `/api/artist?artist=${encodeURIComponent(artistParam)}` : '/api/artist'
        const res = await fetch(apiUrl)
        if (!res.ok) {
          console.warn('[ArtistContext] /api/artist returned', res.status)
          return
        }
        const data = await res.json()
        if (cancelled) return
        // Merge with defaults so missing fields don't break anything
        const resolved: Artist = {
          id: data.id ?? undefined,
          slug: data.slug ?? null,
          name: data.name ?? DEFAULT_ARTIST.name,
          title: data.title ?? DEFAULT_ARTIST.title,
          subtitle: data.subtitle ?? DEFAULT_ARTIST.subtitle,
          accentColor: data.accentColor ?? data.accent_color ?? DEFAULT_ARTIST.accentColor,
          accentMuted: data.accentMuted ?? data.accent_muted ?? DEFAULT_ARTIST.accentMuted,
          accentDark: data.accentDark ?? data.accent_dark ?? DEFAULT_ARTIST.accentDark,
          logoUrl: data.logoUrl ?? data.logo_url ?? null,
        }
        setArtist(resolved)
        applyAccentVars(resolved)
      } catch (err) {
        console.warn('[ArtistContext] Failed to fetch branding, using defaults', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchBranding()
    return () => { cancelled = true }
  }, [])

  return (
    <ArtistContext.Provider value={{ artist, loading }}>
      {children}
    </ArtistContext.Provider>
  )
}
