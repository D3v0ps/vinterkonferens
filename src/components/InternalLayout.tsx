import { useEffect, useState } from 'react'
import {
  BarChart3, Baby, CalendarCheck, CalendarDays, ExternalLink, Gauge, Home, Megaphone, Menu as MenuIcon,
  NotebookPen, Package, Settings, ShoppingCart, UsersRound, UtensilsCrossed, LogOut, WifiOff, X,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Button, Spinner, cx } from './ui'
import DemoBar from './DemoBar'
import Login from './Login'
import ViewAsControl from './ViewAsControl'
import { NotVolunteer } from './ExternalLayout'

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
        <p className="mt-2 text-base text-muted">Kontrollera nätverket och försök igen.</p>
        <p className="mt-1 text-sm text-muted">{auth.membershipsError}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={auth.reloadMemberships}>Försök igen</Button>
          {!auth.managedSignIn && (
            <Button variant="secondary" onClick={auth.signOut}>
              Logga ut
            </Button>
          )}
        </div>
      </div>
    )
  if (!auth.membershipsLoaded) return <Spinner />
  if (!auth.isStaff)
    return (
      <NotVolunteer email={auth.email} onSignOut={auth.managedSignIn || auth.viewAs ? undefined : auth.signOut}>
        {auth.viewAs && (
          <Button variant="secondary" onClick={() => auth.setViewAs(null)}>
            Sluta visa som {auth.viewAs}
          </Button>
        )}
      </NotVolunteer>
    )

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          className={({ isActive }) =>
            cx('flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-base', isActive ? 'bg-white font-medium text-ink' : 'text-white/80 hover:bg-white/10 hover:text-white')
          }
        >
          <n.icon className="size-4.5 shrink-0" /> {n.label}
        </NavLink>
      ))}
    </nav>
  )

  const footer = (
    <div className="mt-6 space-y-1 border-t border-white/10 pt-4 text-base">
      <div className="px-3 text-white/70">
        <div className="truncate font-medium text-white">{auth.displayName}</div>
        <div className="text-sm">
          {auth.memberships
            .map((m) => `${auth.committees.find((c) => c.id === m.committee_id)?.name ?? ''}${m.is_lead ? ' (ansvarig)' : ''}`)
            .join(', ')}
        </div>
      </div>
      {auth.realIsAdmin && <ViewAsControl />}
      <Link to="/" className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-white/80 hover:bg-white/10">
        <ExternalLink className="size-4" /> Besökarsidan
      </Link>
      {!auth.managedSignIn && (
        <button onClick={auth.signOut} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-white/80 hover:bg-white/10">
          <LogOut className="size-4" /> Logga ut
        </button>
      )}
    </div>
  )

  return (
    <div className="min-h-dvh lg:flex lg:h-dvh lg:flex-col">
      <div className="lg:shrink-0">
        <DemoBar />
      </div>
      <div className="flex lg:min-h-0 lg:flex-1">
        <aside className="no-print hidden w-68 shrink-0 overflow-y-auto bg-ink p-4 lg:block lg:h-full">
          <div className="mb-5 px-3 text-white">
            <div className="text-lg font-semibold">Vinterkonferensen</div>
            <div className="text-base text-white/70">för volontärer</div>
          </div>
          {nav}
          {footer}
        </aside>

        <div id="main-scroll" className="min-w-0 flex-1 lg:overflow-y-auto">
          <header className="no-print sticky top-[env(safe-area-inset-top,0px)] z-20 flex items-center justify-between bg-ink px-4 py-2 text-white lg:hidden">
            <span className="font-semibold">
              Vinterkonferensen <span className="font-normal text-white/70">för volontärer</span>
            </span>
            <button onClick={() => setOpen(true)} aria-label="Meny" className="grid size-11 place-items-center rounded-xl hover:bg-white/10">
              <MenuIcon className="size-6" />
            </button>
          </header>
          {open && (
            <div className="fixed inset-0 z-30 lg:hidden">
              <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
              <div className="absolute inset-y-0 end-0 w-80 max-w-[85vw] overflow-y-auto bg-ink p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
                <div className="mb-4 flex justify-end">
                  <button onClick={() => setOpen(false)} aria-label="Stäng" className="grid size-11 place-items-center rounded-xl text-white hover:bg-white/10">
                    <X className="size-6" />
                  </button>
                </div>
                {nav}
                {footer}
              </div>
            </div>
          )}
          {auth.viewAs && (
            <div className="no-print flex flex-wrap items-center justify-between gap-2 bg-ice px-4 py-2 text-base text-ink lg:px-8">
              <span>
                Du ser sidan som <b>{auth.displayName}</b> ({auth.viewAs}).
              </span>
              <button className="min-h-11 rounded-lg bg-white px-3 font-medium text-ink" onClick={() => auth.setViewAs(null)}>
                Sluta förhandsgranska
              </button>
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
