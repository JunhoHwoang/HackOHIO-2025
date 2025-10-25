import type { LotSummary, Stall } from '../lib/types'

function colorFor(status: Stall['status']) {
  if (status === 'open') return 'rgba(34,197,94,0.55)'
  if (status === 'occupied') return 'rgba(220,38,38,0.55)'
  return 'rgba(107,114,128,0.35)'
}

function polygonPoints(poly: [number, number][]) {
  return poly.map((p) => p.join(',')).join(' ')
}

export default function BirdsEyeCanvas({ lot, stalls }: { lot: LotSummary; stalls: Stall[] }) {
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
  const src = lot.latestImage?.url ? `${base}${lot.latestImage.url}` : ''
  const dims = lot.metadata?.imageDimensions || { width: 1024, height: 768 }

  return (
    <div className='relative h-full w-full select-none'>
      <svg
        viewBox={`0 0 ${dims.width} ${dims.height}`}
        preserveAspectRatio='xMidYMid meet'
        className='absolute inset-0 h-full w-full'
      >
        {src ? (
          <image href={src} width={dims.width} height={dims.height} />
        ) : (
          <rect width='100%' height='100%' fill='#f4f4f5' />
        )}
        {stalls.map((stall) => (
          <polygon
            key={stall.id}
            points={polygonPoints(stall.polygon)}
            fill={colorFor(stall.status)}
            stroke='rgba(30,41,59,0.6)'
            strokeWidth={4}
            strokeLinejoin='round'
          />
        ))}
      </svg>
      <div className='absolute top-2 right-2 rounded bg-white/90 px-2 py-1 text-xs shadow'>
        Updated: {lot.latestImage ? new Date(lot.latestImage.captured_at).toLocaleString() : '—'} • Source:{' '}
        {lot.latestImage?.source || '—'}
      </div>
    </div>
  )
}
