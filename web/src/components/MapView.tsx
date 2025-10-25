import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { useApp } from '../state/store'
import { getLots } from '../lib/api'

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const ALLOWED_OSM_IDS = new Set([
  'way/39115920',
  'way/38911611',
  'way/444966505',
  'way/275147287',
])

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

function ParkingSpacesOverlay({ data }: { data: any }) {
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
        if (feature.properties?.id === 'way/875331908') {
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

export default function MapView() {
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
  const selectedLotId = useApp((s) => s.selectedLotId)
  const setSelectedLotId = useApp((s) => s.setSelectedLotId)

  const { data: spacesRaw } = useQuery({
    queryKey: ['parking-spaces-osu'],
    queryFn: async () => {
      const res = await fetch(`${base}/osm/parking_spaces_osu.geojson`)
      if (!res.ok) throw new Error('Failed to load parking spaces')
      return res.json()
    },
  })

  const { data: lotsGeo } = useQuery({
    queryKey: ['parking-lots-osu'],
    queryFn: async () => {
      const res = await fetch(`${base}/osm/parking_lots_osu.geojson`)
      if (!res.ok) throw new Error('Failed to load parking lots')
      return res.json()
    },
  })

  const { data: lotSummaries } = useQuery({
    queryKey: ['lot-summaries'],
    queryFn: () => getLots({})
  })

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

  const allowedLots = useMemo(() => {
    if (!lotsGeo?.features) return []
    return lotsGeo.features.filter((feature: any) => ALLOWED_OSM_IDS.has(feature.properties?.id))
  }, [lotsGeo])

  const filteredSpaces = useMemo(() => {
    if (!spacesRaw?.features || !allowedLots.length) return null
    const allowed = allowedLots.map((lot: any) => lot.geometry)
    const features = spacesRaw.features.filter((feature: any) => {
      const center = computeCentroidLonLat(feature.geometry)
      if (!center) return false
      return allowed.some((geom: any) => geometryContainsPoint(geom, center))
    })
    return { ...spacesRaw, features }
  }, [spacesRaw, allowedLots])

  const markers = useMemo(() => {
    return allowedLots
      .map((feature: any) => {
        const osmId = feature.properties?.id
        const summary = lotSummariesByOsmId.get(osmId)
        if (!summary) return null
        const centroid = centroidForGeometry(feature.geometry)
        if (!centroid) return null
        const area = geometryArea(feature.geometry)
        return {
          id: summary.id,
          osmId,
          name: summary.name,
          centroid,
          feature,
          counts: summary.counts,
          area,
        }
      })
      .filter(Boolean) as Array<{ id: string; osmId: string; name: string; centroid: [number, number]; feature: any; counts: any }>
  }, [allowedLots, lotSummariesByOsmId])

  return (
    <MapContainer
      center={[40.0017, -83.0197]}
      zoom={16}
      minZoom={14}
      maxZoom={19}
      scrollWheelZoom
      className='w-full h-full'
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        maxZoom={19}
      />
      <FitToUser />
      {filteredSpaces && <ParkingSpacesOverlay data={filteredSpaces} />}
      {markers.map(({ id, centroid, feature, counts }) => {
        const [lat, lng] = centroid
        return (
          <Marker
            key={id}
            position={[lat, lng]}
            eventHandlers={{
              click: () => setSelectedLotId(id),
            }}
          >
            <Popup>
              <div className='text-sm'>
                <div className='font-medium'>{feature.properties?.tags?.name || 'Parking Lot'}</div>
                <div className='text-xs text-gray-500'>
                  {counts?.open ?? 0} open / {counts?.total ?? 0}
                </div>
              </div>
            </Popup>
          </Marker>
        )
      })}
      <SelectedLotFollower markers={markers} selectedLotId={selectedLotId} />
    </MapContainer>
  )
}

function SelectedLotFollower({ markers, selectedLotId }: { markers: any[]; selectedLotId?: string }) {
  const map = useMap()
  useEffect(() => {
    if (!selectedLotId) return
    const marker = markers.find((m) => m.id === selectedLotId)
    if (marker) {
      map.flyTo([marker.centroid[0], marker.centroid[1]], 18, { duration: 0.8 })
    }
  }, [selectedLotId, markers, map])
  return null
}
