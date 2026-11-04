// Delade byggstenar för besökarsidorna: dagväljare, programlista och anslag.
import { useMemo, useState } from 'react'
import { CheckCircle2, Clock, MapPin, Mic, Music, Star, User } from 'lucide-react'
import { useConference } from '../lib/conference'
import { tr } from '../lib/format'
import { useList, useNow } from '../lib/hooks'
import { useI18n } from '../lib/i18n'
import { localDate, localTime, minutesBetween, relMinutes, sessionProgress, sessionStatus, weekdayShort } from '../lib/time'
import type { Audience, ConferenceDay, Post, PostPage, Session } from '../lib/types'
import FeedbackDialog, { useRated } from './FeedbackDialog'
import { Badge, Card, Empty, cx } from './ui'

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
    <div className="no-print mb-4 grid gap-1.5 rounded-2xl bg-slate-200/60 p-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} role="tablist" aria-label={t.chooseDay}>
      {days.map((d) => (
        <button
          key={d.id}
          role="tab"
          aria-selected={value === d.date}
          onClick={() => onChange(d.date)}
          className={cx('rounded-xl px-2 py-2 text-sm font-semibold first-letter:uppercase', value === d.date ? 'bg-white text-ink shadow-sm' : 'text-slate-600')}
        >
          {d.date === today ? t.today : weekdayShort(d.date, lang)}
          <span className="block text-[11px] font-normal text-slate-500">{tr(d.label, lang)}</span>
        </button>
      ))}
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

const kindIcon = { preshow: Music, lecture: Mic } as const

export function Agenda({ sessions, showFeedback = true }: { sessions: Session[]; showFeedback?: boolean }) {
  const { t, lang } = useI18n()
  const at = useNow(15_000)
  const { isRated, markRated } = useRated()
  const [rating, setRating] = useState<Session | null>(null)

  const nextId = sessions.find((s) => s.kind === 'lecture' && localDate(s.starts_at) === localDate(at) && sessionStatus(s, at) === 'upcoming')?.id
  if (!sessions.length) return <Empty>{t.noProgram}</Empty>

  return (
    <>
      <ol className="space-y-2.5">
        {sessions.map((s) => {
          const st = sessionStatus(s, at)
          const canRate = showFeedback && s.kind === 'lecture' && s.feedback_enabled && st === 'done'
          const Icon = kindIcon[s.kind as keyof typeof kindIcon]
          const minor = s.kind === 'preshow' || s.kind === 'break' || s.kind === 'meal'
          return (
            <li key={s.id}>
              <Card
                className={cx(
                  'flex gap-3 p-3.5',
                  st === 'done' && 'bg-slate-50 opacity-70',
                  st === 'ongoing' && 'border-accent ring-2 ring-accent/30',
                  s.id === nextId && 'border-ink-soft',
                  minor && st !== 'ongoing' && 'border-dashed shadow-none',
                )}
              >
                <div className="w-14 shrink-0 text-center tabular-nums" dir="ltr">
                  <div className={cx('text-base font-bold', st === 'done' ? 'text-slate-400 line-through' : 'text-ink')}>{localTime(s.starts_at)}</div>
                  <div className="text-xs text-slate-500">{localTime(s.ends_at)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {st === 'ongoing' && <Badge tone="accent">● {t.now}</Badge>}
                    {s.id === nextId && <Badge tone="blue">{t.next} · {relMinutes(minutesBetween(at, s.starts_at), lang)}</Badge>}
                    {st === 'done' && (
                      <Badge>
                        <CheckCircle2 className="size-3" /> {t.done}
                      </Badge>
                    )}
                    {s.kind === 'preshow' && <Badge tone="violet">{t.preshow}</Badge>}
                  </div>
                  <h3 className={cx('mt-1 font-semibold leading-snug', minor ? 'text-sm' : 'text-base', st === 'done' ? 'text-slate-500 line-through' : 'text-slate-900')}>
                    {Icon && <Icon className="me-1 inline size-4 -translate-y-px text-slate-400" />}
                    {tr(s.title, lang)}
                  </h3>
                  {tr(s.description, lang) && st !== 'done' && <p className="mt-0.5 text-sm text-slate-600">{tr(s.description, lang)}</p>}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    {s.speaker && (
                      <span className="inline-flex items-center gap-1">
                        <User className="size-3" /> {s.speaker}
                      </span>
                    )}
                    {s.room && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" /> {s.room}
                      </span>
                    )}
                  </div>
                  {st === 'ongoing' && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" dir="ltr">
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${sessionProgress(s, at) * 100}%` }} />
                    </div>
                  )}
                  {canRate &&
                    (isRated(s.id) ? (
                      <p className="mt-2 text-xs font-medium text-emerald-700">✓ {t.rated}</p>
                    ) : (
                      <button onClick={() => setRating(s)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900">
                        <Star className="size-4 fill-amber-400 text-amber-500" /> {t.rate}
                      </button>
                    ))}
                </div>
              </Card>
            </li>
          )
        })}
      </ol>
      <FeedbackDialog session={rating} onClose={() => setRating(null)} onDone={markRated} />
    </>
  )
}

/** Stor ruta överst: vad pågår nu / vad är nästa, plus uppmaning att betygsätta det som just tog slut. */
export function NowNext({ sessions }: { sessions: Session[] }) {
  const { t, lang } = useI18n()
  const at = useNow(15_000)
  const { isRated, markRated } = useRated()
  const [rating, setRating] = useState<Session | null>(null)
  const lectures = sessions.filter((s) => s.kind === 'lecture')
  if (!lectures.length) return null
  const ongoing = lectures.find((s) => sessionStatus(s, at) === 'ongoing')
  const next = lectures.find((s) => sessionStatus(s, at) === 'upcoming')
  const justEnded = [...lectures]
    .reverse()
    .find((s) => sessionStatus(s, at) === 'done' && s.feedback_enabled && minutesBetween(s.ends_at, at) <= 45 && !isRated(s.id))
  const preshow = next && sessions.find((s) => s.kind === 'preshow' && s.ends_at <= next.starts_at && minutesBetween(s.ends_at, next.starts_at) <= 15)

  return (
    <div className="mb-5 space-y-2.5">
      {justEnded && (
        <button onClick={() => setRating(justEnded)} className="flex w-full items-center gap-3 rounded-2xl bg-amber-100 p-3.5 text-start">
          <Star className="size-8 shrink-0 fill-amber-400 text-amber-500" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-amber-900">{t.justEnded}</span>
            <span className="block truncate font-semibold text-amber-950">{tr(justEnded.title, lang)}</span>
          </span>
          <span className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-bold text-white">{t.rate}</span>
        </button>
      )}
      {ongoing && (
        <Card className="border-accent bg-accent-soft p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-accent">● {t.now}</div>
          <div className="mt-1 text-lg font-bold text-ink">{tr(ongoing.title, lang)}</div>
          <div className="text-sm text-slate-600">
            {ongoing.speaker && `${ongoing.speaker} · `}
            {t.ongoingUntil} <span dir="ltr">{localTime(ongoing.ends_at)}</span>
          </div>
        </Card>
      )}
      {next ? (
        <Card className="bg-ink p-4 text-white">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-white/70">
            <Clock className="size-3.5" /> {t.nextLecture} · {relMinutes(minutesBetween(at, next.starts_at), lang)}
          </div>
          <div className="mt-1 text-lg font-bold">{tr(next.title, lang)}</div>
          <div className="text-sm text-white/75">
            <span dir="ltr">{localTime(next.starts_at)}</span>
            {next.speaker && ` · ${next.speaker}`}
            {next.room && ` · ${next.room}`}
          </div>
          {preshow && sessionStatus(preshow, at) !== 'done' && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-xs">
              <Music className="size-3.5" /> <span dir="ltr">{localTime(preshow.starts_at)}</span> · {tr(preshow.title, lang)}
            </div>
          )}
        </Card>
      ) : (
        !ongoing && lectures.every((s) => sessionStatus(s, at) === 'done') && <Card className="p-4 text-center text-sm text-slate-600">{t.noMoreToday}</Card>
      )}
      <FeedbackDialog session={rating} onClose={() => setRating(null)} onDone={markRated} />
    </div>
  )
}

/** Externa anslag för en viss sida. */
export function PostsList({ page }: { page: PostPage }) {
  const { lang } = useI18n()
  const { data } = useList('posts', { filters: [{ col: 'audience', op: 'eq', value: 'external' }, { col: 'published', op: 'eq', value: true }, { col: 'page', op: 'eq', value: page }] }, { pollMs: 120_000 })
  const posts = [...data].sort((a: Post, b: Post) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at))
  if (!posts.length) return null
  return (
    <div className="mb-5 space-y-2.5">
      {posts.map((p) => (
        <Card key={p.id} className={cx('p-4', p.pinned && 'border-sky-200 bg-sky-50')}>
          {tr(p.title, lang) && <h3 className="font-semibold text-ink">{tr(p.title, lang)}</h3>}
          {tr(p.body, lang) && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{tr(p.body, lang)}</p>}
        </Card>
      ))}
    </div>
  )
}
