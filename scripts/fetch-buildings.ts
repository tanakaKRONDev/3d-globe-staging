#!/usr/bin/env node

/**
 * Fetches building footprints around each venue using Overpass API.
 * Robust for local "refresh all buildings" runs with retry, backoff, and endpoint rotation.
 */

import { promises as fs, existsSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import fetch from 'node-fetch'
import * as osmtogeojson from 'osmtogeojson'

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const OUTPUT_DIR = 'public/data/buildings'
const USER_AGENT = 'World Tour 2026 Landing Page (Educational/Non-commercial)'

interface Stop {
  id: string
  order: number
  city: string
  venue: string
  lat?: number | null
  lng?: number | null
}

interface OverpassResponse {
  version?: number
  elements?: unknown[]
}

interface GeoJSONFeature {
  type: string
  geometry: { type: string; coordinates: unknown }
  properties?: Record<string, unknown>
}

interface GeoJSONFC {
  type: string
  features: GeoJSONFeature[]
  properties?: Record<string, unknown>
}

/** Same as fly-in: if lat/lng were swapped (|lat|>90, |lng|<=90), return corrected [lat, lng]. */
function normalizeLatLng(lat: number, lng: number): [number, number] {
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) return [lng, lat]
  return [lat, lng]
}

function parseArgs() {
  const args = process.argv.slice(2)
  const env = (k: string, d: string) => process.env[k] ?? d
  const getArg = (name: string, envKey: string, def: string): string => {
    const i = args.indexOf(`--${name}`)
    if (i >= 0 && args[i + 1]) return args[i + 1]
    return env(envKey, def)
  }
  const hasArg = (name: string): boolean => args.includes(`--${name}`)

  const onlyMissingVal = getArg('only-missing', 'BUILDINGS_ONLY_MISSING', 'true')
  const onlyMissingParsed = onlyMissingVal === 'false' || onlyMissingVal === '0' ? false : true

  const fromVal = getArg('from', 'BUILDINGS_FROM', '')
  const toVal = getArg('to', 'BUILDINGS_TO', '')
  const from = fromVal ? parseInt(fromVal, 10) : null
  const to = toVal ? parseInt(toVal, 10) : null

  const ordersFile = getArg('orders-file', 'BUILDINGS_ORDERS_FILE', '')
  const refetchInvalid = hasArg('refetch-invalid') || process.env.BUILDINGS_REFETCH_INVALID === '1'

  return {
    input: getArg('input', 'BUILDINGS_INPUT', 'public/data/stops.all.json'),
    radius: parseInt(getArg('radius', 'BUILDINGS_RADIUS', '900'), 10) || 900,
    limit: parseInt(getArg('limit', 'BUILDINGS_LIMIT', '1200'), 10) || 1200,
    onlyMissing: !hasArg('force') && !hasArg('all') && onlyMissingParsed,
    strict: hasArg('strict') || process.env.BUILDINGS_STRICT === '1',
    wipe: hasArg('wipe'),
    betweenMs: parseInt(getArg('between-ms', 'BUILDINGS_BETWEEN_MS', '1500'), 10) || 1500,
    force: hasArg('force'),
    from,
    to,
    ordersFile,
    refetchInvalid,
  }
}

/** Overpass expects around:RADIUS,LAT,LNG (lat/lng in degrees). */
function buildOverpassQuery(lat: number, lng: number, radius: number): string {
  return `
[out:json][timeout:30];
(
  way["building"](around:${radius},${lat},${lng});
  relation["building"](around:${radius},${lat},${lng});
);
out geom;
  `.trim()
}

function slimFeature(f: GeoJSONFeature): GeoJSONFeature | null {
  if (f.geometry?.type !== 'Polygon' && f.geometry?.type !== 'MultiPolygon') return null
  const props = f.properties || {}
  const slim: Record<string, unknown> = {}
  if (props['building:levels'] != null) slim['building:levels'] = props['building:levels']
  if (props.height != null) slim.height = props.height
  return {
    type: 'Feature',
    geometry: f.geometry,
    properties: Object.keys(slim).length ? slim : undefined,
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchWithRetry(
  lat: number,
  lng: number,
  radius: number,
  limit: number
): Promise<GeoJSONFC> {
  const query = buildOverpassQuery(lat, lng, radius)
  const body = `data=${encodeURIComponent(query)}`
  let lastError: Error | null = null

  for (let attempt = 0; attempt < 6; attempt++) {
    const endpointIndex = attempt % OVERPASS_ENDPOINTS.length
    const url = OVERPASS_ENDPOINTS[endpointIndex]
    const baseDelay = Math.min(2 ** (attempt + 1) * 1000, 64000)
    const jitter = Math.random() * 1000

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body,
      })

      if (response.ok) {
        const data = (await response.json()) as OverpassResponse
        const convert = (osmtogeojson as { default?: (x: unknown) => GeoJSONFC }).default ?? (osmtogeojson as (x: unknown) => GeoJSONFC)
        const geojson = convert(data)
        const features = (geojson?.features || [])
          .filter((f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon')
          .map(slimFeature)
          .filter(Boolean)
        return {
          type: 'FeatureCollection',
          features: features.slice(0, limit),
        }
      }

      const status = response.status
      if (status === 429 || status === 504 || status >= 500) {
        lastError = new Error(`Overpass ${status} ${response.statusText}`)
        await sleep(baseDelay + jitter)
        continue
      }

      throw new Error(`Overpass ${status} ${response.statusText}`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < 5) {
        await sleep(baseDelay + jitter)
      } else {
        throw lastError
      }
    }
  }

  throw lastError || new Error('Fetch failed')
}

function buildingsFileExists(stopId: string, root: string): boolean {
  return existsSync(join(root, OUTPUT_DIR, `${stopId}.geojson`))
}

/** True if file is missing, not FeatureCollection, or has properties.error (placeholder). */
async function isInvalidGeoJSON(filePath: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const data = JSON.parse(raw) as { type?: string; features?: unknown; properties?: Record<string, unknown> }
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) return true
    if (data.properties?.error != null) return true
    return false
  } catch {
    return true
  }
}

async function saveGeoJSON(
  stopId: string,
  geojson: GeoJSONFC,
  root: string,
  meta?: { centerLat: number; centerLng: number; radiusM: number }
): Promise<void> {
  if (meta) {
    geojson.properties = {
      ...geojson.properties,
      centerLat: meta.centerLat,
      centerLng: meta.centerLng,
      radiusM: meta.radiusM,
      generatedAt: new Date().toISOString(),
    }
  }
  const dir = join(root, OUTPUT_DIR)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, `${stopId}.geojson`), JSON.stringify(geojson, null, 2), 'utf8')
}

async function main() {
  const opts = parseArgs()
  const root = process.cwd()
  const outputPath = join(root, OUTPUT_DIR)
  const stopsPath = join(root, opts.input)

  if (opts.wipe) {
    if (existsSync(outputPath)) {
      rmSync(outputPath, { recursive: true, force: true })
    }
    mkdirSync(outputPath, { recursive: true })
    console.log('[Buildings] WIPED output directory')
  }

  console.log('[Buildings] Starting refresh...')
  console.log(`  --input ${opts.input} --radius ${opts.radius} --limit ${opts.limit} --only-missing ${opts.onlyMissing} --refetch-invalid ${opts.refetchInvalid} --strict ${opts.strict} --between-ms ${opts.betweenMs}`)
  if (opts.from != null && opts.to != null) {
    console.log(`  --from ${opts.from} --to ${opts.to}`)
  }
  if (opts.ordersFile) {
    console.log(`  --orders-file ${opts.ordersFile}`)
  }

  if (!existsSync(stopsPath)) {
    console.error(`[Buildings] ❌ ${opts.input} not found. Run: npm run data:all`)
    process.exit(1)
  }

  let stops: Stop[] = JSON.parse(await fs.readFile(stopsPath, 'utf8'))
  stops = stops.filter((s) => s.lat != null && s.lng != null)

  if (opts.from != null && opts.to != null) {
    stops = stops.filter((s) => s.order >= opts.from! && s.order <= opts.to!)
    console.log(`[Buildings] Filtered to stops order ${opts.from}..${opts.to}: ${stops.length} stops`)
  }

  if (opts.ordersFile) {
    const ordersPath = join(root, opts.ordersFile)
    if (!existsSync(ordersPath)) {
      console.error(`[Buildings] ❌ Orders file not found: ${opts.ordersFile}`)
      process.exit(1)
    }
    const ordersData = JSON.parse(await fs.readFile(ordersPath, 'utf8')) as { orders?: number[] }
    const ordersSet = new Set(ordersData.orders ?? [])
    stops = stops.filter((s) => ordersSet.has(s.order))
    console.log(`[Buildings] Filtered by --orders-file: ${stops.length} stops`)
  }

  const toProcess: Stop[] = []
  for (const s of stops) {
    if (opts.onlyMissing) {
      if (!buildingsFileExists(s.id, root)) {
        toProcess.push(s)
        continue
      }
      if (opts.refetchInvalid) {
        const path = join(root, OUTPUT_DIR, `${s.id}.geojson`)
        if (await isInvalidGeoJSON(path)) {
          toProcess.push(s)
          continue
        }
      }
      continue
    }
    toProcess.push(s)
  }

  console.log(`[Buildings] Processing ${toProcess.length} stops (${stops.length - toProcess.length} skipped)`)

  let processed = 0
  let errors = 0
  let zeroFeatureStops = 0

  for (let i = 0; i < toProcess.length; i++) {
    const stop = toProcess[i]
    const [lat, lng] = normalizeLatLng(stop.lat!, stop.lng!)

    try {
      const geojson = await fetchWithRetry(lat, lng, opts.radius, opts.limit)
      await saveGeoJSON(stop.id, geojson, root, {
        centerLat: stop.lat!,
        centerLng: stop.lng!,
        radiusM: opts.radius,
      })
      const featCount = geojson.features.length
      if (featCount === 0) zeroFeatureStops++
      console.log(`[Buildings] ${i + 1}/${toProcess.length} ${stop.city} - ${stop.venue} (${featCount} buildings)`)
      processed++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Buildings] ❌ ${stop.city} (${stop.id}): ${msg}`)
      errors++

      const placeholder: GeoJSONFC = {
        type: 'FeatureCollection',
        features: [],
        properties: { error: msg, fetchedAt: new Date().toISOString() },
      }
      await saveGeoJSON(stop.id, placeholder, root)
    }

    if (i < toProcess.length - 1) {
      await sleep(opts.betweenMs)
    }
  }

  console.log(`[Buildings] Done. Processed: ${processed}, Errors: ${errors}, Zero-feature: ${zeroFeatureStops}`)
  if (opts.strict && (errors > 0 || zeroFeatureStops > 0)) {
    process.exit(1)
  }
  if (errors > 0 && !opts.strict) {
    console.log('[Buildings] Re-run with --strict to fail on errors')
  }
}

main().catch((err) => {
  console.error('[Buildings] Fatal:', err)
  process.exit(1)
})
