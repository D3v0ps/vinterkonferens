// Delade byggstenar för besökarsidorna: sidrubrik, dagväljare, programlista och anslag.
import { useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Check, Clock, MapPin, Moon, Music, Pin, Star } from 'lucide-react'
import { useConference } from '../lib/conference'
import { tr } from '../lib/format'
import { useList, useNow } from '../lib/hooks'
import { Tr, useI18n } from '../lib/i18n'
import { formatShortDay, localDate, localTime, minutesBetween, relMinutes, sessionProgress, sessionStatus } from '../lib/time'
import type { Audience, ConferenceDay, Post, PostPage, Session } from '../lib/types'
import FeedbackDialog, { useRated } from './FeedbackDialog'
import { Button, Empty, cx } from './ui'

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/

/**
 * Rubrik i moskéns rubriksnitt (Abril Fatface, som på konferensens affisch).
 * Arabisk skrift får Amiri via typsnittsstacken.
 */
export function DisplayLast({ text }: { text: string }) {
  return <span className={cx('font-display font-normal', ARABIC_SCRIPT.test(text) ? 'tracking-normal' : 'tracking-[0.01em]')}>{text}</span>
}

/** Sidans rubrik och ingress på besökarsidorna. */
export function PageTitle({ title, lead }: { title: string; lead?: string }) {
  return (
    <header className="mb-7">
      <h1 className="text-[2.25rem] leading-[1.1] text-ink sm:text-5xl">
        <DisplayLast text={title} />
      </h1>
      <span className="mt-3 block h-0.5 w-14 bg-accent" aria-hidden />
      {lead && <p className="mt-3 max-w-[60ch] text-lg text-muted">{lead}</p>}
    </header>
  )
}

/** Vald dag (standard: idag, annars nästa konferensdag). */
export function useSelectedDay() {
  const { days, currentDay } = useConference()
  const [picked, setPicked] = useState<string | null>(null)
  const date = picked ?? currentDay?.date ?? null
  return { days, date, setDate: setPicked }
}

/**
 * Sant om någon av texterna inte får plats på en rad i flikarna. Då bryts alla flikar på samma ställe
 * (veckodag / datum) i stället för att bara de längsta radbryts, så att flikarna ser lika ut.
 */
function useTooTight(ref: RefObject<HTMLDivElement | null>, labels: string[]) {
  const [tight, setTight] = useState(false)
  const key = labels.join('|')
  useLayoutEffect(() => {
    const el = ref.current
    const ctx = document.createElement('canvas').getContext('2d')
    if (!el || !ctx) return
    let width = -1
    const check = (force = false) => {
      const tab = el.querySelector<HTMLElement>('[role=tab]')
      const line = tab?.firstElementChild
      if (!tab || !line || (!force && tab.clientWidth === width)) return
      width = tab.clientWidth
      const cs = getComputedStyle(tab)
      const ls = getComputedStyle(line)
      const room = tab.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      ctx.font = `${ls.fontWeight} ${ls.fontSize} ${ls.fontFamily}`
      setTight(key.split('|').some((l) => ctx.measureText(l.charAt(0).toLocaleUpperCase() + l.slice(1)).width > room - 1))
    }
    check(true)
    const ro = new ResizeObserver(() => check())
    ro.observe(el)
    // Webbtypsnittet kan komma efter första mätningen.
    void document.fonts?.ready.then(() => check(true))
    return () => ro.disconnect()
  }, [ref, key])
  return tight
}

export function DayTabs({ days, value, onChange }: { days: ConferenceDay[]; value: string | null; onChange: (d: string) => void }) {
  const { lang, t } = useI18n()
  const { today } = useConference()
  const ref = useRef<HTMLDivElement>(null)
  // formatShortDay tar bort "," men inte arabiskans "،"; utan det får "الجمعة 6 نوفمبر" plats på en rad i telefonen.
  const labels = days.map((d) => formatShortDay(d.date, lang).replace(/،/g, ''))
  const tight = useTooTight(ref, labels)
  if (days.length < 2) return null
  return (
    <div
      ref={ref}
      className="no-print mb-6 grid gap-1 rounded-lg bg-ice p-1"
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      role="tablist"
      aria-label={t.chooseDay}
    >
      {days.map((d, i) => {
        const on = value === d.date
        const isToday = d.date === today
        const [weekday, ...rest] = labels[i].split(' ')
        return (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(d.date)}
            className={cx(
              'flex min-h-14 min-w-0 flex-col items-center justify-center rounded-md px-1 py-1.5 text-center leading-tight transition-colors',
              on ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {tight ? (
              <span className="text-base font-semibold">
                <span className="block first-letter:uppercase">{weekday}</span>
                <span className="block">{rest.join(' ')}</span>
              </span>
            ) : (
              <span className="text-base font-semibold whitespace-nowrap first-letter:uppercase">{labels[i]}</span>
            )}
            {(isToday || tr(d.label, lang)) && (
              <span className="mt-0.5 max-w-full truncate text-sm text-muted">
                {isToday && <span className="font-medium text-ink">{t.today}</span>}
                {isToday && tr(d.label, lang) && ' · '}
                <Tr value={d.label} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Publicerade programpunkter för en dag och målgrupp. */
export function useDaySessions(date: string | null, audiences: Audience[]) {
  const { data, loading } = useList('sessions', { filters: [{ col: 'published', op: 'eq', value: true }], order: [{ col: 'starts_at' }] }, { pollMs: 60_000 })
  const list = useMemo(
    () => data.filter((s) => date && localDate(s.starts_at) === date && audiences.includes(s.audience)),
    [data, date, audiences.join()],
  )
  return { sessions: list, loading }
}

function LiveDot() {
  return <span className="inline-block size-2.5 shrink-0 rounded-full bg-accent-strong" aria-hidden />
}

/** Hur långt programpunkten har kommit. Fylls från sidans början, alltså från höger på arabiska. */
function Progress({ value }: { value: number }) {
  return (
    <div className="mt-3 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
      <div className="h-full rounded-full bg-accent-strong transition-all" style={{ width: `${value * 100}%` }} />
    </div>
  )
}

/**
 * Programmet som en tryckt programlista: tid till vänster, titel, talare och sal som metadata.
 * Det som varit stryks över, det som pågår markeras med signalfärgen och nästa föreläsning får en etikett.
 */
export function Agenda({ sessions, showFeedback = true }: { sessions: Session[]; showFeedback?: boolean }) {
  const { t, lang } = useI18n()
  const at = useNow(15_000)
  const { isRated, markRated } = useRated()
  const [rating, setRating] = useState<Session | null>(null)

  const nextId = sessions.find((s) => s.kind === 'lecture' && localDate(s.starts_at) === localDate(at) && sessionStatus(s, at) === 'upcoming')?.id
  if (!sessions.length) return <Empty>{t.noProgram}</Empty>

  return (
    <>
      <ol className="divide-y divide-line border-y border-line">
        {sessions.map((s) => {
          const st = sessionStatus(s, at)
          const done = st === 'done'
          const ongoing = st === 'ongoing'
          const isNext = s.id === nextId
          const canRate = showFeedback && s.kind === 'lecture' && s.feedback_enabled && done
          const minor = s.kind === 'preshow' || s.kind === 'prayer' || s.kind === 'break' || s.kind === 'meal'
          const description = tr(s.description, lang)
          const hasMeta = !!(s.speaker || s.room || s.kind === 'preshow' || s.kind === 'prayer')
          return (
            <li key={s.id} className={cx('flex gap-4', minor ? 'py-3.5' : 'py-4')} aria-current={ongoing ? 'true' : undefined}>
              {/* Tidskolumn */}
              <div className="w-14 shrink-0 tabular-nums">
                <p className={cx('text-base font-semibold', done ? 'text-muted' : ongoing ? 'text-accent-strong' : 'text-ink')}>
                  <span dir="ltr">{localTime(s.starts_at)}</span>
                </p>
                <p className="text-sm text-muted">
                  <span dir="ltr">{localTime(s.ends_at)}</span>
                </p>
              </div>

              <div className="min-w-0 flex-1">
                {ongoing && (
                  <p className="mb-0.5 flex items-center gap-2 text-base font-medium text-accent-strong">
                    <LiveDot /> {t.now}
                  </p>
                )}
                {isNext && (
                  <p className="mb-0.5 text-base font-medium text-ink">
                    {t.next} · {relMinutes(minutesBetween(at, s.starts_at), lang)}
                  </p>
                )}
                <h3
                  className={cx(
                    'leading-snug',
                    minor ? 'text-base font-medium' : 'text-lg font-semibold',
                    done ? 'text-muted line-through decoration-1' : minor ? 'text-ink-soft' : 'text-ink',
                  )}
                >
                  {done && <span className="sr-only">{t.done}: </span>}
                  <Tr value={s.title} />
                </h3>
                {description && !done && (
                  <p className="mt-1 text-base text-muted">
                    <Tr value={s.description} />
                  </p>
                )}
                {hasMeta && (
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-base text-muted">
                    {s.kind === 'preshow' && (
                      <span className="inline-flex items-center gap-1.5">
                        <Music className="size-4" aria-hidden /> {t.preshow}
                      </span>
                    )}
                    {s.kind === 'prayer' && (
                      <span className="inline-flex items-center gap-1.5 text-ink-soft">
                        <Moon className="size-4" aria-hidden /> {t.prayer}
                      </span>
                    )}
                    {s.speaker && <span>{s.speaker}</span>}
                    {s.room && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-4" aria-hidden /> {s.room}
                      </span>
                    )}
                  </p>
                )}
                {ongoing && <Progress value={sessionProgress(s, at)} />}
                {canRate &&
                  (isRated(s.id) ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-base text-emerald-800">
                      <Check className="size-4" aria-hidden /> {t.rated}
                    </p>
                  ) : (
                    <Button variant="secondary" className="mt-3" onClick={() => setRating(s)}>
                      <Star className="size-5 fill-accent text-accent-strong" aria-hidden /> {t.rate}
                    </Button>
                  ))}
              </div>
            </li>
          )
        })}
      </ol>
      <FeedbackDialog session={rating} onClose={() => setRating(null)} onDone={markRated} />
    </>
  )
}

/**
 * Nu & nästa: vad pågår och vad kommer härnäst. Med `rateBanner` (startsidan) även en uppmaning att
 * betygsätta det som just tog slut. Programsidan har betygsknappen i listan i stället, så att samma
 * föreläsning inte erbjuds två gånger.
 */
export function NowNext({ sessions, rateBanner = true }: { sessions: Session[]; rateBanner?: boolean }) {
  const { t, lang } = useI18n()
  const at = useNow(15_000)
  const { isRated, markRated } = useRated()
  const [rating, setRating] = useState<Session | null>(null)
  const headingId = useId()
  const lectures = sessions.filter((s) => s.kind === 'lecture')
  if (!lectures.length) return null
  const ongoing = lectures.find((s) => sessionStatus(s, at) === 'ongoing')
  const next = lectures.find((s) => sessionStatus(s, at) === 'upcoming')
  const justEnded = rateBanner
    ? [...lectures]
        .reverse()
        .find((s) => sessionStatus(s, at) === 'done' && s.feedback_enabled && minutesBetween(s.ends_at, at) <= 45 && !isRated(s.id))
    : undefined
  const preshow = next && sessions.find((s) => s.kind === 'preshow' && s.ends_at <= next.starts_at && minutesBetween(s.ends_at, next.starts_at) <= 15)
  const allDone = !ongoing && !next && lectures.every((s) => sessionStatus(s, at) === 'done')

  return (
    <section className="mb-10" aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3 text-xl font-semibold text-ink">
        {t.nowNext}
      </h2>

      {justEnded && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-ice p-4">
          <Star className="size-6 shrink-0 fill-accent text-accent-strong" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-base text-muted">{t.justEnded}</p>
            <p className="text-base font-semibold break-words text-ink">
              <Tr value={justEnded.title} />
            </p>
          </div>
          <Button className="shrink-0" onClick={() => setRating(justEnded)}>
            {t.rate}
          </Button>
        </div>
      )}

      {/* Bara en linje ovanför: listan eller ingångarna under har sin egen. */}
      <div className="divide-y divide-line border-t border-line">
        {ongoing && (
          <div className="py-4">
            <p className="flex items-center gap-2 text-base font-medium text-accent-strong">
              <LiveDot /> {t.now}
            </p>
            <p className="mt-1 text-xl leading-snug font-semibold text-ink">
              <Tr value={ongoing.title} />
            </p>
            <p className="mt-0.5 text-base text-muted">
              {ongoing.speaker && `${ongoing.speaker} · `}
              {t.ongoingUntil} <span dir="ltr">{localTime(ongoing.ends_at)}</span>
              {ongoing.room && ` · ${ongoing.room}`}
            </p>
            <Progress value={sessionProgress(ongoing, at)} />
          </div>
        )}
        {next && (
          <div className="py-4">
            <p className="flex items-center gap-2 text-base font-medium text-ink">
              <Clock className="size-4 shrink-0" aria-hidden /> {t.nextLecture} · {relMinutes(minutesBetween(at, next.starts_at), lang)}
            </p>
            <p className="mt-1 text-xl leading-snug font-semibold text-ink">
              <Tr value={next.title} />
            </p>
            <p className="mt-0.5 text-base text-muted">
              <span dir="ltr">{localTime(next.starts_at)}</span>
              {next.speaker && ` · ${next.speaker}`}
              {next.room && ` · ${next.room}`}
            </p>
            {preshow && sessionStatus(preshow, at) !== 'done' && (
              <p className="mt-2 flex items-center gap-1.5 text-base text-muted">
                <Music className="size-4 shrink-0" aria-hidden /> <span dir="ltr">{localTime(preshow.starts_at)}</span>
                <span>
                  · <Tr value={preshow.title} />
                </span>
              </p>
            )}
          </div>
        )}
        {allDone && <p className="py-4 text-base text-muted">{t.noMoreToday}</p>}
      </div>
      {rateBanner && <FeedbackDialog session={rating} onClose={() => setRating(null)} onDone={markRated} />}
    </section>
  )
}

/** Externa anslag för en viss sida. Fästa anslag ligger först och får en ljus platta. */
export function PostsList({ page }: { page: PostPage }) {
  const { t, lang } = useI18n()
  const { data } = useList('posts', { filters: [{ col: 'audience', op: 'eq', value: 'external' }, { col: 'published', op: 'eq', value: true }, { col: 'page', op: 'eq', value: page }] }, { pollMs: 120_000 })
  const posts = [...data].sort((a: Post, b: Post) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at))
  if (!posts.length) return null
  return (
    <div className="mb-8 space-y-3">
      {posts.map((p) => (
        <article key={p.id} className={cx('rounded-lg px-4 py-4', p.pinned ? 'bg-ice' : 'border border-line bg-white')}>
          {tr(p.title, lang) && (
            <h2 className="flex items-start gap-2 text-lg leading-snug font-semibold text-ink">
              {p.pinned && (
                <>
                  <Pin className="mt-1 size-4 shrink-0 text-ink-soft" aria-hidden />
                  <span className="sr-only">{t.pinned}: </span>
                </>
              )}
              <span className="min-w-0">
                <Tr value={p.title} />
              </span>
            </h2>
          )}
          {tr(p.body, lang) && (
            <p className={cx('whitespace-pre-line text-base', tr(p.title, lang) && 'mt-1')}>
              <Tr value={p.body} />
            </p>
          )}
        </article>
      ))}
    </div>
  )
}
