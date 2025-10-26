import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getLots } from '../lib/api'
import { useApp } from '../state/store'

const formatDistance = (meters?: number) => {
  if (!meters) return null
  const miles = meters / 1609.34
  if (miles < 0.2) {
    const feet = meters * 3.28084
    return `${Math.round(feet)} ft`
  }
  return `${miles.toFixed(2)} mi`
}

const formatWalk = (meters?: number) => {
  if (!meters) return null
  const minutes = Math.round(meters / 80) // ~1.3 m/s walking
  return `${minutes} min walk`
}

const availabilityColor = (ratio: number) => {
  if (ratio >= 0.5) return 'bg-emerald-500'
  if (ratio >= 0.2) return 'bg-amber-500'
  return 'bg-red-700'
}

const summarizePricing = (pricing: unknown): string | null => {
  if (!pricing) return null
  if (typeof pricing === 'string') return pricing
  if (typeof pricing === 'object') {
    const record = pricing as Record<string, any>
    if (record.daily_max != null) return `Daily max $${Number(record.daily_max).toFixed(2)}`
    if (record.hourly != null) return `Hourly $${Number(record.hourly).toFixed(2)}`
    if (record.notes) return String(record.notes)
    const keys = Object.keys(record)
    if (keys.length) return `${keys.length} pricing tiers`
  }
  return null
}

export default function LotList({ searchQuery = '' }: { searchQuery?: string }) {
  const loc = useApp((s) => s.userLocation)
  const filters = useApp((s) => s.filters)
  const selectedLotId = useApp((s) => s.selectedLotId)
  const setSelectedLotId = useApp((s) => s.setSelectedLotId)
  const lotSnapshots = useApp((s) => s.lotSnapshots)
  const navigate = useNavigate()

  const near = loc ? `${loc.lat},${loc.lng}` : undefined
  const { data } = useQuery({
    queryKey: ['lots', near, filters.permit],
    queryFn: () => getLots({ near, radius: 2000, permit: filters.permit }),
  })

  const filtered = useMemo(() => {
    if (!data) return []
    const q = searchQuery.trim().toLowerCase()
    if (!q) return data
    return data.filter((lot: any) => {
      const code = lot.code || ''
      const tags = lot.metadata?.tags || {}
      const haystack = [lot.name, code, tags.operator, tags.parking]?.join(' ').toLowerCase()
      if (filters.permit && lot.permit_types?.length) {
        if (!lot.permit_types.includes(filters.permit)) return false
      }
      return haystack.includes(q)
    })
  }, [data, searchQuery, filters.permit])

  return (
    <div className='flex-1 flex flex-col overflow-hidden max-h-[70vh] lg:max-h-[calc(100vh-200px)]'>
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 sm:px-5 py-3 border-b border-neutral-200 bg-white/80 backdrop-blur'>
        <div className='space-y-1'>
          <h2 className='text-sm font-semibold text-osu-scarlet'>Nearby lots</h2>
          <p className='text-xs text-osu-gray'>{filtered.length} results • Sorted by distance</p>
        </div>
      </div>
      <div className='flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-4 space-y-4 custom-scrollbar'>
        {filtered.map((lot: any) => {
          const isSelected = lot.id === selectedLotId
          const snapshot = lotSnapshots[lot.id]
          const countsSource = snapshot?.counts ?? lot.counts ?? { total: 0, occupied: 0, open: 0, unknown: 0 }
          const total = countsSource.total ?? 0
          const occupied = countsSource.occupied ?? 0
          const open =
            countsSource.open != null
              ? countsSource.open
              : Math.max(total - occupied - (countsSource.unknown ?? 0), 0)
          const ratio = total > 0 ? open / total : 0
          const distance = formatDistance(lot.distanceMeters)
          const walk = formatWalk(lot.distanceMeters)
          const observedAt = snapshot?.observedAt ?? lot.latestCap?.observed_at ?? null
          const updatedLabel = observedAt
            ? `Updated ${new Date(observedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : 'Updated moments ago'

          return (
            <div
              key={lot.id}
              className={`rounded-2xl border shadow-sm p-4 transition-colors cursor-pointer bg-white ${
                isSelected ? 'border-osu-scarlet shadow-md' : 'border-neutral-200 hover:border-red-700'
              }`}
              onClick={() => setSelectedLotId(lot.id)}
            >
              <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
                <div className='space-y-2'>
                  <div className='text-base font-semibold text-osu-gray leading-tight'>{lot.name}</div>
                  <div className='flex flex-wrap gap-2 text-xs text-slate-500'>
                    {lot.code && <span className='px-2 py-0.5 rounded-full bg-neutral-100 text-slate-600 font-medium'>{lot.code}</span>}
                    {distance && <span className='px-2 py-0.5 rounded-full bg-neutral-100'>{distance}</span>}
                    {walk && <span className='px-2 py-0.5 rounded-full bg-neutral-100'>{walk}</span>}
                    {lot.permit_types?.map((permit: string) => (
                      <span key={permit} className='px-2 py-0.5 rounded-full bg-osu-light text-osu-scarlet font-medium'>
                        Permit {permit}
                      </span>
                    ))}
                  </div>
                </div>
                <div className='text-sm font-semibold text-osu-gray sm:text-right'>
                  {open} open / {total}
                </div>
              </div>
              <div className='mt-3'>
                <div className='h-2 w-full rounded-full bg-neutral-100 overflow-hidden'>
                  <div
                    className={`${availabilityColor(ratio)} h-full transition-all`}
                    style={{ width: `${Math.min(Math.max(ratio * 100, 4), 100)}%` }}
                  />
                </div>
              </div>
              {summarizePricing(lot.pricing) && (
                <div className='mt-3 text-xs text-osu-gray/90'>
                  {summarizePricing(lot.pricing)}
                </div>
              )}
              <div className='mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-osu-gray'>
                <div className='order-2 sm:order-1 text-gray-500'>
                  {updatedLabel} • {occupied} occupied
                </div>
                <button
                  type='button'
                  className='order-1 sm:order-2 text-osu-scarlet hover:underline font-medium self-start sm:self-auto'
                  onClick={(evt) => {
                    evt.stopPropagation()
                    setSelectedLotId(lot.id)
                    navigate(`/lot/${lot.id}`)
                  }}
                >
                  View details →
                </button>
              </div>
            </div>
          )
        })}

        {!filtered.length && (
          <div className='rounded-2xl border border-dashed border-neutral-200 bg-neutral-100/60 p-8 text-center text-sm text-slate-500'>
            No lots match your filters yet.
          </div>
        )}
      </div>
    </div>
  )
}
