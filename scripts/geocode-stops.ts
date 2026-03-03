#!/usr/bin/env node

/**
 * Build-time geocoding for stops with missing lat/lng.
 * Uses OpenStreetMap Nominatim. Rate limited, cached. No runtime geocoding.
 */

import { promises as fs, existsSync } from 'fs'
import { join } from 'path'
import fetch from 'node-fetch'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const RATE_LIMIT_MS = 1100 // 1 req/sec + margin
const CACHE_PATH = 'data/geocode-cache.json'
const STOPS_PATH = 'public/data/stops.json'
const OVERRIDE_PATH = 'data/stops.override.json'

interface Stop {
  id: string
  order: number
  city: string
  countryCode: string
  venue: string
  lat: number | null
  lng: number | null
  [key: string]: unknown
}

interface GeocodeCache {
  [query: string]: { lat: number; lng: number }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function geocodeQuery(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `${NOMINATIM_URL}?${new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
  })}`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'World Tour 2026 Landing Page (Build-time geocoding; contact@example.com)',
    },
  })

  if (!res.ok) return null

  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>
  if (!Array.isArray(data) || data.length === 0) return null

  const lat = parseFloat(data[0].lat)
  const lng = parseFloat(data[0].lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  return { lat, lng }
}

async function main() {
  if (!existsSync(STOPS_PATH)) {
    console.error('[Geocode] stops.json not found. Run "npm run data:stops" first.')
    process.exit(1)
  }

  const stops: Stop[] = JSON.parse(await fs.readFile(STOPS_PATH, 'utf8'))
  let cache: GeocodeCache = {}
  if (existsSync(CACHE_PATH)) {
    try {
      cache = JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'))
    } catch {
      cache = {}
    }
  }

  const overrides: Record<string, { lat: number; lng: number }> = {}
  let missCount = 0
  let ambigCount = 0
  let filled = 0

  const cityFromCell = (c: string) => {
    const s = (c || '').toString().trim()
    const lastComma = s.lastIndexOf(',')
    if (lastComma < 0) return s
    return s.slice(0, lastComma).trim()
  }

  for (const stop of stops) {
    if (stop.lat != null && stop.lng != null) continue

    const cityName = cityFromCell(stop.city)
    const countryCode = (stop.countryCode || 'US').toString()
    const venue = (stop.venue || '').toString().trim()

    const queries = [
      `${venue}, ${cityName}, ${countryCode}`,
      `${venue}, ${cityName}`,
      `${cityName}, ${countryCode}`,
    ]

    let result: { lat: number; lng: number } | null = null
    let usedQuery = ''

    for (const q of queries) {
      if (cache[q]) {
        result = cache[q]
        usedQuery = q
        break
      }

      const r = await geocodeQuery(q)
      await sleep(RATE_LIMIT_MS)

      if (r) {
        cache[q] = r
        result = r
        usedQuery = q
        break
      }
    }

    if (!result) {
      console.log(`[GEOCODE-MISS] ${stop.id} (${stop.city} - ${stop.venue})`)
      missCount++
      continue
    }

    overrides[stop.id] = result
    filled++
  }

  // Merge overrides into existing
  let existingOverrides: Record<string, { lat?: number; lng?: number; [k: string]: unknown }> = {}
  if (existsSync(OVERRIDE_PATH)) {
    try {
      existingOverrides = JSON.parse(await fs.readFile(OVERRIDE_PATH, 'utf8'))
    } catch {
      existingOverrides = {}
    }
  }

  for (const [id, coords] of Object.entries(overrides)) {
    existingOverrides[id] = { ...(existingOverrides[id] || {}), lat: coords.lat, lng: coords.lng }
  }

  await fs.mkdir('data', { recursive: true })
  await fs.writeFile(OVERRIDE_PATH, JSON.stringify(existingOverrides, null, 2))
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2))

  // Update stops.json with merged coords
  const mergedStops = stops.map((s) => {
    const o = existingOverrides[s.id]
    if (o?.lat != null && o?.lng != null) {
      return { ...s, lat: o.lat, lng: o.lng }
    }
    return s
  })

  await fs.writeFile(STOPS_PATH, JSON.stringify(mergedStops, null, 2))

  console.log(`[Geocode] Filled ${filled} coords. Miss: ${missCount}. Cache: ${Object.keys(cache).length} entries.`)
}

main().catch((err) => {
  console.error('[Geocode] Fatal:', err)
  process.exit(1)
})
