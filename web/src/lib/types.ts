export type LatLng = {
  lat: number
  lng: number
}

export type LotSummary = {
  id: string
  name: string
  code?: string | null
  centroid: LatLng | null
  permit_types: string[]
  latestCap?: {
    capacity: number
    occupied: number
    source: string
    observed_at: string
  } | null
  latestImage?: {
    lotId: string
    url: string
    captured_at: string
    source: string
  } | null
  pricing?: string | Record<string, any>
  permits_required?: string[]
  counts: {
    total: number
    occupied: number
    open: number
    unknown: number
  }
  distanceMeters?: number | null
  metadata?: Record<string, any>
}

export type Stall = {
  id: string
  polygon: [number, number][]
  permit: string[]
  status: 'open' | 'occupied' | 'unknown'
  confidence?: number
}
