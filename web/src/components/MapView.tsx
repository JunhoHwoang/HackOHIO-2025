import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useQuery } from '@tanstack/react-query'
// Fix default marker icons with Vite
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { useApp } from '../state/store'
import { getLots } from '../lib/api'
import { Link } from 'react-router-dom'

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})
function FitToUser(){const map=useMap();const p=useApp(s=>s.userLocation);if(p) map.setView([p.lat,p.lng],16);return null}
export default function MapView(){const loc=useApp(s=>s.userLocation);const filters=useApp(s=>s.filters);const near=loc?`${loc.lat},${loc.lng}`:undefined;const base=import.meta.env.VITE_API_BASE||'http://localhost:4000';const { data:lots }=useQuery({queryKey:['lots',near,filters.permit],queryFn:()=>getLots({near,radius:2000,permit:filters.permit})});const { data:spaces }=useQuery({queryKey:['parking-spaces'],queryFn:async()=>{const res=await fetch(`${base}/osm/parking_spaces_lane_north.geojson`);if(!res.ok) throw new Error('Failed to load parking spaces');return res.json();}});return(<MapContainer center={[40.0017,-83.0197]} zoom={16} minZoom={14} maxZoom={19} scrollWheelZoom className='w-full h-full'><TileLayer attribution='&copy; OpenStreetMap contributors' url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' maxZoom={19}/><FitToUser/>{spaces&&(<GeoJSON data={spaces} style={{color:'#16a34a',weight:1,fillColor:'#22c55e',fillOpacity:0.45}}/>) }{lots?.map((l:any)=> l.centroid && (<Marker key={l.id} position={[l.centroid.lat,l.centroid.lng]}><Popup><div className='text-sm'><div className='font-medium'>{l.name}</div><div>Open {l.counts.open} / {l.counts.total}</div>{l.latestCap&&(<div className='text-xs text-gray-500'>Garage: {Math.round(100*l.latestCap.occupied/l.latestCap.capacity)}% full</div>)}<div className='mt-1'><Link to={`/lot/${l.id}`} className='text-blue-600 underline'>View</Link></div></div></Popup></Marker>))}</MapContainer>) }
