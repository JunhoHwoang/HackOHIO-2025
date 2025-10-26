import { useState, useRef, useEffect } from 'react'
import { useApp } from '../state/store'

const PERMIT_OPTIONS = [
  { value: '', label: 'All permits' },
  { value: 'A', label: 'Permit A' },
  { value: 'B', label: 'Permit B' },
  { value: 'C', label: 'Permit C' },
  { value: 'Visitor', label: 'Visitor' },
  { value: 'West Campus', label: 'West Campus' },
  { value: 'Staff', label: 'Staff' },
]

export default function Filters() {
  const filters = useApp((s) => s.filters)
  const setFilters = useApp((s) => s.setFilters)
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = PERMIT_OPTIONS.find((opt) => opt.value === (filters.permit || '')) || PERMIT_OPTIONS[0]

  return (
    <div className='relative inline-block text-left' ref={dropdownRef}>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        className='inline-flex items-center gap-2 rounded-full border border-osu-scarlet bg-osu-scarlet px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-osu-scarlet-dark transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
      >
        Filters
        <span className='text-xs text-white/80'>{selected.label}</span>
      </button>
      {open && (
        <div className='absolute right-0 mt-2 w-48 rounded-xl border border-neutral-200 bg-white shadow-lg ring-1 ring-black/5 z-30'>
          <div className='py-2'>
            {PERMIT_OPTIONS.map((option) => (
              <label
                key={option.value || 'any'}
                className='flex items-center gap-2 px-3 py-1.5 text-sm text-osu-gray hover:bg-osu-light cursor-pointer'
              >
                <input
                  type='radio'
                  name='permit-filter'
                  value={option.value}
                  checked={(filters.permit || '') === option.value}
                  onChange={() => {
                    setFilters({ permit: option.value || undefined })
                    setOpen(false)
                  }}
                  className='text-red-700 focus:ring-red-700'
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
