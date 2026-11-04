// Navigering i artifacten. Där följer bara en enkel #namn med i länkar och adressfältet
// (aldrig #/sökväg), så varje sida får ett namn: #program, #barn, #intern-rakning …
import { useEffect, type ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'

export function pathToHash(path: string): string {
  return path.replace(/^\/+|\/+$/g, '').replace(/\//g, '-')
}

export function hashToPath(hash: string): string {
  const h = decodeURIComponent(hash.replace(/^#/, '')).replace(/[^\w-]/g, '')
  if (!h) return '/'
  if (h === 'intern') return '/intern'
  if (h.startsWith('intern-kommitteer-')) return `/intern/kommitteer/${h.slice('intern-kommitteer-'.length)}`
  if (h.startsWith('intern-')) return `/intern/${h.slice('intern-'.length)}`
  return `/${h}`
}

function HashSync() {
  const loc = useLocation()
  const navigate = useNavigate()

  // Sida → adressfält
  useEffect(() => {
    const want = pathToHash(loc.pathname)
    const have = decodeURIComponent(window.location.hash.replace(/^#/, ''))
    if (want !== have) {
      try {
        window.history.replaceState(null, '', want ? `#${want}` : window.location.pathname + window.location.search)
      } catch {
        window.location.hash = want
      }
    }
    window.scrollTo(0, 0)
  }, [loc.pathname])

  // Adressfält → sida (länkar in till en viss sida)
  useEffect(() => {
    const onHash = () => {
      const path = hashToPath(window.location.hash)
      if (path !== window.location.pathname) navigate(path)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [navigate])

  return null
}

export function ArtifactRouter({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[hashToPath(window.location.hash)]}>
      <HashSync />
      {children}
    </MemoryRouter>
  )
}
