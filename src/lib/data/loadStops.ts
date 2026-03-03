import type { Stop } from './types'

const TBD_BULLETS = {
  base: { ticketPrice: 'TBD', gross: 'TBD', netOrGuarantee: 'TBD', notes: 'TBD' },
  upside: { ticketPrice: 'TBD', gross: 'TBD', netOrGuarantee: 'TBD', notes: 'TBD' },
} as const

/** Normalize API or JSON stop into Stop shape (countryCode, bullets, etc.). */
function normalizeStop(raw: Record<string, unknown>): Stop {
  const country = (raw.country ?? raw.countryCode ?? '') as string
  return {
    id: String(raw.id ?? ''),
    order: typeof raw.order === 'number' ? raw.order : Number(raw.stop_order) || 0,
    city: String(raw.city ?? ''),
    countryCode: country,
    venue: String(raw.venue ?? ''),
    timeline: raw.timeline != null ? String(raw.timeline) : undefined,
    region: raw.region != null ? String(raw.region) : undefined,
    address: raw.address != null ? String(raw.address) : undefined,
    notes: raw.notes != null ? String(raw.notes) : undefined,
    lat: raw.lat != null && Number.isFinite(Number(raw.lat)) ? Number(raw.lat) : null,
    lng: raw.lng != null && Number.isFinite(Number(raw.lng)) ? Number(raw.lng) : null,
    capacityMin: raw.capacityMin != null ? Number(raw.capacityMin) : undefined,
    capacityMax: raw.capacityMax != null ? Number(raw.capacityMax) : undefined,
    bullets: (raw.bullets as Stop['bullets']) ?? TBD_BULLETS,
  }
}

export async function loadStops(): Promise<Stop[]> {
  try {
    let response = await fetch('/api/stops')
    if (!response.ok) {
      response = await fetch('/data/stops.all.json')
    }
    if (!response.ok) {
      response = await fetch('/data/stops.json')
    }
    if (!response.ok) {
      throw new Error(
        `Failed to load stops: ${response.status}. Run "npm run data:all" to generate from Excel.`
      )
    }

    const raw = (await response.json()) as unknown
    const arr = Array.isArray(raw) ? raw : []
    const stops = arr.map((row) => normalizeStop(row as Record<string, unknown>))

    const seenOrders = new Set<number>()
    stops.forEach((stop, index) => {
      if (!stop.id || !stop.city || !stop.venue || typeof stop.order !== 'number') {
        throw new Error(`Invalid stop data at index ${index}: missing required fields`)
      }
      if (seenOrders.has(stop.order)) {
        throw new Error(`Invalid stop data: duplicate order ${stop.order}`)
      }
      seenOrders.add(stop.order)
    })

    return [...stops].sort((a, b) => a.order - b.order)
  } catch (error) {
    console.error('Error loading stops:', error)
    throw error
  }
}

export function formatCapacity(capacityMin: number | null, capacityMax: number | null): string {
  if (!capacityMin && !capacityMax) {
    return 'TBD'
  }
  
  if (capacityMin === capacityMax) {
    return capacityMin?.toLocaleString() || 'TBD'
  }
  
  if (capacityMin && capacityMax) {
    return `${capacityMin.toLocaleString()} - ${capacityMax.toLocaleString()}`
  }
  
  return capacityMin?.toLocaleString() || capacityMax?.toLocaleString() || 'TBD'
}

export function extractStopDetails(stop: Stop, scenario: 'base' | 'upside'): {
  capacity: string
  ticketPrice: string
  projectedGross: string
  netGuarantee: string
  notes: string
  marketRationale: string
} {
  // New bullets format: { base: {...}, upside: {...} }
  const bullets = stop.bullets
  if (bullets && typeof bullets === 'object' && !Array.isArray(bullets)) {
    const b = scenario === 'upside' ? bullets.upside : bullets.base
    return {
      capacity: formatCapacity(stop.capacityMin ?? null, stop.capacityMax ?? null),
      ticketPrice: b?.ticketPrice ?? 'TBD',
      projectedGross: b?.gross ?? 'TBD',
      netGuarantee: b?.netOrGuarantee ?? 'TBD',
      notes: b?.notes ?? 'TBD',
      marketRationale:
        scenario === 'upside'
          ? 'Strong market demand, premium positioning'
          : 'Conservative estimates based on historical data',
    }
  }

  // Legacy bullets array format
  const arr = Array.isArray(bullets) ? bullets : []
  const findBullet = (prefix: string): string => {
    const bullet = arr.find((b) => String(b).toLowerCase().startsWith(prefix.toLowerCase()))
    if (!bullet) return 'TBD'
    const colonIndex = String(bullet).indexOf(':')
    if (colonIndex === -1) return String(bullet)
    return String(bullet).substring(colonIndex + 1).trim()
  }

  return {
    capacity: formatCapacity(stop.capacityMin ?? null, stop.capacityMax ?? null),
    ticketPrice: findBullet('Ticket Price'),
    projectedGross: findBullet('Gross Revenue'),
    netGuarantee: findBullet('Net/Guarantee'),
    notes: findBullet('Notes'),
    marketRationale:
      scenario === 'upside'
        ? 'Strong market demand, premium positioning'
        : 'Conservative estimates based on historical data',
  }
}