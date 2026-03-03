import type { Stop } from './types'

export async function loadStops(): Promise<Stop[]> {
  try {
    let response = await fetch('/data/stops.all.json')
    if (!response.ok) {
      response = await fetch('/data/stops.json')
    }
    if (!response.ok) {
      throw new Error(
        `Failed to load stops: ${response.status}. Run "npm run data:all" to generate from Excel.`
      )
    }

    const stops: Stop[] = await response.json()

    if (!Array.isArray(stops)) {
      throw new Error('Invalid stops data: expected array')
    }

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