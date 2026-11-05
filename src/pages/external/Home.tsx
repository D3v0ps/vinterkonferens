import { Baby, CalendarDays, ChevronRight, Coffee } from 'lucide-react'
import { Link } from 'react-router-dom'
import { NowNext, PostsList, useDaySessions } from '../../components/Agenda'
import { PlaceLine, brandImage } from '../../components/Brand'
import { ConferenceLockup } from '../../components/ConferenceLockup'
import { cx } from '../../components/ui'
import { useConference } from '../../lib/conference'
import { tr } from '../../lib/format'
import { useNow } from '../../lib/hooks'
import { Tr, useI18n } from '../../lib/i18n'
import { LOCALE, TZ, formatShortDay, localTime, sessionStatus, zonedToUtc } from '../../lib/time'
import { LANGS, type ConferenceDay, type Lang, type Localized } from '../../lib/types'

/** Konferensens dagar som ett spann på sidans språk: "6–8 november", "6–8 November", "6–8 نوفمبر". */
function dateRange(days: ConferenceDay[], lang: Lang): string {
  if (!days.length) return ''
  const dates = days.map((d) => d.date).sort()
  const f = new Intl.DateTimeFormat(LOCALE[lang], { timeZone: TZ, day: 'numeric', month: 'long' })
  const [a, b] = [zonedToUtc(dates[0], '12:00'), zonedToUtc(dates[dates.length - 1], '12:00')]
  // Engelskan ger "6 – 8 November"; moskén skriver tankstreck utan mellanslag.
  return dates.length > 1 ? f.formatRange(a, b).replace(/\s*–\s*/, '–') : f.format(a)
}

/**
 * Temat som på YouTube-kortet 2025: på sidans språk och därunder samma tema på det andra
 * konferensspråket (arabiska på den svenska sidan, svenska på den arabiska), lika stort.
 * Den engelska sidan får bara en rad.
 */
function taglineLines(tagline: Localized, lang: Lang): { text: string; lang: Lang }[] {
  const own = tagline[lang]?.trim()
  const shownLang = own ? lang : LANGS.find((l) => tagline[l]?.trim())
  if (!shownLang) return []
  const lines = [{ text: tagline[shownLang]!.trim(), lang: shownLang }]
  const other: Lang | null = lang === 'sv' ? 'ar' : lang === 'ar' ? 'sv' : null
  const second = other && other !== shownLang ? tagline[other]?.trim() : ''
  if (other && second) lines.push({ text: second, lang: other })
  return lines
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
  const firstDate = days.map((d) => d.date).sort()[0]
  const year = firstDate ? firstDate.slice(0, 4) : ''
  const venue = (settings.venue || '').trim()
  // Konferensdagar: kompakt hero (smalare lockup, utan tema och datumruta) så att "Nu & nästa" står högt.
  const compact = isConferenceDay
  const taglines = compact ? [] : taglineLines(settings.tagline, lang)
  // Efter konferensen visas ingen datumruta: den läses annars som att konferensen är på väg.
  const lastDate = days.map((d) => d.date).sort().at(-1)
  const range = compact || (lastDate && today > lastDate) ? '' : dateRange(days, lang)

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
      {/* Heron som omslaget 2025: allt på en mittaxel över fasaden i kampanjens navy (85 %), raka hörn */}
      <section
        // Lägre på bred skärm så att ingångarna syns; på konferensdagar lite lägre även i telefonen.
        className={cx(
          '-mx-4 -mt-6 mb-8 overflow-hidden bg-campaign bg-cover bg-[center_40%] px-6 pb-11 text-center text-white sm:mx-0 sm:mt-0 sm:px-10 sm:pt-10 sm:pb-11',
          compact ? 'pt-8' : 'pt-10',
        )}
        style={{ backgroundImage: `linear-gradient(rgb(33 41 122 / 0.85), rgb(33 41 122 / 0.85)), url(${brandImage('fasad-vinter.webp')})` }}
      >
        {when && <p className="mb-8 text-base text-white/85 first-letter:uppercase">{when}</p>}
        <ConferenceLockup name={settings.conference_name} year={year} compact={compact}>
          {taglines.length > 0 && (
            <p className="mt-[calc(var(--f2)*0.9)] text-lg text-white sm:text-xl">
              {taglines.map((x, i) => (
                <span
                  key={x.lang}
                  lang={x.lang === lang ? undefined : x.lang}
                  dir={x.lang === lang ? undefined : x.lang === 'ar' ? 'rtl' : 'ltr'}
                  className={cx('block text-balance', i > 0 && 'mt-1', x.lang === 'ar' ? 'text-[1.1em] leading-relaxed font-bold' : 'font-schedule leading-snug font-semibold')}
                >
                  {x.text}
                </span>
              ))}
            </p>
          )}
          {(range || venue) && (
            // Datumrutan och platsraden blir lika breda, som på omslaget
            <p
              className={cx(
                'mx-auto flex w-fit flex-col items-stretch',
                !range ? 'mt-[calc(var(--f2)*0.8_-_0.42rem)]' : taglines.length ? 'mt-[calc(var(--f2)*0.6)]' : 'mt-[calc(var(--f2)*1)]',
              )}
            >
              {range && (
                <span
                  className={cx(
                    'block bg-white px-[0.57em] leading-none text-campaign',
                    // Luften räknas från siffrornas över- och underkant, som på omslaget (cirka 0,4 em).
                    // Almarai står lägre i raden och har underhäng, därför mer luft under.
                    lang === 'ar' ? 'pt-[0.22em] pb-[0.42em] font-extrabold' : 'pt-[0.27em] pb-[0.32em] font-display',
                  )}
                  style={{ fontSize: 'calc(var(--f2) * 0.6)', ...(lang === 'ar' ? { fontFamily: '"Almarai", var(--font-arabic)' } : {}) }}
                >
                  {range}
                </span>
              )}
              {venue && <PlaceLine venue={venue} className={range ? 'mt-[calc(var(--f2)*0.4_-_0.42rem)]' : ''} />}
            </p>
          )}
        </ConferenceLockup>
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
