import { useEffect, useState } from 'react'
import {
  BarChart3, Baby, CalendarCheck, CalendarDays, ClipboardList, ExternalLink, Gauge, Home, Megaphone, Menu as MenuIcon,
  NotebookPen, Package, Settings, ShoppingCart, UsersRound, UtensilsCrossed, LogOut, WifiOff, X,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Button, Spinner, cx } from './ui'
import DemoBar from './DemoBar'
import Login from './Login'

export function useNavItems() {
  const a = useAuth()
  const canProgram = a.isAdmin || a.isLeadOf('forelasningar') || a.isLeadOf('konferencierer') || a.isLeadOf('fritids')
  return [
    { to: '/intern', label: 'Översikt', icon: Home, end: true },
    { to: '/intern/mitt-schema', label: 'Mitt schema', icon: CalendarCheck },
    { to: '/intern/kommitteer', label: 'Kommittéer & scheman', icon: UsersRound },
    { to: '/intern/info', label: 'Info & anslag', icon: Megaphone },
    { to: '/intern/anteckningar', label: 'Anteckningar', icon: NotebookPen },
    { to: '/intern/inkop', label: 'Inköp', icon: ShoppingCart },
    { to: '/intern/inventarier', label: 'Inventarielista', icon: Package },
    { to: '/intern/rakning', label: 'Flödesräkning', icon: Gauge },
    { to: '/intern/statistik', label: 'Statistik & betyg', icon: BarChart3 },
    ...(canProgram ? [{ to: '/intern/program', label: 'Program', icon: CalendarDays }] : []),
    ...(a.isMemberOf('koket') ? [{ to: '/intern/meny', label: 'Meny', icon: UtensilsCrossed }] : []),
    ...(a.isMemberOf('fritids') || a.isMemberOf('gastbemotare') ? [{ to: '/intern/fritids', label: 'Fritids & expresskassa', icon: Baby }] : []),
    ...(a.isAdmin ? [{ to: '/intern/installningar', label: 'Inställningar', icon: Settings }] : []),
  ]
}

export default function InternalLayout() {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const items = useNavItems()
  useEffect(() => setOpen(false), [loc.pathname])

  if (auth.status === 'loading') return <Spinner />
  if (auth.status === 'signedOut') return <Login />
  if (auth.membershipsError)
    return (
      <div className="mx-auto mt-16 max-w-md px-4 text-center">
        <WifiOff className="mx-auto size-10 text-slate-400" />
        <h1 className="mt-3 text-xl font-bold text-ink">Kunde inte hämta dina kommittéer</h1>
        <p className="mt-2 text-sm text-slate-600">Kontrollera nätverket och försök igen.</p>
        <p className="mt-1 text-xs text-slate-400">{auth.membershipsError}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={auth.reloadMemberships}>Försök igen</Button>
          <Button variant="secondary" onClick={auth.signOut}>
            Logga ut
          </Button>
        </div>
      </div>
    )
  if (!auth.membershipsLoaded) return <Spinner />
  if (!auth.isStaff)
    return (
      <div className="mx-auto mt-16 max-w-md px-4 text-center">
        <ClipboardList className="mx-auto size-10 text-slate-400" />
        <h1 className="mt-3 text-xl font-bold text-ink">Inte registrerad som volontär</h1>
        <p className="mt-2 text-sm text-slate-600">
          Du är inloggad som <b>{auth.email}</b>, men den adressen finns inte i någon kommitté. Be din kommittéansvarig att lägga till din
          e-post under Kommittéer → Volontärer.
        </p>
        <Button variant="secondary" className="mt-5" onClick={auth.signOut}>
          Logga ut
        </Button>
      </div>
    )

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          className={({ isActive }) =>
            cx('flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium', isActive ? 'bg-white text-ink shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white')
          }
        >
          <n.icon className="size-4.5 shrink-0" /> {n.label}
        </NavLink>
      ))}
    </nav>
  )

  const footer = (
    <div className="mt-6 space-y-1 border-t border-white/10 pt-4 text-sm">
      <div className="px-3 text-white/70">
        <div className="truncate font-medium text-white">{auth.displayName}</div>
        <div className="truncate text-xs">
          {auth.memberships
            .map((m) => `${auth.committees.find((c) => c.id === m.committee_id)?.name ?? ''}${m.is_lead ? ' (ansvarig)' : ''}`)
            .join(', ')}
        </div>
      </div>
      <Link to="/" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-white/80 hover:bg-white/10">
        <ExternalLink className="size-4" /> Besökarsidan
      </Link>
      <button onClick={auth.signOut} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-white/80 hover:bg-white/10">
        <LogOut className="size-4" /> Logga ut
      </button>
    </div>
  )

  return (
    <div className="min-h-dvh">
      <DemoBar />
      <div className="flex">
        <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 overflow-y-auto bg-ink p-4 lg:block">
          <div className="mb-5 px-3 text-lg font-bold text-white">Intern</div>
          {nav}
          {footer}
        </aside>

        <div className="min-w-0 flex-1">
          <header className="no-print sticky top-0 z-20 flex items-center justify-between bg-ink px-4 py-3 text-white lg:hidden">
            <span className="font-bold">Vinterkonferensen · Intern</span>
            <button onClick={() => setOpen(true)} aria-label="Meny" className="rounded-lg p-1.5 hover:bg-white/10">
              <MenuIcon className="size-6" />
            </button>
          </header>
          {open && (
            <div className="fixed inset-0 z-30 lg:hidden">
              <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
              <div className="absolute inset-y-0 end-0 w-72 overflow-y-auto bg-ink p-4">
                <div className="mb-4 flex justify-end">
                  <button onClick={() => setOpen(false)} aria-label="Stäng" className="rounded-lg p-1.5 text-white hover:bg-white/10">
                    <X className="size-6" />
                  </button>
                </div>
                {nav}
                {footer}
              </div>
            </div>
          )}
          <main className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
