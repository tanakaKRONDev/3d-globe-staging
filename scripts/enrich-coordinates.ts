/**
 * Build-time coordinate enrichment for stops.raw.json
 * Uses Nominatim (OSM) for free geocoding, with cache and override support.
 */
import { promises as fs, existsSync } from 'fs'
import { join } from 'path'

interface Stop {
  id: string
  order: number
  city: string
  countryCode: string
  venue: string
  capacityMin: number | null
  capacityMax: number | null
  lat: number | null
  lng: number | null
  bullets: string[]
}

interface Override {
  lat?: number
  lng?: number
  bullets?: string[]
  [key: string]: unknown
}

type GeocodeCache = Record<string, { lat: number; lng: number }>

const THROTTLE_MS = 1000
const USER_AGENT = 'WorldTour2026/1.0 (contact@example.com)'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function geocodeWithNominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '1')

  const response = await fetch(url.toString(), {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) return null

  const data = (await response.json()) as Array<{ lat?: string; lon?: string }>
  if (!Array.isArray(data) || data.length === 0) return null

  const first = data[0]
  const lat = parseFloat(first?.lat ?? '')
  const lon = parseFloat(first?.lon ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  return { lat, lng: lon }
}

async function main() {
  const repoRoot = process.cwd()
  const rawPath = join(repoRoot, 'public', 'data', 'stops.raw.json')
  const outputPath = join(repoRoot, 'public', 'data', 'stops.json')
  const overridePath = join(repoRoot, 'data', 'stops.override.json')
  const cachePath = join(repoRoot, 'data', 'geocode.cache.json')

  if (!existsSync(rawPath)) {
    console.error('❌ stops.raw.json not found. Run: npm run data:raw')
    process.exit(1)
  }

  console.log('[Enrich] Loading stops.raw.json...')
  const raw = JSON.parse(await fs.readFile(rawPath, 'utf8')) as Stop[]

  let overrides: Record<string, Override> = {}
  if (existsSync(overridePath)) {
    console.log('[Enrich] Loading stops.override.json...')
    overrides = JSON.parse(await fs.readFile(overridePath, 'utf8'))
  }

  let cache: GeocodeCache = {}
  if (existsSync(cachePath)) {
    cache = JSON.parse(await fs.readFile(cachePath, 'utf8'))
  }

  const cacheKey = (s: Stop) => `${s.venue}|${s.city}|${s.countryCode}`
  const missingCoords: string[] = []

  for (let i = 0; i < raw.length; i++) {
    const stop = raw[i]
    const override =
      overrides[stop.id] ??
      overrides[`${stop.order}-${stop.venue}`] ??
      overrides[`${stop.city}+${stop.venue}`]

    if (override?.lat != null && override?.lng != null) {
      stop.lat = override.lat
      stop.lng = override.lng
      if (Array.isArray(override.bullets)) stop.bullets = override.bullets
      continue
    }

    const key = cacheKey(stop)
    const cached = cache[key]
    if (cached) {
      stop.lat = cached.lat
      stop.lng = cached.lng
      continue
    }

    const query = `${stop.venue}, ${stop.city}, ${stop.countryCode}`
    const result = await geocodeWithNominatim(query)

    if (result) {
      stop.lat = result.lat
      stop.lng = result.lng
      cache[key] = { lat: result.lat, lng: result.lng }
      console.log(`[Enrich] Geocoded: ${stop.order}. ${stop.city} - ${stop.venue}`)
    } else {
      missingCoords.push(`${stop.order}. ${stop.city} - ${stop.venue} (${stop.id})`)
    }

    if (i < raw.length - 1) {
      await sleep(THROTTLE_MS)
    }
  }

  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2))
  await fs.writeFile(outputPath, JSON.stringify(raw, null, 2))

  const withCoords = raw.filter((s) => s.lat != null && s.lng != null).length
  console.log(`[Enrich] ✅ Done. ${withCoords}/${raw.length} stops with coordinates`)

  if (missingCoords.length > 0) {
    console.log('')
    console.log('[Enrich] ⚠️ Missing coords (add to data/stops.override.json):')
    missingCoords.forEach((m) => console.log(`  - ${m}`))
  }
}

main().catch((err) => {
  console.error('❌ Enrich failed:', err)
  process.exit(1)
})
