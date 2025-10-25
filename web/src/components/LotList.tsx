import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getLots } from '../lib/api'
import { useApp } from '../state/store'

export default function LotList() {
  const loc = useApp((s) => s.userLocation)
  const filters = useApp((s) => s.filters)
  const selectedLotId = useApp((s) => s.selectedLotId)
  const setSelectedLotId = useApp((s) => s.setSelectedLotId)
  const navigate = useNavigate()

  const near = loc ? `${loc.lat},${loc.lng}` : undefined
  const { data } = useQuery({
    queryKey: ['lots', near, filters.permit],
    queryFn: () => getLots({ near, radius: 2000, permit: filters.permit }),
  })

  if (!data?.length) {
    return <div className='p-3 text-sm text-gray-600'>No lots found in range.</div>
  }

  return (
    <div className='divide-y'>
      {data.map((lot: any) => {
        const isSelected = lot.id === selectedLotId
        const handleSelect = () => setSelectedLotId(lot.id)
        const open = lot.counts?.open ?? 0
        const total = lot.counts?.total ?? 0
        return (
          <div
            key={lot.id}
            role='button'
            tabIndex={0}
            onClick={handleSelect}
            onKeyDown={(evt) => {
              if (evt.key === 'Enter' || evt.key === ' ') {
                evt.preventDefault()
                handleSelect()
              }
            }}
            className={`p-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isSelected ? 'bg-blue-50' : 'hover:bg-neutral-50'
            }`}
          >
            <div className='flex items-start justify-between gap-2'>
              <div>
                <div className='font-medium'>{lot.name}</div>
                <div className='text-xs text-gray-500'>
                  {lot.permit_types?.join(', ') || 'Unknown permits'}
                  {lot.distanceMeters
                    ? ` • ${(lot.distanceMeters / 1609.34).toFixed(2)} mi`
                    : ''}
                </div>
              </div>
              <div className='text-sm font-medium text-emerald-700'>
                {open} open / {total}
              </div>
            </div>
            <div className='mt-2'>
              <button
                type='button'
                className='text-xs text-blue-600 underline'
                onClick={(evt) => {
                  evt.stopPropagation()
                  setSelectedLotId(lot.id)
                  navigate(`/lot/${lot.id}`)
                }}
              >
                View details
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
