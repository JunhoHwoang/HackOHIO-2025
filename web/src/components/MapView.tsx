import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap, CircleMarker } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import { useApp } from '../state/store'
import { getLots } from '../lib/api'

const EARTH_RADIUS = 6378137

function FitToUser() {
  const map = useMap()
  const location = useApp((s) => s.userLocation)
  if (location) map.setView([location.lat, location.lng], 16)
  return null
}

function geometryIntersectsBounds(geometry: any, bounds: L.LatLngBounds) {
  if (!geometry) return false
  const contains = (lat: number, lng: number) => bounds.contains([lat, lng])
  switch (geometry.type) {
    case 'Point': {
      const [lng, lat] = geometry.coordinates
      return contains(lat, lng)
    }
    case 'Polygon':
      return geometry.coordinates.some((ring: [number, number][]) =>
        ring.some(([lng, lat]) => contains(lat, lng))
      )
    case 'MultiPolygon':
      return geometry.coordinates.some((poly: [number, number][][]) =>
        poly.some((ring: [number, number][]) => ring.some(([lng, lat]) => contains(lat, lng)))
      )
    default:
      return false
  }
}

function pointInRing(point: [number, number], ring: [number, number][]) {
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

function geometryContainsPoint(geometry: any, point: [number, number]) {
  if (!geometry) return false
  if (geometry.type === 'Polygon') return pointInRing(point, geometry.coordinates[0])
  if (geometry.type === 'MultiPolygon')
    return geometry.coordinates.some((poly: [number, number][][]) => pointInRing(point, poly[0]))
  return false
}

function projectMeters(lat: number, lng: number, refLatRad: number) {
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  return [EARTH_RADIUS * lngRad * Math.cos(refLatRad), EARTH_RADIUS * latRad] as [number, number]
}

function polygonArea(coords: [number, number][]) {
  if (!coords.length) return 0
  const refLatRad = (coords[0][1] * Math.PI) / 180
  let area = 0
  for (let i = 0; i < coords.length; i += 1) {
    const [x1, y1] = projectMeters(coords[i][1], coords[i][0], refLatRad)
    const [x2, y2] = projectMeters(coords[(i + 1) % coords.length][1], coords[(i + 1) % coords.length][0], refLatRad)
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area) / 2
}

function geometryArea(geometry: any) {
  if (!geometry) return 0
  if (geometry.type === 'Polygon') return polygonArea(geometry.coordinates[0])
  if (geometry.type === 'MultiPolygon')
    return geometry.coordinates.reduce((sum: number, poly: [number, number][][]) => sum + polygonArea(poly[0]), 0)
  return 0
}

function centroidForGeometry(geometry: any): [number, number] | null {
  if (!geometry) return null
  const avg = (coords: [number, number][]) => {
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
      return avg(geometry.coordinates[0])
    case 'MultiPolygon':
      for (const poly of geometry.coordinates) {
        const center = avg(poly[0])
        if (center) return center
      }
      return null
    default:
      return null
  }
}

function computeCentroidLonLat(geometry: any): [number, number] | null {
  const center = centroidForGeometry(geometry)
  if (!center) return null
  return [center[1], center[0]]
}

function ParkingSpacesOverlay({ data, selectedLotId }: { data: any; selectedLotId?: string }) {
  const [subset, setSubset] = useState<any>(null)
  const map = useMap()

  useEffect(() => {
    if (!data) return
    const update = () => {
      const zoom = map.getZoom()
      if (zoom < 17) {
        setSubset(null)
        return
      }
      const bounds = map.getBounds()
      const filtered = data.features.filter((feature: any) =>
        geometryIntersectsBounds(feature.geometry, bounds)
      )
      if (!filtered.length) {
        setSubset(null)
        return
      }
      const features = filtered.map((feature: any) => {
        const id = feature.properties?.id
        const numeric = Number(id?.split('/')?.[1] || 0)
        /*if (numeric >= 875331908 && numeric <= 875332179) {
          return {
            ...feature,
            properties: {
              ...feature.properties,
              _color: '#dc2626',
              _fill: '#f87171',
            },
          }
        }*/
        return feature
      })
      setSubset({ ...data, features })
    }
    update()
    map.on('moveend', update)
    map.on('zoomend', update)
    return () => {
      map.off('moveend', update)
      map.off('zoomend', update)
    }
  }, [map, data])

  useEffect(() => {
    if (!data) return
    const zoom = map.getZoom()
    if (zoom < 17) return
    const bounds = map.getBounds()
    const filtered = data.features.filter((feature: any) =>
      geometryIntersectsBounds(feature.geometry, bounds)
    )
    if (filtered.length) {
      setSubset({ ...data, features: filtered })
    }
  }, [selectedLotId, data, map])

  if (!subset) return null
  return (
    <GeoJSON
      key={subset.features.length}
      data={subset}
      style={(feature) => ({
        color: feature?.properties?._color || '#16a34a',
        fillColor: feature?.properties?._fill || '#22c55e',
        weight: 1,
        fillOpacity: 0.45,
      })}
    />
  )
}

export default function MapView({ searchQuery = '' }: { searchQuery?: string }) {
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
  const selectedLotId = useApp((s) => s.selectedLotId)
  const setSelectedLotId = useApp((s) => s.setSelectedLotId)
  const filters = useApp((s) => s.filters)
  const setLotSnapshots = useApp((s) => s.setLotSnapshots)
  const lotSnapshots = useApp((s) => s.lotSnapshots)

  const { data: spacesRaw } = useQuery({
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

  const { data: lotSummaries } = useQuery({
    queryKey: ['lot-summaries', filters.permit],
    queryFn: () => getLots({ permit: filters.permit }),
  })

  const { data: occupancy } = useQuery({
    queryKey: ['lot-occupancy'],
    queryFn: async () => {
      const res = await fetch(`${base}/api/occupancy`)
      if (!res.ok) throw new Error('Failed to load occupancy')
      return res.json()
    },
  })
  const occupancyFetchedAt = typeof occupancy?.fetchedAt === 'string' ? occupancy.fetchedAt : null

  const spacesWithCenter = useMemo(() => {
    if (!spacesRaw?.features) return []
    return spacesRaw.features
      .map((feature: any) => {
        const center = computeCentroidLonLat(feature.geometry)
        if (!center) return null
        return { feature, center }
      })
      .filter(Boolean) as Array<{ feature: any; center: [number, number] }>
  }, [spacesRaw])

  const occupiedSet = useMemo(() => {
    const slots = occupancy?.slots
    if (!Array.isArray(slots)) return new Set<string>()
    return new Set(slots.filter((slot: any) => slot?.occupied).map((slot: any) => `way/${slot.id}`))
  }, [occupancy])

  const lotSummariesByOsmId = useMemo(() => {
    const map = new Map<string, any>()
    if (lotSummaries) {
      for (const lot of lotSummaries) {
        const osmId = lot.metadata?.osmId
        if (osmId) map.set(osmId, lot)
      }
    }
    return map
  }, [lotSummaries])

  const knownOsmIds = useMemo(() => {
    const set = new Set<string>()
    if (lotSummaries) {
      for (const lot of lotSummaries) {
        const osmId = lot.metadata?.osmId
        if (osmId) set.add(osmId)
      }
    }
    return set
  }, [lotSummaries])

  const lotFeaturesForCounts = useMemo(() => {
    if (!lotsGeo?.features || !knownOsmIds.size) return []
    return lotsGeo.features.filter((feature: any) => {
      const osmId = feature?.properties?.id
      return osmId && knownOsmIds.has(osmId)
    })
  }, [lotsGeo, knownOsmIds])

  const allowedLots = useMemo(() => {
    if (!lotsGeo?.features) return []
    const q = searchQuery.trim().toLowerCase()
    return lotsGeo.features.filter((feature: any) => {
      const id = feature.properties?.id
      if (!lotSummariesByOsmId.has(id)) return false
      const summary = lotSummariesByOsmId.get(id)
      if (!summary) return false
      if (filters.permit && summary.permit_types?.length) {
        if (!summary.permit_types.includes(filters.permit)) return false
      }
      const haystack = [summary.name, summary.code, summary.metadata?.tags?.operator]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [lotsGeo, lotSummariesByOsmId, searchQuery, filters.permit])

  const filteredSpaces = useMemo(() => {
    if (!spacesRaw?.features || !allowedLots.length) return null
    const allowed = allowedLots.map((lot: any) => lot.geometry)
    const features = spacesRaw.features
      .filter((feature: any) => {
        const center = computeCentroidLonLat(feature.geometry)
        if (!center) return false
        return allowed.some((geom: any) => geometryContainsPoint(geom, center))
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
    return { ...spacesRaw, features }
  }, [spacesRaw, allowedLots, occupiedSet])

  const occupancyByLot = useMemo(() => {
    if (!spacesWithCenter.length || !lotFeaturesForCounts.length) return new Map<string, { total: number; occupied: number; open: number; unknown: number }>()
    const statsByOsm = new Map<string, { total: number; occupied: number }>()
    for (const { feature, center } of spacesWithCenter) {
      const spaceId = feature?.properties?.id
      if (!center) continue
      for (const lot of lotFeaturesForCounts) {
        const osmId = lot?.properties?.id
        if (!osmId || !lot.geometry) continue
        if (geometryContainsPoint(lot.geometry, center)) {
          const stats = statsByOsm.get(osmId) || { total: 0, occupied: 0 }
          stats.total += 1
          if (spaceId && occupiedSet.has(spaceId)) {
            stats.occupied += 1
          }
          statsByOsm.set(osmId, stats)
          break
        }
      }
    }
    const result = new Map<string, { total: number; occupied: number; open: number; unknown: number }>()
    for (const [osmId, stats] of statsByOsm.entries()) {
      const open = Math.max(stats.total - stats.occupied, 0)
      result.set(osmId, { total: stats.total, occupied: stats.occupied, open, unknown: 0 })
    }
    return result
  }, [spacesWithCenter, lotFeaturesForCounts, occupiedSet])

  useEffect(() => {
    if (!occupancyByLot.size) return
    const observedAt = occupancyFetchedAt || new Date().toISOString()
    const snapshots: Record<string, { counts: { total: number; occupied: number; open: number; unknown: number }; observedAt: string }> = {}
    for (const [osmId, counts] of occupancyByLot.entries()) {
      const summary = lotSummariesByOsmId.get(osmId)
      if (!summary) continue
      const existing = lotSnapshots[summary.id]
      if (
        existing &&
        existing.observedAt === observedAt &&
        existing.counts.total === counts.total &&
        existing.counts.occupied === counts.occupied &&
        existing.counts.open === counts.open &&
        existing.counts.unknown === counts.unknown
      ) {
        continue
      }
      snapshots[summary.id] = { counts, observedAt }
    }
    if (Object.keys(snapshots).length) {
      setLotSnapshots(snapshots)
    }
  }, [occupancyByLot, lotSummariesByOsmId, occupancyFetchedAt, setLotSnapshots, lotSnapshots])

  const markers = useMemo(() => {
    const baseMarkers = allowedLots
      .map((feature: any) => {
        const osmId = feature.properties?.id
        const summary = lotSummariesByOsmId.get(osmId)
        if (!summary) return null
        const centroid = centroidForGeometry(feature.geometry)
        if (!centroid) return null
        const area = geometryArea(feature.geometry)
        const snapshot = summary ? lotSnapshots[summary.id] : undefined
        return {
          id: summary.id,
          osmId,
          name: summary.name,
          centroid,
          feature,
          counts: snapshot?.counts || summary.counts,
          area,
        }
      })
      .filter(Boolean) as Array<{ id: string; osmId: string; name: string; centroid: [number, number]; feature: any; counts: any }>

    if (!lotSummaries) return baseMarkers

    const matchedIds = new Set(baseMarkers.map((m) => m.id))
    const extras = lotSummaries
      .filter((summary: any) => summary.centroid && !matchedIds.has(summary.id))
      .map((summary: any) => ({
        id: summary.id,
        osmId: summary.metadata?.osmId || null,
        name: summary.name,
        centroid: [summary.centroid.lat, summary.centroid.lng] as [number, number],
        feature: { properties: { tags: { name: summary.name } } },
        counts: lotSnapshots[summary.id]?.counts || summary.counts,
        area: null,
      }))

    return [...baseMarkers, ...extras]
  }, [allowedLots, lotSummaries, lotSummariesByOsmId, lotSnapshots])

  return (
    <MapContainer
      center={[40.0017, -83.0197]}
      zoom={16}
      minZoom={14}
      maxZoom={19}
      scrollWheelZoom
      className='w-full h-full min-h-[320px]'
    >
      <MapInvalidator />
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        maxZoom={19}
      />
      <FitToUser />
      {filteredSpaces && <ParkingSpacesOverlay data={filteredSpaces} selectedLotId={selectedLotId} />}
      {markers.map(({ id, centroid, feature, counts }) => {
        const [lat, lng] = centroid
        const openSpaces = counts?.open ?? 0
        const totalSpaces = counts?.total ?? 0
        const hasAvailability = openSpaces > 0
        return (
          <CircleMarker
            key={id}
            center={[lat, lng]}
            radius={9}
            pathOptions={{
              color: hasAvailability ? '#15803d' : '#b91c1c',
              fillColor: hasAvailability ? '#22c55e' : '#fca5a5',
              fillOpacity: 0.9,
              weight: 2,
            }}
            eventHandlers={{
              click: () => setSelectedLotId(id),
            }}
          >
            <Popup>
              <div className='text-sm'>
                <div className='font-medium'>{feature.properties?.tags?.name || 'Parking Lot'}</div>
                <div className='text-xs text-gray-500'>
                  {openSpaces} open / {totalSpaces}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
      {markers.map(({ id, centroid, counts }) => (
        <Marker
          key={`${id}-label`}
          position={[centroid[0], centroid[1]]}
          interactive={false}
          icon={L.divIcon({
            className: 'open-count-marker',
            html: `<span class="open-count-chip">${counts?.open ?? 0} open</span>`,
            iconAnchor: [0, 0],
          })}
        />
      ))}
      <SelectedLotFollower markers={markers} selectedLotId={selectedLotId} summaries={lotSummaries} />
    </MapContainer>
  )
}

function SelectedLotFollower({ markers, selectedLotId, summaries }: { markers: any[]; selectedLotId?: string; summaries?: any[] }) {
  const map = useMap()
  useEffect(() => {
    if (!selectedLotId) return
    const marker = markers.find((m) => m.id === selectedLotId)
    if (marker) {
      map.flyTo([marker.centroid[0], marker.centroid[1]], 18, { duration: 0.8 })
      return
    }
    const summary = summaries?.find((lot) => lot.id === selectedLotId)
    const centroid = summary?.centroid
    if (centroid) {
      map.flyTo([centroid.lat, centroid.lng], Math.max(map.getZoom(), 17), { duration: 0.8 })
    }
  }, [selectedLotId, markers, map])

  useEffect(() => {
    if (!selectedLotId) return
    const target = markers.find((m) => m.id === selectedLotId)
    const summary = summaries?.find((lot) => lot.id === selectedLotId)
    const hasTarget = target || summary?.centroid
    if (!hasTarget) return
    const currentZoom = map.getZoom()
    if (currentZoom < 17) {
      map.setZoom(17)
    }
  }, [selectedLotId, markers, summaries, map])
  return null
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
