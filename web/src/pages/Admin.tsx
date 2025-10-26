import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getLot, getStalls, saveStalls } from '../lib/api'
import type { LotSummary, Stall } from '../lib/types'

export default function Admin() {
  const [params] = useSearchParams()
  const lotId = params.get('lotId') || 'osu-parking-lot-c-north'

  const [lot, setLot] = useState<LotSummary | null>(null)
  const [draft, setDraft] = useState<Stall[]>([])
  const [mode, setMode] = useState<'idle' | 'draw'>('idle')
  const [currentPoly, setCurrentPoly] = useState<[number, number][]>([])

  useEffect(() => {
    getLot(lotId).then(setLot)
    getStalls(lotId).then((data) => {
      const existing = data.stalls || []
      setDraft(existing)
    })
  }, [lotId])

  function onClickImage(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== 'draw') return
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setCurrentPoly((points) => [...points, [x, y]])
  }

  function finishPolygon() {
    if (currentPoly.length < 3) return
    const id = `S-${String(draft.length + 1).padStart(3, '0')}`
    const stall: Stall = {
      id,
      polygon: currentPoly as [number, number][],
      permit: ['C'],
      status: 'unknown'
    }
    setDraft((d) => [...d, stall])
    setCurrentPoly([])
    setMode('idle')
  }

  async function save() {
    await saveStalls(lotId, draft)
    alert(`Saved ${draft.length} stalls.`)
  }

  if (!lot) {
    return <div className='p-4'>Loading...</div>
  }

  const img = lot.latestImage?.url
    ? (import.meta.env.VITE_API_BASE || 'http://localhost:4000') + lot.latestImage.url
    : ''

  return (
    <div className='p-4 space-y-3'>
      <div className='flex items-center justify-between'>
        <div className='text-lg font-semibold'>Admin — {lot.name}</div>
        <div className='flex gap-2'>
          <button
            className={`px-3 py-1 rounded border ${mode === 'draw' ? 'bg-black text-white' : ''}`}
            onClick={() => setMode('draw')}
          >
            Draw Stall
          </button>
          <button
            className='px-3 py-1 rounded border'
            onClick={finishPolygon}
            disabled={!currentPoly.length}
          >
            Finish
          </button>
          <button className='px-3 py-1 rounded border' onClick={save}>
            Save
          </button>
        </div>
      </div>
      <div
        className='relative w-full max-w-4xl border select-none'
        onClick={onClickImage}
        style={{ aspectRatio: '8/5' }}
      >
        {img ? (
          <img src={img} className='absolute inset-0 w-full h-full object-contain' />
        ) : (
          <div className='flex items-center justify-center h-full'>No image</div>
        )}
        <svg className='absolute inset-0 w-full h-full'>
          {draft.map((s) => (
            <polygon
              key={s.id}
              points={s.polygon.map((p) => p.join(',')).join(' ')}
              fill={
                s.status === 'occupied'
                  ? 'rgba(220,38,38,0.45)'
                  : s.status === 'open'
                  ? 'rgba(34,197,94,0.45)'
                  : 'rgba(107,114,128,0.3)'
              }
              stroke='black'
              strokeWidth={1}
            />
          ))}
          {currentPoly.length > 0 && (
            <polyline
              points={currentPoly.map((p) => p.join(',')).join(' ')}
              fill='none'
              stroke='blue'
              strokeWidth={2}
            />
          )}
        </svg>
      </div>
      <div className='text-sm text-gray-600'>
        Click “Draw Stall”, then click points on the image; click “Finish” to save the polygon to the
        draft. Use the “Save” button to persist to the API.
      </div>
    </div>
  )
}
