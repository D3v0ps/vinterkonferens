import type { ReactNode } from 'react'
import { ArrowLeft, Baby, CalendarDays, ClipboardList, Coffee, Home, LogIn } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useConference } from '../lib/conference'
import { I18nProvider, LANG_LABEL, LANG_SHORT, useI18n } from '../lib/i18n'
import { LANGS } from '../lib/types'
import { Button, cx } from './ui'
import DemoBar from './DemoBar'
import { DisplayLast } from './Agenda'

export default function ExternalLayout() {
  const { defaultLang } = useConference()
  return (
    <I18nProvider fallback={defaultLang}>
      <Shell />
    </I18nProvider>
  )
}

/**
 * Visas när någon som inte är volontär öppnar /intern (InternalLayout ritar den): besökarsidans ram
 * med meny och språkval, på besökarens språk, så att det alltid finns en väg tillbaka.
 * `children` är extra knappar, t.ex. "Sluta visa som …" när en admin förhandsgranskar.
 */
export function NotVolunteer({ email, onSignOut, children }: { email: string | null; onSignOut?: () => void; children?: ReactNode }) {
  const { defaultLang } = useConference()
  return (
    <I18nProvider fallback={defaultLang}>
      <Shell staffLink={false}>
        <NotVolunteerBody email={email} onSignOut={onSignOut}>
          {children}
        </NotVolunteerBody>
      </Shell>
    </I18nProvider>
  )
}

function NotVolunteerBody({ email, onSignOut, children }: { email: string | null; onSignOut?: () => void; children?: ReactNode }) {
  const { t } = useI18n()
  return (
    <>
      <ClipboardList className="mb-3 size-9 text-muted" strokeWidth={1.75} aria-hidden />
      <h1 className="text-[2rem] leading-tight font-semibold tracking-tight text-ink sm:text-4xl">
        <DisplayLast text={t.notVolunteerTitle} />
      </h1>
      <p className="mt-3 max-w-[60ch] text-lg text-ink-soft">
        {email ? (
          t.notVolunteerAs(
            <b className="font-semibold break-all text-ink" dir="ltr">
              {email}
            </b>,
          )
        ) : (
          t.notVolunteerNoEmail
        )}{' '}
        {t.notVolunteerAsk}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-ink-soft"
        >
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden /> {t.toVisitorSite}
        </Link>
        {onSignOut && (
          <Button variant="secondary" onClick={onSignOut}>
            {t.signOut}
          </Button>
        )}
        {children}
      </div>
    </>
  )
}

/** Språkväljare: tydliga knappar med språkets eget namn, minst 44 px höga. */
function LanguageSwitch() {
  const { t, lang, setLang } = useI18n()
  return (
    <div className="flex shrink-0 rounded-xl border border-line bg-white p-0.5" role="group" aria-label={t.language}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          lang={l}
          dir={l === 'ar' ? 'rtl' : 'ltr'}
          aria-pressed={lang === l}
          aria-label={LANG_LABEL[l]}
          title={LANG_LABEL[l]}
          className={cx(
            'min-h-11 min-w-11 rounded-[0.6rem] px-2.5 text-base font-medium transition-colors',
            lang === l ? 'bg-ink text-white' : 'text-muted hover:text-ink',
          )}
        >
          <span className="sm:hidden">{LANG_SHORT[l]}</span>
          <span className="hidden sm:inline">{LANG_LABEL[l]}</span>
        </button>
      ))}
    </div>
  )
}

function Shell({ children, staffLink = true }: { children?: ReactNode; staffLink?: boolean }) {
  const { t } = useI18n()
  const { settings } = useConference()
  const nav = [
    { to: '/', label: t.home, icon: Home, end: true },
    { to: '/program', label: t.adultsShort, icon: CalendarDays },
    { to: '/barn', label: t.kids, icon: Baby },
    { to: '/koket', label: t.kitchen, icon: Coffee },
  ]
  return (
    <div className="min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-10">
      <DemoBar />
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/" className="flex min-h-11 min-w-0 items-center gap-2 text-ink">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-7 shrink-0 rounded-lg" />
            <span className="truncate text-lg font-semibold">{settings.conference_name}</span>
          </Link>
          <LanguageSwitch />
        </div>
        {/* Från surfplatta och uppåt: textmeny under namnet */}
        <nav className="no-print mx-auto hidden max-w-3xl gap-7 px-4 sm:flex" aria-label={t.mainNav}>
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  '-mb-px inline-flex min-h-11 items-center border-b-2 text-base font-medium transition-colors',
                  isActive ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-6 pb-12">
        {children ?? <Outlet />}
      </main>

      {staffLink && (
        <footer className="no-print mx-auto max-w-3xl px-4 pb-6">
          <div className="border-t border-line pt-3">
            <Link to="/intern" className="inline-flex min-h-11 items-center gap-2 text-base text-muted hover:text-ink">
              <LogIn className="size-4 rtl:-scale-x-100" aria-hidden /> {t.staffLogin}
            </Link>
          </div>
        </footer>
      )}

      {/* Mobilnavigering i tumhöjd, ovanför hemknappsfältet */}
      <nav
        className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur sm:hidden"
        aria-label={t.mainNav}
      >
        <div className="mx-auto grid max-w-md grid-cols-4">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 pt-2 pb-1.5 text-base leading-5 font-medium transition-colors',
                  isActive ? 'text-ink' : 'text-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <n.icon className="size-6" strokeWidth={isActive ? 2.25 : 1.75} aria-hidden />
                  <span className="max-w-full truncate">{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
