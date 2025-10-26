import { useParams } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import { getLot } from '../lib/api'
import type { LotSummary } from '../lib/types'
import ForecastCard from '../components/ForecastCard'
import LotDetailMap from '../components/LotDetailMap'

export default function LotDetail() {
  const { id = '' } = useParams()
  const [lot, setLot] = useState<LotSummary | null>(null)
  const [observedCounts, setObservedCounts] = useState<{
    counts: LotSummary['counts']
    observedAt: string
  } | null>(null)

  useEffect(() => {
    getLot(id).then(setLot)
  }, [id])

  useEffect(() => {
    setObservedCounts(null)
  }, [lot?.id])

  const handleCountsChange = useCallback((counts: LotSummary['counts'] | null, observedAt?: string) => {
    if (!counts) {
      setObservedCounts(null)
      return
    }
    setObservedCounts({
      counts,
      observedAt: observedAt ?? new Date().toISOString(),
    })
  }, [])

  if (!lot) {
    return (
      <div className='w-full px-4 py-10 text-center text-sm text-osu-gray'>
        Loading lot details…
      </div>
    )
  }

  const counts = observedCounts?.counts || lot.counts
  const pricing = lot.pricing
  const liveCap = observedCounts
    ? {
        capacity: observedCounts.counts.total,
        occupied: observedCounts.counts.occupied,
        source: 'vision',
        observed_at: observedCounts.observedAt,
      }
    : lot.latestCap

  const renderPricing = () => {
    if (!pricing) return null
    if (typeof pricing === 'string') {
      return (
        <div className='text-sm text-osu-gray'>
          Pricing: <span className='font-medium text-osu-scarlet'>{pricing}</span>
        </div>
      )
    }
    const entries = Object.entries(pricing as Record<string, any>)
    if (!entries.length) return null
    const formatLabel = (label: string) =>
      label
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())

    return (
      <div className='text-sm text-osu-gray space-y-2'>
        <div className='font-medium text-osu-scarlet'>Pricing</div>
        <ul className='space-y-1'>
          {entries.map(([key, value]) => (
            <li key={key} className='flex justify-between gap-4 text-xs sm:text-sm'>
              <span className='text-osu-gray/80'>{formatLabel(key)}</span>
              <span className='font-medium text-osu-scarlet'>
                {typeof value === 'number' ? `$${value.toFixed(2)}` : String(value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className='mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6 space-y-6'>
      <section className='rounded-3xl border border-neutral-200 bg-white shadow-sm p-5 sm:p-6 lg:p-8'>
        <div className='flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6'>
          <div className='space-y-2'>
            <p className='text-xs uppercase tracking-wide text-osu-scarlet font-semibold'>Lot overview</p>
            <h1 className='text-2xl font-semibold text-osu-scarlet'>
              {lot.name} {lot.code ? <span className='text-sm text-osu-gray font-normal'>({lot.code})</span> : null}
            </h1>
            {counts && (
              <div className='text-sm text-osu-gray'>
                Total {counts.total} • Open {counts.open} • Occupied {counts.occupied} • Unknown {counts.unknown}
              </div>
            )}
            {lot.latestImage && (
              <div className='text-xs text-gray-500'>
                Last image: {new Date(lot.latestImage.captured_at).toLocaleString()}
              </div>
            )}
          </div>
          <div className='self-stretch rounded-2xl border border-osu-scarlet bg-osu-scarlet px-4 py-3 text-sm text-white shadow-inner'>
            <div className='font-semibold text-white'>Live availability</div>
            {counts ? (
              <div className='mt-1 space-y-1'>
                <div><span className='font-semibold'>{counts.open}</span> open spaces</div>
                <div className='text-white/80'>Updated moments ago</div>
              </div>
            ) : (
              <div className='mt-1 text-white/80'>No availability data yet.</div>
            )}
          </div>
        </div>
      </section>

      <div className='grid grid-cols-1 gap-6 xl:gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
        <section className='rounded-3xl border border-neutral-200 bg-white shadow-sm overflow-hidden'>
          <div className='h-[320px] sm:h-[400px] lg:h-[480px]'>
            <LotDetailMap lot={lot} onCountsChange={handleCountsChange} />
          </div>
        </section>

        <aside className='space-y-6'>
          <ForecastCard lotId={lot.id} />
          <div className='rounded-3xl border border-neutral-200 bg-white shadow-sm p-5 sm:p-6 text-sm space-y-3'>
            <div>
              <h3 className='text-base font-semibold text-osu-scarlet'>Permits & fees</h3>
              <p className='text-xs text-gray-500'>Check signage on-site for the latest enforcement details.</p>
            </div>
            <div className='text-sm text-osu-gray'>
              Permits accepted: <span className='font-medium text-osu-scarlet'>{lot.permit_types.join(', ') || '—'}</span>
            </div>
            {renderPricing()}
            {liveCap && (
              <div className='rounded-2xl border border-osu-scarlet bg-osu-light px-4 py-3 text-sm text-osu-gray'>
                <div className='font-medium text-osu-scarlet'>Capacity snapshot</div>
                <div className='mt-1'>
                  {liveCap.occupied}/{liveCap.capacity} occupied (
                  {liveCap.capacity ? Math.round((100 * liveCap.occupied) / liveCap.capacity) : 0}% full)
                </div>
                <div className='text-xs text-gray-500 mt-2'>
                  Observed {new Date(liveCap.observed_at).toLocaleString()} • Source: {liveCap.source}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
