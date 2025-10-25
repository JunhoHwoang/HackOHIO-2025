import { useEffect, useState } from 'react'
import { useApp } from '../state/store'
import MapView from '../components/MapView'
import LotList from '../components/LotList'
import Filters from '../components/Filters'

export default function Discover() {
  const setUserLocation = useApp((s) => s.setUserLocation)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {}
    )
  }, [setUserLocation])

  return (
    <div className='mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6 space-y-6'>
      <section className='flex flex-col gap-5 rounded-3xl bg-white shadow-sm border border-neutral-200 p-5 sm:p-6 lg:p-8'>
        <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-6'>
          <div className='space-y-2'>
            <h1 className='text-2xl sm:text-3xl font-semibold text-slate-900'>Find your spot in seconds</h1>
            <p className='text-sm sm:text-base text-slate-600'>
              Live availability for OSU lots, garages, and surface parking.
            </p>
          </div>
          <Filters />
        </div>
        <div>
          <label className='sr-only' htmlFor='lot-search'>Search lots</label>
          <div className='relative'>
            <input
              id='lot-search'
              type='search'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search by lot name, code, or permit...'
              className='w-full rounded-full border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm sm:text-base shadow-inner focus:border-rose-300 focus:ring-2 focus:ring-rose-100'
            />
            <span className='pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs sm:text-sm text-slate-400'>⌘K</span>
          </div>
        </div>
      </section>

      <section className='grid grid-cols-1 gap-6 xl:gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
        <div className='rounded-3xl overflow-hidden bg-white shadow-sm border border-neutral-200 h-[360px] sm:h-[420px] lg:h-auto min-h-[320px]'>
          <MapView searchQuery={search} />
        </div>
        <div className='rounded-3xl bg-white shadow-sm border border-neutral-200 flex flex-col overflow-hidden max-h-[70vh] lg:max-h-none'>
          <LotList searchQuery={search} />
        </div>
      </section>
    </div>
  )
}
