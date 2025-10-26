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
    <div className='min-h-screen bg-osu-light text-osu-gray flex flex-col'>
      <header className='sticky top-0 z-40 bg-osu-scarlet text-white shadow-sm'>
        <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 text-white'>
          <div className='text-base sm:text-lg font-semibold tracking-tight text-white'>
            OSU Smart Parking
          </div>
          <button
            type='button'
            className='inline-flex items-center justify-center h-9 w-9 rounded-full border border-white/40 bg-osu-scarlet text-white hover:bg-osu-scarlet-dark transition-colors md:hidden'
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
          <nav className='hidden md:flex items-center gap-2 text-sm font-medium text-white'>
            {NAV_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.to}
                  target='_blank'
                  rel='noreferrer'
                  className='px-3 py-1 rounded-full border border-transparent text-white/90 hover:text-white hover:bg-osu-scarlet-dark transition-colors'
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
                        ? 'bg-white text-osu-scarlet font-semibold shadow-sm'
                        : 'text-white/90 hover:text-white hover:bg-osu-scarlet-dark',
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
          className={`md:hidden overflow-hidden border-t border-white/20 bg-osu-scarlet transition-[max-height] duration-300 ${
            menuOpen ? 'max-h-60' : 'max-h-0'
          }`}
        >
          <nav className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-3 flex flex-col gap-2 text-sm font-medium text-white'>
            {NAV_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.to}
                  target='_blank'
                  rel='noreferrer'
                  className='rounded-full border border-transparent px-3 py-2 text-white/90 hover:text-white hover:bg-osu-scarlet-dark transition-colors'
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
                        ? 'bg-white text-osu-scarlet font-semibold shadow-sm'
                        : 'text-white/90 hover:text-white hover:bg-osu-scarlet-dark',
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
