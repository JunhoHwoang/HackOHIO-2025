import { useEffect } from 'react'
import { useApp } from '../state/store'
import MapView from '../components/MapView'
import LotList from '../components/LotList'
import Filters from '../components/Filters'
export default function Discover(){const setUserLocation=useApp(s=>s.setUserLocation);useEffect(()=>{if(!navigator.geolocation)return;navigator.geolocation.getCurrentPosition(p=>setUserLocation({lat:p.coords.latitude,lng:p.coords.longitude}),_=>{})},[]);return(<div className='h-full grid grid-cols-1 md:grid-cols-3'><div className='md:col-span-2 h-[50vh] md:h-full border-b md:border-b-0 md:border-r'><MapView/></div><div className='h-full flex flex-col'><Filters/><div className='flex-1 overflow-auto'><LotList/></div></div></div>)}