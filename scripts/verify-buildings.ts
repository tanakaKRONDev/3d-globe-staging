/**
 * Strict verification: every stop must have a valid building GeoJSON file.
 * File must exist, be valid JSON, and contain at least 1 feature.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const STOPS_PATH = 'public/data/stops.all.json'
const BUILDINGS_DIR = 'public/data/buildings'

interface Stop {
  id: string
  order: number
  city: string
  venue: string
}

interface GeoJSONFC {
  type: string
  features?: unknown[]
}

function main(): void {
  const root = process.cwd()
  const stopsPath = join(root, STOPS_PATH)
  if (!existsSync(stopsPath)) {
    console.error(`[verify-buildings] ❌ ${STOPS_PATH} not found. Run: npm run data:all`)
    process.exit(1)
  }

  const stops: Stop[] = JSON.parse(readFileSync(stopsPath, 'utf8'))
  if (!Array.isArray(stops)) {
    console.error('[verify-buildings] ❌ stops.all.json must be an array')
    process.exit(1)
  }

  const totalStops = stops.length
  const present: string[] = []
  const missing: string[] = []
  const emptyOrInvalid: string[] = []

  for (const stop of stops) {
    const geojsonPath = join(root, BUILDINGS_DIR, `${stop.id}.geojson`)

    if (!existsSync(geojsonPath)) {
      missing.push(stop.id)
      continue
    }

    let data: GeoJSONFC
    try {
      const raw = readFileSync(geojsonPath, 'utf8')
      data = JSON.parse(raw) as GeoJSONFC
    } catch {
      emptyOrInvalid.push(stop.id)
      continue
    }

    const features = data?.features
    if (!Array.isArray(features) || features.length < 1) {
      emptyOrInvalid.push(stop.id)
      continue
    }

    present.push(stop.id)
  }

  // Report
  console.log('')
  console.log('[verify-buildings] Report:')
  console.log(`   Total stops: ${totalStops}`)
  console.log(`   Buildings present: ${present.length}`)
  console.log(`   Buildings missing: ${missing.length}`)
  console.log(`   Buildings empty/invalid: ${emptyOrInvalid.length}`)

  if (missing.length > 0) {
    console.log('   Missing IDs:')
    missing.forEach((id) => console.log(`     - ${id}`))
  }
  if (emptyOrInvalid.length > 0) {
    console.log('   Empty/invalid IDs:')
    emptyOrInvalid.forEach((id) => console.log(`     - ${id}`))
  }
  console.log('')

  if (missing.length > 0 || emptyOrInvalid.length > 0) {
    console.error('[verify-buildings] ❌ Verification failed')
    process.exit(1)
  }

  console.log('[verify-buildings] ✅ All stops have valid building GeoJSON files')
  process.exit(0)
}

main()
