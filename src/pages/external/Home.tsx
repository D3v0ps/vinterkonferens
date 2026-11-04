import { Baby, CalendarDays, ChevronRight, Coffee, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { NowNext, PostsList, useDaySessions } from '../../components/Agenda'
import { Card } from '../../components/ui'
import { useConference } from '../../lib/conference'
import { tr } from '../../lib/format'
import { useNow } from '../../lib/hooks'
import { useI18n } from '../../lib/i18n'
import { formatDay, localTime, sessionStatus } from '../../lib/time'

export default function Home() {
  const { t, lang } = useI18n()
  const { settings, days, isConferenceDay, currentDay } = useConference()
  const at = useNow()
  const date = currentDay?.date ?? null
  const { sessions } = useDaySessions(date, ['adults', 'all'])
  const { sessions: kidsSessions } = useDaySessions(date, ['kids'])
  const kidsNow = kidsSessions.find((s) => sessionStatus(s, at) === 'ongoing') ?? kidsSessions.find((s) => sessionStatus(s, at) === 'upcoming')

  const tiles = [
    { to: '/program', title: t.adults, sub: t.programLead, icon: CalendarDays, cls: 'bg-ink text-white' },
    {
      to: '/barn',
      title: t.kids,
      sub: kidsNow ? `${localTime(kidsNow.starts_at)} · ${tr(kidsNow.title, lang)}` : t.kidsLead,
      icon: Baby,
      cls: 'bg-emerald-700 text-white',
    },
    { to: '/koket', title: t.kitchen, sub: tr(settings.kitchen_info, lang) || t.kitchenLead, icon: Coffee, cls: 'bg-accent text-white' },
  ]

  return (
    <>
      <section className="mb-5">
        <p className="text-sm font-semibold first-letter:uppercase text-accent">
          {isConferenceDay && date ? `${t.today} · ${formatDay(date, lang)}` : days[0] ? `${t.conferenceStarts} ${formatDay(days[0].date, lang)}` : ''}
        </p>
        <h1 className="mt-1 text-3xl font-black leading-tight tracking-tight text-ink">{settings.conference_name}</h1>
        {tr(settings.tagline, lang) && <p className="mt-1 text-slate-600">{tr(settings.tagline, lang)}</p>}
        {settings.venue && (
          <p className="mt-2 inline-flex items-center gap-1 text-sm text-slate-500">
            <MapPin className="size-4" /> {settings.venue}
          </p>
        )}
      </section>

      <PostsList page="home" />
      {isConferenceDay && <NowNext sessions={sessions} />}

      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((x) => (
          <Link key={x.to} to={x.to} className={`group flex items-center gap-3 rounded-2xl p-4 shadow-sm sm:flex-col sm:items-start ${x.cls}`}>
            <x.icon className="size-8 shrink-0 opacity-90" />
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold">{x.title}</span>
              <span className="line-clamp-2 block text-sm opacity-85">{x.sub}</span>
            </span>
            <ChevronRight className="size-5 shrink-0 opacity-70 sm:hidden rtl:rotate-180" />
          </Link>
        ))}
      </div>

      {settings.contact && (
        <Card className="mt-5 p-4 text-sm text-slate-600">
          <span className="font-semibold text-ink">{t.info}: </span>
          {settings.contact}
        </Card>
      )}
    </>
  )
}
