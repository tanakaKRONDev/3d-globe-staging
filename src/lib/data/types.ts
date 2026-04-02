export interface StopBullets {
  base: { ticketPrice?: string; gross?: string; netOrGuarantee?: string; notes?: string }
  upside: { ticketPrice?: string; gross?: string; netOrGuarantee?: string; notes?: string }
}

export interface Stop {
  id: string
  order: number
  city: string
  countryCode: string
  venue: string
  timeline?: string
  region?: string
  address?: string
  notes?: string
  icon?: string
  capacityMin?: number | null
  capacityMax?: number | null
  lat: number | null
  lng: number | null
  bullets: StopBullets | string[]
}

export interface Artist {
  id?: string
  slug: string | null
  name: string
  title: string
  subtitle: string | null
  accentColor: string
  accentMuted: string | null
  accentDark: string | null
  logoUrl: string | null
}

export type Scenario = 'base' | 'upside'

export interface StopDetails {
  capacity: string
  ticketPrice: string
  projectedGross: string
  netGuarantee: string
  notes: string
  marketRationale: string
}

export interface AppState {
  stops: Stop[]
  selectedStopId: string | null
  scenario: Scenario
  loading: boolean
  error: string | null
}