import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import type { LotSummary } from '../lib/types'
import { useApp } from '../state/store'

function geometryContainsPoint(geometry: any, point: [number, number]) {
  if (!geometry) return false
  const ringContains = (ring: [number, number][]) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const xi = ring[i][0]
      const yi = ring[i][1]
      const xj = ring[j][0]
      const yj = ring[j][1]
      const intersect = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
      if (intersect) inside = !inside
    }
    return inside
  }
  if (geometry.type === 'Polygon') return ringContains(geometry.coordinates[0])
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((poly: [number, number][][]) => ringContains(poly[0]))
  return false
}

function computeCentroidLonLat(geometry: any): [number, number] | null {
  if (!geometry) return null
  const average = (coords: [number, number][]) => {
    let lat = 0
    let lng = 0
    let count = 0
    for (const [lon, la] of coords) {
      lat += la
      lng += lon
      count += 1
    }
    return count ? ([lat / count, lng / count] as [number, number]) : null
  }
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates[1], geometry.coordinates[0]]
    case 'Polygon':
      return average(geometry.coordinates[0])
    case 'MultiPolygon':
      for (const poly of geometry.coordinates) {
        const center = average(poly[0])
        if (center) return center
      }
      return null
    default:
      return null
  }
}

type ObservedCounts = LotSummary['counts']

export default function LotDetailMap({
  lot,
  onCountsChange,
}: {
  lot: LotSummary
  onCountsChange?: (counts: ObservedCounts | null, observedAt?: string) => void
}) {
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
  const setSelectedLotId = useApp((s) => s.setSelectedLotId)

  useEffect(() => {
    setSelectedLotId(lot.id)
    return () => setSelectedLotId(undefined)
  }, [lot.id, setSelectedLotId])

  const { data: spaces } = useQuery({
    queryKey: ['parking-spaces-osu'],
    queryFn: async () => {
      const res = await fetch(`${base}/osm/osu_campus_parking_spaces.geojson`)
      if (!res.ok) throw new Error('Failed to load parking spaces')
      return res.json()
    },
  })
  const { data: lotsGeo } = useQuery({
    queryKey: ['parking-lots-osu'],
    queryFn: async () => {
      const res = await fetch(`${base}/osm/osu_campus_parking_lots.geojson`)
      if (!res.ok) throw new Error('Failed to load parking lots')
      return res.json()
    },
  })
  const { data: occupancy } = useQuery({
    queryKey: ['lot-occupancy'],
    queryFn: async () => {
      const res = await fetch(`${base}/api/occupancy`)
      if (!res.ok) throw new Error('Failed to load occupancy')
      return res.json()
    },
  })
  const occupancyObservedAt = typeof occupancy?.fetchedAt === 'string' ? occupancy.fetchedAt : null

  const occupiedSet = useMemo(() => {
    const slots = occupancy?.slots
    if (!Array.isArray(slots)) return new Set<string>()
    return new Set(slots.filter((slot: any) => slot?.occupied).map((slot: any) => `way/${slot.id}`))
  }, [occupancy])

  const lotFeature = useMemo(() => {
    if (!lotsGeo?.features) return null
    const osmId = lot.metadata?.osmId
    if (!osmId) return null
    return lotsGeo.features.find((ft: any) => ft.properties?.id === osmId) || null
  }, [lotsGeo, lot])

  const lotSpaces = useMemo(() => {
    if (!spaces?.features || !lotFeature) return null
    const features = spaces.features
      .filter((feature: any) => {
        const center = computeCentroidLonLat(feature.geometry)
        if (!center) return false
        return geometryContainsPoint(lotFeature.geometry, [center[1], center[0]])
      })
      .map((feature: any) => {
        const id = feature.properties?.id
        if (occupiedSet.has(id)) {
          return {
            ...feature,
            properties: {
              ...feature.properties,
              _color: '#dc2626',
              _fill: '#f87171',
            },
          }
        }
        return feature
      })
    return { ...spaces, features }
  }, [spaces, lotFeature, occupiedSet])

  useEffect(() => {
    if (!onCountsChange) return
    if (!lotSpaces?.features?.length) {
      onCountsChange(null, occupancyObservedAt ?? new Date().toISOString())
      return
    }
    const total = lotSpaces.features.length
    let occupied = 0
    for (const feature of lotSpaces.features) {
      const id = feature.properties?.id
      if (occupiedSet.has(id)) occupied += 1
    }
    const open = Math.max(total - occupied, 0)
    onCountsChange(
      {
        total,
        occupied,
        open,
        unknown: 0,
      },
      occupancyObservedAt ?? new Date().toISOString()
    )
  }, [lotSpaces, occupiedSet, onCountsChange, occupancyObservedAt])

  const center = useMemo<[number, number]>(() => {
    if (lot.centroid) return [lot.centroid.lat, lot.centroid.lng]
    const featureCenter = lotFeature ? computeCentroidLonLat(lotFeature.geometry) : null
    if (featureCenter) return [featureCenter[0], featureCenter[1]]
    const fallback = lotSpaces?.features?.length
      ? computeCentroidLonLat(lotSpaces.features[0].geometry)
      : null
    if (fallback) return [fallback[0], fallback[1]]
    return [40.00332, -83.0188]
  }, [lot.centroid, lotFeature, lotSpaces])

  return (
    <MapContainer
      center={center}
      zoom={18}
      className='w-full h-full min-h-[280px]'
    >
      <MapInvalidator />
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        maxZoom={19}
      />
      {lotFeature && (
        <GeoJSON
          data={lotFeature}
          style={{ color: '#2563eb', weight: 2, fillColor: '#60a5fa', fillOpacity: 0.15 }}
        />
      )}
      {lotSpaces && (
        <GeoJSON
          data={lotSpaces}
          style={(feature) => ({
            color: feature?.properties?._color || '#16a34a',
            fillColor: feature?.properties?._fill || '#22c55e',
            weight: 1,
            fillOpacity: 0.45,
          })}
        />
      )}
    </MapContainer>
  )
}

function MapInvalidator() {
  const map = useMap()
  useEffect(() => {
    const invalidate = () => map.invalidateSize()
    map.whenReady(invalidate)
    const timeout = window.setTimeout(invalidate, 250)
    window.addEventListener('resize', invalidate)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('resize', invalidate)
    }
  }, [map])
  return null
}
