/**
 * Generates stops.all.json from Excel sheet "Stops".
 * ALWAYS uses Excel Latitude/Longitude columns (venue coords). No city-center fallback.
 * Headers: Order, Timeline, Region, City, Country, Venue, Address, Latitude, Longtitude, Notes.
 */
import XLSXModule from 'xlsx'
const XLSX = XLSXModule.default || XLSXModule
import { promises as fs, existsSync } from 'fs'
import { join } from 'path'

const SHEET_NAME = 'Stops'

interface StopBullets {
  base: { ticketPrice?: string; gross?: string; netOrGuarantee?: string; notes?: string }
  upside: { ticketPrice?: string; gross?: string; netOrGuarantee?: string; notes?: string }
}

interface Stop {
  id: string
  order: number
  timeline: string
  region: string
  city: string
  countryCode: string
  venue: string
  address: string
  lat: number
  lng: number
  notes: string
  capacityMin?: number | null
  capacityMax?: number | null
  bullets: StopBullets
}

const TBD_BULLETS: StopBullets = {
  base: { ticketPrice: 'TBD', gross: 'TBD', netOrGuarantee: 'TBD', notes: 'TBD' },
  upside: { ticketPrice: 'TBD', gross: 'TBD', netOrGuarantee: 'TBD', notes: 'TBD' },
}

function slug(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

/** Trim + case-insensitive match. Tries exact then includes. */
function findColumn(headers: string[], ...patterns: string[]): number {
  const norm = (h: string) => (h || '').toString().trim().toLowerCase()
  const row = headers.map(norm)
  for (const p of patterns) {
    const q = p.toLowerCase()
    const i = row.findIndex((h) => h === q)
    if (i >= 0) return i
  }
  for (const p of patterns) {
    const q = p.toLowerCase()
    const i = row.findIndex((h) => h.includes(q) || q.includes(h))
    if (i >= 0) return i
  }
  return -1
}

function isValidLat(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
}

function isValidLng(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180
}

function cellStr(row: unknown[], col: number): string {
  if (col < 0) return ''
  const v = row[col]
  if (v == null) return ''
  return String(v).trim()
}

function cellNum(row: unknown[], col: number): number | null {
  const s = cellStr(row, col)
  if (s === '') return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

async function generateStops() {
  try {
    console.log('🚀 Generating stops from Excel sheet "' + SHEET_NAME + '"...')

    const excelPath = join(process.cwd(), 'data', 'Cities, Venues.xlsx')
    if (!existsSync(excelPath)) {
      console.error('❌ Excel file not found at:', excelPath)
      throw new Error('Place data/Cities, Venues.xlsx in the repo')
    }

    const workbook = XLSX.readFile(excelPath)
    if (!workbook.SheetNames.includes(SHEET_NAME)) {
      console.error('❌ Sheet "' + SHEET_NAME + '" not found. Sheets:', workbook.SheetNames.join(', '))
      process.exit(1)
    }

    const worksheet = workbook.Sheets[SHEET_NAME]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][]

    const headerRow = (data[0] || []).map((c) => String(c ?? '').trim())
    const orderCol = findColumn(headerRow, 'order')
    const timelineCol = findColumn(headerRow, 'timeline')
    const regionCol = findColumn(headerRow, 'region')
    const cityCol = findColumn(headerRow, 'city')
    const countryCol = findColumn(headerRow, 'country')
    const venueCol = findColumn(headerRow, 'venue')
    const addressCol = findColumn(headerRow, 'address')
    const latCol = findColumn(headerRow, 'latitude', 'lat')
    const lngCol = findColumn(headerRow, 'longtitude', 'longitude', 'lng', 'lon')
    const notesCol = findColumn(headerRow, 'notes')

    if (orderCol < 0) {
      console.error('❌ Required column "Order" not found. Headers:', headerRow.join(' | '))
      process.exit(1)
    }
    if (cityCol < 0 || venueCol < 0) {
      console.error('❌ Required columns "City" and "Venue" not found. Headers:', headerRow.join(' | '))
      process.exit(1)
    }
    if (latCol < 0) {
      console.error('❌ Latitude column not found (accept: "Latitude", "Lat"). Headers:', headerRow.join(' | '))
      process.exit(1)
    }
    if (lngCol < 0) {
      console.error('❌ Longitude column not found (accept: "Longtitude", "Longitude", "Lng", "Lon"). Headers:', headerRow.join(' | '))
      process.exit(1)
    }

    const dataRows = data.slice(1).filter((r) => r && Array.isArray(r) && r.length > 0) as unknown[][]
    const totalRowsRead = dataRows.length

    const coordErrors: string[] = []
    let skippedMissingOrder = 0
    let skippedMissingCity = 0
    const seenIds = new Set<string>()
    const stops: Stop[] = []

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const rowNum = i + 2
      const orderVal = cellNum(row, orderCol)
      const city = cellStr(row, cityCol)
      const venueStr = cellStr(row, venueCol) || 'TBD Venue'
      const latVal = cellNum(row, latCol)
      const lngVal = cellNum(row, lngCol)

      if (orderVal == null || !Number.isInteger(orderVal) || orderVal < 1) {
        skippedMissingOrder++
        continue
      }
      if (!city) {
        skippedMissingCity++
        continue
      }
      if (latVal == null || lngVal == null) {
        coordErrors.push(`Row ${rowNum} (order ${orderVal}, ${city} - ${venueStr}): missing lat or lng`)
        continue
      }
      if (!isValidLat(latVal) || !isValidLng(lngVal)) {
        coordErrors.push(
          `Row ${rowNum} (order ${orderVal}, ${city} - ${venueStr}): invalid coords (|lat|<=90, |lng|<=180) got lat=${latVal} lng=${lngVal}`
        )
        continue
      }

      const timeline = timelineCol >= 0 ? cellStr(row, timelineCol) : ''
      const region = regionCol >= 0 ? cellStr(row, regionCol) : ''
      const countryCode = countryCol >= 0 ? cellStr(row, countryCol) : ''
      const venue = venueStr
      const address = addressCol >= 0 ? cellStr(row, addressCol) : ''
      const notes = notesCol >= 0 ? cellStr(row, notesCol) : ''

      const order = Math.floor(Number(orderVal))
      const stopId = slug(`${order}-${city}-${venue}`)
      const uniqueId = seenIds.has(stopId) ? `${stopId}-${order}` : stopId
      seenIds.add(uniqueId)

      const stop: Stop = {
        id: uniqueId,
        order,
        timeline,
        region,
        city,
        countryCode: countryCode || 'US',
        venue,
        address,
        lat: latVal,
        lng: lngVal,
        notes,
        bullets: { ...TBD_BULLETS },
      }

      stops.push(stop)
    }

    if (coordErrors.length > 0) {
      console.error('')
      console.error('❌ Build failed: missing or invalid coordinates (we need venue lat/lng for buildings).')
      coordErrors.forEach((e) => console.error('   ', e))
      process.exit(1)
    }

    const outputDir = join(process.cwd(), 'public', 'data')
    if (!existsSync(outputDir)) {
      await fs.mkdir(outputDir, { recursive: true })
    }

    const outputPath = join(outputDir, 'stops.all.json')
    await fs.writeFile(outputPath, JSON.stringify(stops, null, 2))

    const emitted = stops.length
    const skipped = skippedMissingOrder + skippedMissingCity

    console.log('')
    console.log('📊 Validation report:')
    console.log(`   Total rows read: ${totalRowsRead}`)
    console.log(`   Emitted: ${emitted}`)
    console.log(`   Skipped (missing order / city): ${skipped}`)
    console.log(`      - missing or invalid order: ${skippedMissingOrder}`)
    console.log(`      - missing city: ${skippedMissingCity}`)
    console.log('')

    const previewCities = ['Chicago', 'Toronto', 'Los Angeles']
    const preview = stops.filter(
      (s) =>
        previewCities.some((c) => s.city.includes(c) || s.venue.includes(c))
    )
    if (preview.length > 0) {
      console.log('📍 Sanity preview (venue coords from Excel):')
      for (const s of preview) {
        console.log(`   order=${s.order} city=${s.city} venue=${s.venue} lat=${s.lat} lng=${s.lng}`)
      }
      console.log('')
    }

    console.log(`🎉 Generated ${emitted} stops`)
    console.log(`📁 Output: ${outputPath}`)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

generateStops()
