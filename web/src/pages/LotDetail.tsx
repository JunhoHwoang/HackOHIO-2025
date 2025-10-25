import { useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { getLot, getStalls } from '../lib/api'
import type { LotSummary, Stall } from '../lib/types'
import BirdsEyeCanvas from '../components/BirdsEyeCanvas'
import ForecastCard from '../components/ForecastCard'
import LotDetailMap from '../components/LotDetailMap'

export default function LotDetail() {
  const { id = '' } = useParams()
  const [lot, setLot] = useState<LotSummary | null>(null)
  const [stalls, setStalls] = useState<Stall[]>([])

  useEffect(() => {
    getLot(id).then(setLot)
    getStalls(id).then((d) => setStalls(d.stalls || []))
  }, [id])

  const hasImage = useMemo(() => Boolean(lot?.latestImage?.url), [lot])

  if (!lot) return <div className='p-4'>Loading...</div>

  return (
    <div className='h-full grid grid-cols-1 lg:grid-cols-3'>
      <div className='lg:col-span-2 border-b lg:border-b-0 lg:border-r'>
        <div className='p-3 flex items-center justify-between'>
          <div>
            <h1 className='text-lg font-semibold'>
              {lot.name} {lot.code ? `(${lot.code})` : ''}
            </h1>
            <div className='text-sm text-gray-600'>
              Total {lot.counts.total} • Open {lot.counts.open} • Occupied {lot.counts.occupied} • Unknown {lot.counts.unknown}
            </div>
            {lot.latestImage && (
              <div className='text-xs text-gray-500'>
                Last image: {new Date(lot.latestImage.captured_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>
        <div className='h-[60vh] lg:h-[calc(100vh-3rem)]'>
          {hasImage ? <BirdsEyeCanvas lot={lot} stalls={stalls} /> : <LotDetailMap lot={lot} />}
        </div>
      </div>
      <div className='p-3 space-y-3'>
        <ForecastCard lotId={lot.id} />
        <div className='rounded border p-3 text-sm'>
          <div className='font-medium mb-2'>Rules & Fees</div>
          <div>Permits: {lot.permit_types.join(', ') || '—'}</div>
          {lot.latestCap && (
            <div className='mt-2'>
              Garage capacity: {lot.latestCap.occupied}/{lot.latestCap.capacity} (
              {Math.round((100 * lot.latestCap.occupied) / lot.latestCap.capacity)}% full) •{' '}
              <span className='text-gray-500'>{new Date(lot.latestCap.observed_at).toLocaleTimeString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
