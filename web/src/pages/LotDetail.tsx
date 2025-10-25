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

  if (!lot) {
    return (
      <div className='w-full px-4 py-10 text-center text-sm text-slate-500'>
        Loading lot details…
      </div>
    )
  }

  const counts = lot.counts

  return (
    <div className='mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6 space-y-6'>
      <section className='rounded-3xl border border-neutral-200 bg-white shadow-sm p-5 sm:p-6 lg:p-8'>
        <div className='flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6'>
          <div className='space-y-2'>
            <p className='text-xs uppercase tracking-wide text-rose-600 font-semibold'>Lot overview</p>
            <h1 className='text-2xl font-semibold text-slate-900'>
              {lot.name} {lot.code ? <span className='text-sm text-slate-500 font-normal'>({lot.code})</span> : null}
            </h1>
            {counts && (
              <div className='text-sm text-slate-600'>
                Total {counts.total} • Open {counts.open} • Occupied {counts.occupied} • Unknown {counts.unknown}
              </div>
            )}
            {lot.latestImage && (
              <div className='text-xs text-slate-500'>
                Last image: {new Date(lot.latestImage.captured_at).toLocaleString()}
              </div>
            )}
          </div>
          <div className='self-stretch rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-inner'>
            <div className='font-semibold text-rose-700'>Live availability</div>
            {counts ? (
              <div className='mt-1 space-y-1'>
                <div><span className='font-medium text-rose-800'>{counts.open}</span> open spaces</div>
                <div className='text-rose-600/80'>Updated moments ago</div>
              </div>
            ) : (
              <div className='mt-1 text-rose-600/80'>No availability data yet.</div>
            )}
          </div>
        </div>
      </section>

      <div className='grid grid-cols-1 gap-6 xl:gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
        <div className='space-y-6'>
          <section className='rounded-3xl border border-neutral-200 bg-white shadow-sm overflow-hidden'>
            <div className='h-[320px] sm:h-[400px] lg:h-[480px]'>
              <LotDetailMap lot={lot} />
            </div>
          </section>

          <section className='rounded-3xl border border-neutral-200 bg-white shadow-sm p-5 sm:p-6'>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <h2 className='text-base font-semibold text-slate-900'>Bird’s eye layout</h2>
              <span className='text-xs text-slate-500'>Green = open • Red = occupied • Gray = unknown</span>
            </div>
            <div className='mt-4 h-72 rounded-2xl border border-dashed border-neutral-200 overflow-hidden bg-neutral-50'>
              {hasImage ? (
                <BirdsEyeCanvas lot={lot} stalls={stalls} />
              ) : (
                <div className='flex h-full items-center justify-center text-sm text-slate-500'>
                  No image available for this lot yet.
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className='space-y-6'>
          <ForecastCard lotId={lot.id} />
          <div className='rounded-3xl border border-neutral-200 bg-white shadow-sm p-5 sm:p-6 text-sm space-y-3'>
            <div>
              <h3 className='text-base font-semibold text-slate-900'>Permits & fees</h3>
              <p className='text-xs text-slate-500'>Check signage on-site for the latest enforcement details.</p>
            </div>
            <div className='text-sm text-slate-700'>
              Permits accepted: <span className='font-medium text-slate-900'>{lot.permit_types.join(', ') || '—'}</span>
            </div>
            {lot.latestCap && (
              <div className='rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-slate-600'>
                <div className='font-medium text-slate-800'>Capacity snapshot</div>
                <div className='mt-1'>
                  {lot.latestCap.occupied}/{lot.latestCap.capacity} occupied (
                  {Math.round((100 * lot.latestCap.occupied) / lot.latestCap.capacity)}% full)
                </div>
                <div className='text-xs text-slate-500 mt-2'>
                  Observed {new Date(lot.latestCap.observed_at).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
