import { Baby, CalendarDays, ChevronRight, Coffee, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DisplayLast, NowNext, PostsList, useDaySessions } from '../../components/Agenda'
import { brandImage } from '../../components/Brand'
import { useConference } from '../../lib/conference'
import { tr } from '../../lib/format'
import { useNow } from '../../lib/hooks'
import { Tr, useI18n } from '../../lib/i18n'
import { TZ, formatShortDay, localTime, sessionStatus, zonedToUtc } from '../../lib/time'
import type { ConferenceDay, Lang } from '../../lib/types'

const LOCALE: Record<Lang, string> = { sv: 'sv-SE', en: 'en-GB', ar: 'ar' }

/** Konferensens dagar som ett spann på sidans språk: "6–8 november", "6–8 November". */
function dateRange(days: ConferenceDay[], lang: Lang): string {
  if (!days.length) return ''
  const dates = days.map((d) => d.date).sort()
  const f = new Intl.DateTimeFormat(LOCALE[lang], { timeZone: TZ, day: 'numeric', month: 'long' })
  const [a, b] = [zonedToUtc(dates[0], '12:00'), zonedToUtc(dates[dates.length - 1], '12:00')]
  return dates.length > 1 ? f.formatRange(a, b) : f.format(a)
}

export default function Home() {
  const { t, lang } = useI18n()
  const { settings, days, today, isConferenceDay, currentDay } = useConference()
  const at = useNow()
  const date = currentDay?.date ?? null
  const { sessions } = useDaySessions(date, ['adults', 'all'])
  const { sessions: kidsSessions } = useDaySessions(date, ['kids'])
  const kidsNow = kidsSessions.find((s) => sessionStatus(s, at) === 'ongoing') ?? kidsSessions.find((s) => sessionStatus(s, at) === 'upcoming')

  const when =
    isConferenceDay && date
      ? `${t.today} · ${formatShortDay(date, lang)}`
      : days[0] && today < days[0].date
        ? `${t.conferenceStarts} ${formatShortDay(days[0].date, lang)}`
        : ''
  const tagline = tr(settings.tagline, lang)
  const venue = (settings.venue || '').trim()
  // Utan slogan: datum och plats i stället, så att rubriken aldrig står ensam.
  const range = tagline ? '' : dateRange(days, lang)

  // Tre ingångar som en lugn lista – inga färgade plattor.
  const entries = [
    { to: '/program', title: t.adults, sub: t.programLead, icon: CalendarDays },
    {
      to: '/barn',
      title: t.kids,
      sub: kidsNow ? (
        <>
          <span dir="ltr">{localTime(kidsNow.starts_at)}</span> · <Tr value={kidsNow.title} />
        </>
      ) : (
        t.kidsLead
      ),
      icon: Baby,
    },
    { to: '/koket', title: t.kitchen, sub: tr(settings.kitchen_info, lang) ? <Tr value={settings.kitchen_info} /> : t.kitchenLead, icon: Coffee },
  ]

  return (
    <>
      <section
        className="relative -mx-4 -mt-6 mb-8 overflow-hidden bg-ink bg-cover bg-center px-5 pt-10 pb-11 text-white sm:mx-0 sm:mt-0 sm:rounded-lg sm:px-10 sm:pt-14 sm:pb-14"
        style={{ backgroundImage: `linear-gradient(rgba(26,35,126,0.84), rgba(26,35,126,0.9)), url(${brandImage('fasad-vinter.webp')})` }}
      >
        {/* Moskéns geometriska mönster, svagt i guld */}
        <span
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-60"
          style={{ backgroundImage: `url(${brandImage('monster-guld.png')})` }}
          aria-hidden
        />
        <div className="relative">
          {when && <p className="text-base text-white/85 first-letter:uppercase">{when}</p>}
          <h1 className="mt-2 text-[clamp(2.1rem,8.6vw,3.75rem)] leading-[1.05] break-words hyphens-auto">
            <DisplayLast text={settings.conference_name} />
          </h1>
          <span className="mt-4 block h-0.5 w-20 bg-accent" aria-hidden />
          {tagline ? (
            <p className="mt-4 max-w-[36ch] text-xl leading-snug text-white">
              <Tr value={settings.tagline} />
            </p>
          ) : (
            (range || venue) && (
              <p className="mt-4 max-w-[36ch] text-xl leading-snug text-white">
                {range}
                {range && venue && ' · '}
                {venue && <bdi>{venue}</bdi>}
              </p>
            )
          )}
          {tagline && venue && (
            <p className="mt-3 flex items-center gap-1.5 text-base text-white/85">
              <MapPin className="size-4 shrink-0" aria-hidden /> <bdi>{venue}</bdi>
            </p>
          )}
        </div>
      </section>

      <PostsList page="home" />
      {isConferenceDay && <NowNext sessions={sessions} />}

      <ul className="divide-y divide-line border-y border-line">
        {entries.map((x) => (
          <li key={x.to}>
            <Link to={x.to} className="group flex min-h-18 items-center gap-4 py-4">
              <x.icon className="size-6 shrink-0 text-ink-soft" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-lg leading-snug font-semibold text-ink group-hover:underline group-hover:underline-offset-4">{x.title}</span>
                <span className="mt-0.5 block text-base break-words text-muted">{x.sub}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>

      {settings.contact && (
        <p className="mt-8 text-base whitespace-pre-line text-muted">
          <span className="font-medium text-ink">{t.info}:</span> {settings.contact}
        </p>
      )}
    </>
  )
}
