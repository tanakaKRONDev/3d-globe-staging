#!/usr/bin/env node
/**
 * Reads public/data/stops.all.json and generates scripts/seed.generated.sql.
 * Idempotent: INSERT OR REPLACE.
 */
import { promises as fs } from 'fs'
import { join } from 'path'

const STOPS_JSON = 'public/data/stops.all.json'
const OUTPUT_SQL = 'scripts/seed.generated.sql'
const EXPECTED_COUNT = 55

function escape(str: string | null | undefined): string {
  if (str == null || str === '') return "''"
  return "'" + String(str).replace(/'/g, "''") + "'"
}

function escapeOrNull(str: string | null | undefined): string {
  if (str == null || str === '') return 'NULL'
  return "'" + String(str).replace(/'/g, "''") + "'"
}

interface StopJson {
  id: string
  order: number
  timeline?: string | null
  region?: string | null
  city: string
  countryCode?: string | null
  venue: string
  address?: string | null
  lat?: number | null
  lng?: number | null
  notes?: string | null
}

function validLat(n: number): boolean {
  return Number.isFinite(n) && n >= -90 && n <= 90
}

function validLng(n: number): boolean {
  return Number.isFinite(n) && n >= -180 && n <= 180
}

async function main() {
  const root = process.cwd()
  const stopsPath = join(root, STOPS_JSON)

  const raw = await fs.readFile(stopsPath, 'utf8')
  const stops = JSON.parse(raw) as StopJson[]

  if (stops.length !== EXPECTED_COUNT) {
    console.warn(`[generate-seed-sql] Expected ${EXPECTED_COUNT} records, got ${stops.length}. Continuing anyway.`)
  }

  const lines: string[] = []

  for (const s of stops) {
    const order = typeof s.order === 'number' && Number.isInteger(s.order) ? s.order : NaN
    if (!Number.isInteger(order)) {
      throw new Error(`Invalid order for stop ${s.id}: ${s.order}`)
    }
    const lat = s.lat
    const lng = s.lng
    if (!validLat(lat) || !validLng(lng)) {
      throw new Error(`Invalid lat/lng for stop ${s.id}: lat=${lat} lng=${lng}`)
    }
    const city = s.city ?? ''
    const country = s.countryCode ?? ''
    const venue = s.venue ?? ''
    const address = s.address ?? ''

    lines.push(`
INSERT OR REPLACE INTO stops (id, stop_order, timeline, region, city, country, venue, address, lat, lng, notes, updated_at)
VALUES (
  ${escape(s.id)},
  ${order},
  ${escape(s.timeline)},
  ${escape(s.region)},
  ${escape(city)},
  ${escape(country)},
  ${escape(venue)},
  ${escape(address)},
  ${lat},
  ${lng},
  ${escapeOrNull(s.notes)},
  datetime('now')
);`)
  }

  const sql = lines.join('\n')
  const outPath = join(root, OUTPUT_SQL)
  await fs.writeFile(outPath, sql, 'utf8')
  console.log(`[generate-seed-sql] Wrote ${stops.length} stops to ${OUTPUT_SQL}`)
}

main().catch((err) => {
  console.error('[generate-seed-sql]', err)
  process.exit(1)
})
