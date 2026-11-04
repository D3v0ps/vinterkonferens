// Delade byggstenar för besökarsidorna: sidrubrik, dagväljare, programlista och anslag.
import { useId, useMemo, useState } from 'react'
import { Check, Clock, MapPin, Music, Pin, Star } from 'lucide-react'
import { useConference } from '../lib/conference'
import { tr } from '../lib/format'
import { useList, useNow } from '../lib/hooks'
import { useI18n } from '../lib/i18n'
import { localDate, localTime, minutesBetween, relMinutes, sessionProgress, sessionStatus, weekdayShort } from '../lib/time'
import type { Audience, ConferenceDay, Post, PostPage, Session } from '../lib/types'
import FeedbackDialog, { useRated } from './FeedbackDialog'
import { Button, Empty, cx } from './ui'

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/

/**
 * Sätter sista ordet i Instrument Serif kursiv – ett ord per rubrik, aldrig mer.
 * Arabisk skrift lämnas i sitt eget typsnitt.
 */
export function DisplayLast({ text }: { text: string }) {
  const m = text.trim().match(/^([\s\S]*\s)?(\S+)$/)
  if (!m || ARABIC_SCRIPT.test(m[2])) return <>{text}</>
  return (
    <>
      {m[1] ?? ''}
      <em className="font-display text-[1.12em] font-normal tracking-normal italic">{m[2]}</em>
    </>
  )
}

/** Sidans rubrik och ingress på besökarsidorna. */
export function PageTitle({ title, lead }: { title: string; lead?: string }) {
  return (
    <header className="mb-7">
      <h1 className="text-[2rem] leading-tight font-semibold tracking-tight text-ink sm:text-4xl">
        <DisplayLast text={title} />
      </h1>
      {lead && <p className="mt-1.5 max-w-[60ch] text-lg text-muted">{lead}</p>}
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

export function DayTabs({ days, value, onChange }: { days: ConferenceDay[]; value: string | null; onChange: (d: string) => void }) {
  const { lang, t } = useI18n()
  const { today } = useConference()
  if (days.length < 2) return null
  return (
    <div
      className="no-print mb-6 grid gap-1 rounded-2xl bg-ice p-1"
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      role="tablist"
      aria-label={t.chooseDay}
    >
      {days.map((d) => {
        const on = value === d.date
        return (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(d.date)}
            className={cx(
              'flex min-h-14 flex-col items-center justify-center rounded-xl px-2 py-1.5 leading-tight transition-colors',
              on ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            <span className="text-base font-semibold first-letter:uppercase">{d.date === today ? t.today : weekdayShort(d.date, lang)}</span>
            {tr(d.label, lang) && <span className="mt-0.5 max-w-full truncate text-sm text-muted">{tr(d.label, lang)}</span>}
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
  return <span className="inline-block size-2.5 shrink-0 rounded-full bg-accent" aria-hidden />
}

function Progress({ value }: { value: number }) {
  return (
    <div className="mt-3 h-1 overflow-hidden rounded-full bg-line" dir="ltr" aria-hidden>
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${value * 100}%` }} />
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
          const minor = s.kind === 'preshow' || s.kind === 'break' || s.kind === 'meal'
          const description = tr(s.description, lang)
          const hasMeta = !!(s.speaker || s.room || s.kind === 'preshow')
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
                  {tr(s.title, lang)}
                </h3>
                {description && !done && <p className="mt-1 text-base text-muted">{description}</p>}
                {hasMeta && (
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-base text-muted">
                    {s.kind === 'preshow' && (
                      <span className="inline-flex items-center gap-1.5">
                        <Music className="size-4" aria-hidden /> {t.preshow}
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
                      <Star className="size-5 fill-amber-400 text-amber-500" aria-hidden /> {t.rate}
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

/** Nu & nästa: vad pågår, vad kommer härnäst, plus en uppmaning att betygsätta det som just tog slut. */
export function NowNext({ sessions }: { sessions: Session[] }) {
  const { t, lang } = useI18n()
  const at = useNow(15_000)
  const { isRated, markRated } = useRated()
  const [rating, setRating] = useState<Session | null>(null)
  const headingId = useId()
  const lectures = sessions.filter((s) => s.kind === 'lecture')
  if (!lectures.length) return null
  const ongoing = lectures.find((s) => sessionStatus(s, at) === 'ongoing')
  const next = lectures.find((s) => sessionStatus(s, at) === 'upcoming')
  const justEnded = [...lectures]
    .reverse()
    .find((s) => sessionStatus(s, at) === 'done' && s.feedback_enabled && minutesBetween(s.ends_at, at) <= 45 && !isRated(s.id))
  const preshow = next && sessions.find((s) => s.kind === 'preshow' && s.ends_at <= next.starts_at && minutesBetween(s.ends_at, next.starts_at) <= 15)
  const allDone = !ongoing && !next && lectures.every((s) => sessionStatus(s, at) === 'done')

  return (
    <section className="mb-10" aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3 text-xl font-semibold text-ink">
        {t.nowNext}
      </h2>

      {justEnded && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-ice p-4">
          <Star className="size-6 shrink-0 fill-amber-400 text-amber-500" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-base text-muted">{t.justEnded}</p>
            <p className="truncate text-base font-semibold text-ink">{tr(justEnded.title, lang)}</p>
          </div>
          <Button className="shrink-0" onClick={() => setRating(justEnded)}>
            {t.rate}
          </Button>
        </div>
      )}

      <div className="divide-y divide-line border-y border-line">
        {ongoing && (
          <div className="py-4">
            <p className="flex items-center gap-2 text-base font-medium text-accent-strong">
              <LiveDot /> {t.now}
            </p>
            <p className="mt-1 text-xl leading-snug font-semibold text-ink">{tr(ongoing.title, lang)}</p>
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
            <p className="mt-1 text-xl leading-snug font-semibold text-ink">{tr(next.title, lang)}</p>
            <p className="mt-0.5 text-base text-muted">
              <span dir="ltr">{localTime(next.starts_at)}</span>
              {next.speaker && ` · ${next.speaker}`}
              {next.room && ` · ${next.room}`}
            </p>
            {preshow && sessionStatus(preshow, at) !== 'done' && (
              <p className="mt-2 flex items-center gap-1.5 text-base text-muted">
                <Music className="size-4 shrink-0" aria-hidden /> <span dir="ltr">{localTime(preshow.starts_at)}</span> · {tr(preshow.title, lang)}
              </p>
            )}
          </div>
        )}
        {allDone && <p className="py-4 text-base text-muted">{t.noMoreToday}</p>}
      </div>
      <FeedbackDialog session={rating} onClose={() => setRating(null)} onDone={markRated} />
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
        <article key={p.id} className={cx('rounded-2xl px-4 py-4', p.pinned ? 'bg-ice' : 'border border-line bg-white')}>
          {tr(p.title, lang) && (
            <h2 className="flex items-start gap-2 text-lg leading-snug font-semibold text-ink">
              {p.pinned && (
                <>
                  <Pin className="mt-1 size-4 shrink-0 text-ink-soft" aria-hidden />
                  <span className="sr-only">{t.pinned}: </span>
                </>
              )}
              <span className="min-w-0">{tr(p.title, lang)}</span>
            </h2>
          )}
          {tr(p.body, lang) && <p className={cx('whitespace-pre-line text-base', tr(p.title, lang) && 'mt-1')}>{tr(p.body, lang)}</p>}
        </article>
      ))}
    </div>
  )
}
