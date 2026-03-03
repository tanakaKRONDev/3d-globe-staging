#!/usr/bin/env node
/**
 * Seeds D1 with stops from public/data/stops.all.json.
 * Run after db:migrate. Uses wrangler d1 execute.
 */
import { promises as fs } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const STOPS_JSON = 'public/data/stops.all.json'
const DB_NAME = 'tour-stops'

function escape(str: string | null | undefined): string {
  if (str == null) return 'NULL'
  return "'" + String(str).replace(/'/g, "''") + "'"
}

function escapeNum(n: number | null | undefined): string {
  if (n == null || typeof n !== 'number' || !Number.isFinite(n)) return 'NULL'
  return String(n)
}

interface StopJson {
  id: string
  order: number
  city: string
  countryCode?: string
  venue: string
  address?: string | null
  lat?: number | null
  lng?: number | null
  timeline?: string | null
  notes?: string | null
  capacityMin?: number | null
  capacityMax?: number | null
}

async function main() {
  const root = process.cwd()
  const stopsPath = join(root, STOPS_JSON)

  const raw = await fs.readFile(stopsPath, 'utf8')
  const stops = JSON.parse(raw) as StopJson[]

  const capacityStr = (s: StopJson): string | null => {
    const min = s.capacityMin
    const max = s.capacityMax
    if (min != null && max != null) return `${min}-${max}`
    if (min != null) return String(min)
    if (max != null) return String(max)
    return null
  }

  const statements: string[] = []
  for (const s of stops) {
    const country = s.countryCode ?? ''
    const capacity = capacityStr(s)
    statements.push(`
INSERT INTO stops (id, "order", city, country, venue, address, lat, lng, timeline, notes, capacity, updated_at)
VALUES (
  ${escape(s.id)},
  ${s.order},
  ${escape(s.city)},
  ${escape(country)},
  ${escape(s.venue)},
  ${escape(s.address)},
  ${escapeNum(s.lat)},
  ${escapeNum(s.lng)},
  ${escape(s.timeline)},
  ${escape(s.notes)},
  ${escape(capacity)},
  datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
  "order" = excluded."order",
  city = excluded.city,
  country = excluded.country,
  venue = excluded.venue,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  timeline = excluded.timeline,
  notes = excluded.notes,
  capacity = excluded.capacity,
  updated_at = datetime('now');
`)
  }

  const sql = statements.join('\n')
  const tmpPath = join(root, '.d1-seed-tmp.sql')
  await fs.writeFile(tmpPath, sql, 'utf8')

  const remote = process.argv.includes('--remote')
  try {
    execSync(`npx wrangler d1 execute ${DB_NAME} ${remote ? '--remote' : '--local'} --file=${tmpPath}`, {
      stdio: 'inherit',
      cwd: root,
    })
    console.log(`[seed-d1] Seeded ${stops.length} stops into ${DB_NAME} (${remote ? 'remote' : 'local'})`)
  } finally {
    await fs.unlink(tmpPath).catch(() => {})
  }
}

main().catch((err) => {
  console.error('[seed-d1]', err)
  process.exit(1)
})
