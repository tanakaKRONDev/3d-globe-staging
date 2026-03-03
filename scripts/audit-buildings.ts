#!/usr/bin/env node

/**
 * Audits building GeoJSON files: compares each file's centroid to the stop's lat/lng
 * (venue coords from public/data/stops.all.json). Threshold 1500m.
 * Writes public/data/buildings/_mismatched_orders.json for refetching only mismatched stops.
 */

import { promises as fs, existsSync } from 'fs'
import { join } from 'path'

const STOPS_PATH = 'public/data/stops.all.json'
const BUILDINGS_DIR = 'public/data/buildings'
const OUTPUT_FILE = 'public/data/buildings/_mismatched_orders.json'
const MAX_POINTS = 5000
const THRESHOLD_M = 1500

interface Stop {
  id: string
  order: number
  city: string
  venue: string
  lat?: number | null
  lng?: number | null
}

interface GeoJSONFC {
  type: string
  features: Array<{
    type: string
    geometry?: { type: string; coordinates?: unknown }
    properties?: Record<string, unknown>
  }>
  properties?: Record<string, unknown>
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000 // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function extractCoordsFromGeometry(
  geometry: { type: string; coordinates?: unknown },
  out: [number, number][]
): void {
  if (!geometry.coordinates) return
  const coords = geometry.coordinates

  if (geometry.type === 'Point') {
    const c = coords as number[]
    if (c.length >= 2) out.push([c[0], c[1]])
    return
  }
  if (geometry.type === 'LineString') {
    const arr = coords as number[][]
    for (const c of arr) {
      if (c.length >= 2) out.push([c[0], c[1]])
    }
    return
  }
  if (geometry.type === 'Polygon') {
    const arr = coords as number[][][]
    for (const ring of arr) {
      for (const c of ring) {
        if (c.length >= 2) out.push([c[0], c[1]])
      }
    }
    return
  }
  if (geometry.type === 'MultiPolygon') {
    const arr = coords as number[][][][]
    for (const poly of arr) {
      for (const ring of poly) {
        for (const c of ring) {
          if (c.length >= 2) out.push([c[0], c[1]])
        }
      }
    }
  }
}

function samplePoints(features: GeoJSONFC['features'], maxPoints: number): [number, number][] {
  const out: [number, number][] = []
  for (const f of features) {
    if (!f.geometry) continue
    extractCoordsFromGeometry(f.geometry, out)
    if (out.length >= maxPoints) break
  }
  if (out.length > maxPoints) {
    const step = out.length / maxPoints
    const sampled: [number, number][] = []
    for (let i = 0; i < maxPoints; i++) {
      const idx = Math.min(Math.floor(i * step), out.length - 1)
      sampled.push(out[idx])
    }
    return sampled
  }
  return out
}

function centroid(points: [number, number][]): { lat: number; lng: number } | null {
  if (points.length === 0) return null
  let sumLng = 0
  let sumLat = 0
  for (const [lng, lat] of points) {
    sumLng += lng
    sumLat += lat
  }
  return { lng: sumLng / points.length, lat: sumLat / points.length }
}

async function main() {
  const root = process.cwd()
  const stopsPath = join(root, STOPS_PATH)
  const buildingsDir = join(root, BUILDINGS_DIR)

  if (!existsSync(stopsPath)) {
    console.error(`[Audit] ❌ ${STOPS_PATH} not found. Run: npm run data:all`)
    process.exit(1)
  }

  const stops: Stop[] = JSON.parse(await fs.readFile(stopsPath, 'utf8'))
  const withCoords = stops.filter((s) => s.lat != null && s.lng != null)

  const rows: Array<{
    order: number
    id: string
    city: string
    venue: string
    stopLat: number
    stopLng: number
    centroidLat: number | null
    centroidLng: number | null
    distanceMeters: number | null
    mismatched: boolean
  }> = []
  const mismatchedOrders: number[] = []

  for (const stop of withCoords) {
    const filePath = join(buildingsDir, `${stop.id}.geojson`)
    const stopLat = stop.lat!
    const stopLng = stop.lng!

    if (!existsSync(filePath)) {
      rows.push({
        order: stop.order,
        id: stop.id,
        city: stop.city,
        venue: stop.venue,
        stopLat,
        stopLng,
        centroidLat: null,
        centroidLng: null,
        distanceMeters: null,
        mismatched: false,
      })
      continue
    }

    let centroidLat: number | null = null
    let centroidLng: number | null = null
    let distanceMeters: number | null = null
    let mismatched = false

    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const geojson = JSON.parse(raw) as GeoJSONFC
      if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
        distanceMeters = null
        mismatched = true
        mismatchedOrders.push(stop.order)
      } else {
        const centerLat = geojson.properties?.centerLat
        const centerLng = geojson.properties?.centerLng
        if (typeof centerLat === 'number' && typeof centerLng === 'number') {
          distanceMeters = haversineMeters(stopLat, stopLng, centerLat, centerLng)
          if (distanceMeters > THRESHOLD_M) {
            mismatched = true
            mismatchedOrders.push(stop.order)
          }
          centroidLat = centerLat
          centroidLng = centerLng
        } else {
          const points = samplePoints(geojson.features, MAX_POINTS)
          const c = centroid(points)
          if (c) {
            centroidLat = c.lat
            centroidLng = c.lng
            distanceMeters = haversineMeters(stopLat, stopLng, c.lat, c.lng)
            if (distanceMeters > THRESHOLD_M) {
              mismatched = true
              mismatchedOrders.push(stop.order)
            }
          }
        }
      }
    } catch {
      distanceMeters = null
      mismatched = true
      mismatchedOrders.push(stop.order)
    }

    rows.push({
      order: stop.order,
      id: stop.id,
      city: stop.city,
      venue: stop.venue,
      stopLat,
      stopLng,
      centroidLat,
      centroidLng,
      distanceMeters,
      mismatched,
    })
  }

  // Report table
  console.log('')
  console.log('Buildings audit (threshold =', THRESHOLD_M, 'm)')
  console.log('')
  const header = 'order\tid\tcity\tvenue\tstopLat\tstopLng\tcentroidLat\tcentroidLng\tdistanceM\tmismatch'
  console.log(header)
  for (const r of rows) {
    const centroidLat = r.centroidLat != null ? r.centroidLat.toFixed(5) : '—'
    const centroidLng = r.centroidLng != null ? r.centroidLng.toFixed(5) : '—'
    const dist = r.distanceMeters != null ? r.distanceMeters.toFixed(0) : '—'
    console.log(
      `${r.order}\t${r.id}\t${r.city}\t${r.venue}\t${r.stopLat.toFixed(5)}\t${r.stopLng.toFixed(5)}\t${centroidLat}\t${centroidLng}\t${dist}\t${r.mismatched ? 'YES' : 'no'}`
    )
  }
  console.log('')
  console.log(`Mismatched (distance > ${THRESHOLD_M}m or invalid file): ${mismatchedOrders.length}`)
  console.log('Orders:', mismatchedOrders.join(', ') || 'none')
  console.log('')

  await fs.mkdir(buildingsDir, { recursive: true })
  await fs.writeFile(
    join(root, OUTPUT_FILE),
    JSON.stringify({ thresholdM: THRESHOLD_M, orders: mismatchedOrders }, null, 2),
    'utf8'
  )
  console.log(`Written: ${OUTPUT_FILE}`)
}

main().catch((err) => {
  console.error('[Audit] Fatal:', err)
  process.exit(1)
})
