import { Baby, CalendarDays, Coffee, Home, LogIn } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useConference } from '../lib/conference'
import { I18nProvider, LANG_LABEL, useI18n } from '../lib/i18n'
import { LANGS } from '../lib/types'
import { cx } from './ui'
import DemoBar from './DemoBar'

export default function ExternalLayout() {
  const { defaultLang } = useConference()
  return (
    <I18nProvider fallback={defaultLang}>
      <Shell />
    </I18nProvider>
  )
}

function Shell() {
  const { t, lang, setLang } = useI18n()
  const { settings } = useConference()
  const nav = [
    { to: '/', label: t.home, icon: Home, end: true },
    { to: '/program', label: t.adultsShort, icon: CalendarDays },
    { to: '/barn', label: t.kids, icon: Baby },
    { to: '/koket', label: t.kitchen, icon: Coffee },
  ]
  return (
    <div className="min-h-dvh pb-24 sm:pb-10">
      <DemoBar />
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pt-4 pb-3">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-9 rounded-lg" />
            <span className="text-lg font-bold leading-tight">{settings.conference_name}</span>
          </Link>
          <div className="flex rounded-xl bg-white/10 p-0.5" role="group" aria-label="Language">
            {LANGS.map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                lang={l}
                aria-pressed={lang === l}
                className={cx('rounded-lg px-2.5 py-1.5 text-sm font-semibold', lang === l ? 'bg-white text-ink' : 'text-white/85 hover:text-white')}
                title={LANG_LABEL[l]}
              >
                {l === 'ar' ? 'ع' : l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <nav className="mx-auto hidden max-w-3xl gap-1 px-4 pb-2 sm:flex">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cx('flex items-center gap-1.5 rounded-t-xl px-4 py-2 text-sm font-medium', isActive ? 'bg-frost text-ink' : 'text-white/80 hover:text-white')}
            >
              <n.icon className="size-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        <Outlet />
      </main>

      <footer className="no-print mx-auto max-w-3xl px-4 pb-6 text-center text-xs text-slate-500">
        <Link to="/intern" className="inline-flex items-center gap-1 hover:text-ink">
          <LogIn className="size-3.5" /> {t.staffLogin}
        </Link>
      </footer>

      {/* Mobilnavigering i tumhöjd */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium', isActive ? 'text-accent' : 'text-slate-500')}
            >
              <n.icon className="size-5" /> {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
