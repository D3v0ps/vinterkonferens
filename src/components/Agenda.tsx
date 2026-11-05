// Delade byggstenar för besökarsidorna: sidrubrik, dagväljare, programlista och anslag.
import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Check, Clock, MapPin, Music, Pin, Star } from 'lucide-react'
import { useConference } from '../lib/conference'
import { tr } from '../lib/format'
import { useList, useNow } from '../lib/hooks'
import { Tr, useI18n } from '../lib/i18n'
import { formatShortDay, localDate, localTime, minutesBetween, relMinutes, sessionProgress, sessionStatus } from '../lib/time'
import type { Audience, ConferenceDay, Lang, Post, PostPage, Session } from '../lib/types'
import FeedbackDialog, { useRated } from './FeedbackDialog'
import { Button, Empty, cx } from './ui'
import { categoryLabel, isTalk, lectureNumbers } from '../lib/sessions'
import { SpeakerAvatar } from './SpeakerAvatar'

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

/** Punkter som bär programmet (fetstil i schemat): föreläsningar, paneler, aktiviteter och punkter med egen etikett. */
// Raden staplas (typ och tid på en rad ovanför titeln) i de smalaste skärmarna, och i telefonen när
// typens text har ett ord som inte ryms i den smala kolumnen (t.ex. "Huvudföreläsning").
const STACK = {
  narrow: {
    li: 'max-[359px]:grid-cols-[minmax(0,1fr)_auto]',
    left: 'max-sm:block max-[359px]:col-start-1 max-[359px]:row-start-1 max-[359px]:flex max-[359px]:flex-wrap max-[359px]:items-baseline max-[359px]:gap-x-2',
    time: 'max-sm:mt-0.5 max-[359px]:mt-0',
    content: 'max-[359px]:col-start-1 max-[359px]:row-start-2 max-[359px]:mt-1',
    avatar: 'max-[359px]:col-start-2 max-[359px]:row-span-2 max-[359px]:row-start-1',
  },
  phone: {
    li: 'max-sm:grid-cols-[minmax(0,1fr)_auto]',
    left: 'max-sm:col-start-1 max-sm:row-start-1 max-sm:flex max-sm:flex-wrap max-sm:items-baseline max-sm:gap-x-2',
    time: '',
    content: 'max-sm:col-start-1 max-sm:row-start-2 max-sm:mt-1',
    avatar: 'max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1',
  },
}
const longestWord = (text: string) => Math.max(0, ...text.split(/\s+/).map((w) => w.length))

function isMain(s: Session, lang: Lang) {
  return isTalk(s) || s.kind === 'activity' || s.kind === 'other' || !!tr(s.label ?? undefined, lang)
}

/**
 * Programmet som konferensens tryckta schema: typ (Föreläsning 1, Bön, Rast …), tid och titel i tre
 * kolumner med tunna guldlinjer emellan, och talarens porträtt längst ut. Det som varit stryks över,
 * det som pågår markeras och nästa föreläsning får en etikett.
 */
export function Agenda({ sessions, showFeedback = true }: { sessions: Session[]; showFeedback?: boolean }) {
  const { t, lang } = useI18n()
  const at = useNow(15_000)
  const { isRated, markRated } = useRated()
  const [rating, setRating] = useState<Session | null>(null)
  const numbers = useMemo(() => lectureNumbers(sessions), [sessions])
  // Typkolumnen följer dagens längsta etikett (t.ex. "Huvudföreläsning") inom ett tak, så att ord inte bryts mitt i.
  const catWidth = useMemo(() => Math.max(0, ...sessions.map((s) => categoryLabel(s, lang, t, numbers).length)) * 0.62, [sessions, lang, t, numbers])

  const nextId = sessions.find((s) => isTalk(s) && localDate(s.starts_at) === localDate(at) && sessionStatus(s, at) === 'upcoming')?.id
  if (!sessions.length) return <Empty>{t.noProgram}</Empty>

  return (
    <>
      <ol className="divide-y divide-accent border-y border-accent font-schedule" style={{ '--cat': `${catWidth}em` } as CSSProperties}>
        {sessions.map((s) => {
          const st = sessionStatus(s, at)
          const done = st === 'done'
          const ongoing = st === 'ongoing'
          const isNext = s.id === nextId
          const canRate = showFeedback && isTalk(s) && s.feedback_enabled && done
          const main = isMain(s, lang)
          const description = tr(s.description, lang)
          const panel = s.kind === 'panel'
          const avatar = !!s.speaker && !panel
          const tone = done ? 'text-muted' : 'text-ink'
          const category = categoryLabel(s, lang, t, numbers)
          const stack = STACK[longestWord(category) > 13 ? 'phone' : 'narrow']
          return (
            <li
              key={s.id}
              className={cx(
                'grid grid-cols-[7.25rem_minmax(0,1fr)_auto] gap-x-3 py-3.5 text-base sm:grid-cols-[clamp(9rem,var(--cat),15rem)_7.75rem_minmax(0,1fr)_3.5rem] sm:gap-x-5 sm:py-4 sm:text-lg',
                stack.li,
              )}
              aria-current={ongoing ? 'true' : undefined}
            >
              {/* Typ och tid: två kolumner på bred skärm, staplade i telefonen och på en rad ovanför titeln i de smalaste */}
              <div className={cx('contents', stack.left)}>
                <p lang={lang} className={cx('text-base leading-snug break-words hyphens-auto sm:text-lg', main ? 'font-semibold' : 'font-normal', tone)}>
                  {tr(s.label ?? undefined, lang) ? <Tr value={s.label} /> : category}
                </p>
                <p className={cx('text-base leading-snug tabular-nums sm:text-lg', stack.time, ongoing ? 'font-semibold text-accent-strong' : main ? `font-semibold ${tone}` : tone, done && 'text-muted')}>
                  <span dir="ltr">
                    {localTime(s.starts_at)}–{localTime(s.ends_at)}
                  </span>
                </p>
              </div>

              <div className={cx('min-w-0', stack.content)}>
                {ongoing && (
                  <p className="mb-0.5 flex items-center gap-2 font-sans text-base font-medium text-accent-strong">
                    <LiveDot /> {t.now}
                  </p>
                )}
                {isNext && (
                  <p className="mb-0.5 font-sans text-base font-medium text-ink">
                    {t.next} · {relMinutes(minutesBetween(at, s.starts_at), lang)}
                  </p>
                )}
                <h3
                  className={cx(
                    'text-base leading-snug break-words hyphens-auto sm:text-lg',
                    main ? 'font-semibold' : 'font-normal',
                    done ? 'text-muted line-through decoration-1' : 'text-ink',
                  )}
                >
                  {done && <span className="sr-only">{t.done}: </span>}
                  <Tr value={s.title} />
                </h3>
                {s.speaker && (
                  <p className={cx('mt-0.5 font-sans text-base break-words', panel || done ? 'text-muted' : 'text-ink-soft')}>
                    <bdi>{s.speaker}</bdi>
                  </p>
                )}
                {description && !done && (
                  <p className="mt-1 font-sans text-base text-muted">
                    <Tr value={s.description} />
                  </p>
                )}
                {(s.room || s.kind === 'preshow') && (
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-sans text-base text-muted">
                    {s.kind === 'preshow' && (
                      <span className="inline-flex items-center gap-1.5">
                        <Music className="size-4" aria-hidden /> {t.preshow}
                      </span>
                    )}
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
                    <p className="mt-2 inline-flex items-center gap-1.5 font-sans text-base text-emerald-800">
                      <Check className="size-4" aria-hidden /> {t.rated}
                    </p>
                  ) : (
                    <Button variant="secondary" className="mt-3 font-sans" onClick={() => setRating(s)}>
                      <Star className="size-5 fill-accent text-accent-strong" aria-hidden /> {t.rate}
                    </Button>
                  ))}
              </div>

              <div className={cx('flex justify-end', stack.avatar)}>
                {avatar && <SpeakerAvatar name={s.speaker!} photo={s.speaker_photo} className={cx('size-10 text-sm sm:size-14 sm:text-base', done && 'opacity-60 grayscale')} />}
              </div>
            </li>
          )
        })}
      </ol>
      <FeedbackDialog session={rating} onClose={() => setRating(null)} onDone={markRated} />
    </>
  )
}

/** Talarens porträtt i Nu & nästa (inte för paneler, där flera medverkar). */
function TalkAvatar({ s }: { s: Session }) {
  if (!s.speaker || s.kind === 'panel') return null
  return <SpeakerAvatar name={s.speaker} photo={s.speaker_photo} className="size-12 text-base" />
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
  const lectures = sessions.filter(isTalk)
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
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-base font-medium text-accent-strong">
                  <LiveDot /> {t.now}
                </p>
                <p className="mt-1 text-xl leading-snug font-semibold text-ink">
                  <Tr value={ongoing.title} />
                </p>
                <p className="mt-0.5 text-base text-muted">
                  {ongoing.speaker && (
                    <>
                      <bdi>{ongoing.speaker}</bdi> ·{' '}
                    </>
                  )}
                  {t.ongoingUntil} <span dir="ltr">{localTime(ongoing.ends_at)}</span>
                  {ongoing.room && ` · ${ongoing.room}`}
                </p>
              </div>
              <TalkAvatar s={ongoing} />
            </div>
            <Progress value={sessionProgress(ongoing, at)} />
          </div>
        )}
        {next && (
          <div className="py-4">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-base font-medium text-ink">
                  <Clock className="size-4 shrink-0" aria-hidden /> {next.kind === 'panel' ? t.nextPanel : t.nextLecture} · {relMinutes(minutesBetween(at, next.starts_at), lang)}
                </p>
                <p className="mt-1 text-xl leading-snug font-semibold text-ink">
                  <Tr value={next.title} />
                </p>
                <p className="mt-0.5 text-base text-muted">
                  <span dir="ltr">{localTime(next.starts_at)}</span>
                  {next.speaker && (
                    <>
                      {' · '}
                      <bdi>{next.speaker}</bdi>
                    </>
                  )}
                  {next.room && ` · ${next.room}`}
                </p>
              </div>
              <TalkAvatar s={next} />
            </div>
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
