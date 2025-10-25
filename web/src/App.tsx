import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'

const NAV_LINKS = [
  { to: '/', label: 'Discover' },
  { to: '/admin', label: 'Admin' },
  { to: 'https://go.osu.edu', label: 'OSU', external: true },
]

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <div className='min-h-screen bg-neutral-50 text-slate-900 flex flex-col'>
      <header className='sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-neutral-200'>
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4'>
          <div className='text-base sm:text-lg font-semibold tracking-tight text-slate-900'>
            OSU Smart Parking
          </div>
          <button
            type='button'
            className='inline-flex items-center justify-center h-9 w-9 rounded-full border border-neutral-200 bg-white text-slate-600 hover:text-rose-600 hover:border-rose-200 transition-colors md:hidden'
            aria-label='Toggle navigation'
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <span className='sr-only'>Toggle navigation</span>
            <svg className='h-5 w-5' xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              {menuOpen ? (
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M6 18L18 6M6 6l12 12' />
              ) : (
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M3.75 7.5h16.5M3.75 12h16.5M3.75 16.5h16.5' />
              )}
            </svg>
          </button>
          <nav className='hidden md:flex items-center gap-2 text-sm font-medium'>
            {NAV_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.to}
                  target='_blank'
                  rel='noreferrer'
                  className='px-3 py-1 rounded-full border border-transparent hover:border-rose-200 text-slate-600 hover:text-rose-600 transition-colors'
                >
                  {link.label}
                </a>
              ) : (
                <NavLink
                  key={link.label}
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) =>
                    [
                      'px-3 py-1 rounded-full transition-colors',
                      isActive
                        ? 'bg-rose-100 text-rose-700 border border-rose-200 shadow-sm'
                        : 'text-slate-600 hover:text-rose-600 hover:border-rose-200 border border-transparent',
                    ].join(' ')
                  }
                >
                  {link.label}
                </NavLink>
              )
            )}
          </nav>
        </div>
        <div
          className={`md:hidden overflow-hidden border-t border-neutral-200 bg-white transition-[max-height] duration-300 ${
            menuOpen ? 'max-h-60' : 'max-h-0'
          }`}
        >
          <nav className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-3 flex flex-col gap-2 text-sm font-medium'>
            {NAV_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.to}
                  target='_blank'
                  rel='noreferrer'
                  className='rounded-full border border-transparent px-3 py-2 text-slate-600 hover:text-rose-600 hover:border-rose-200 transition-colors'
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </a>
              ) : (
                <NavLink
                  key={link.label}
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) =>
                    [
                      'rounded-full px-3 py-2 transition-colors',
                      isActive
                        ? 'bg-rose-100 text-rose-700 border border-rose-200 shadow-sm'
                        : 'text-slate-600 hover:text-rose-600 hover:border-rose-200 border border-transparent',
                    ].join(' ')
                  }
                >
                  {link.label}
                </NavLink>
              )
            )}
          </nav>
        </div>
      </header>
      <main className='flex-1 overflow-y-auto overflow-x-hidden'>
        <Outlet />
      </main>
    </div>
  )
}
