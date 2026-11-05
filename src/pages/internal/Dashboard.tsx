import { useMemo } from 'react'
import { ChevronRight, Gauge } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useConference } from '../../lib/conference'
import { eq, where } from '../../lib/db'
import { tr } from '../../lib/format'
import { useList, useNow } from '../../lib/hooks'
import { checkpointsFor, formatShortDay, localDate, localTime, sessionStatus, zonedToUtc } from '../../lib/time'
import type { Shift } from '../../lib/types'
import { PageHeader, cx } from '../../components/ui'
import { CHECKPOINT_LABEL } from '../../components/stats/labels'
import { shiftState } from '../../components/internal-core/shifts'
import { ShiftItem, useMyShifts } from '../../components/internal-core/MyShifts'
import { PostCard } from './Posts'
import { isTalk } from '../../lib/sessions'

const POSTS_Q = {
  filters: [eq('audience', 'internal'), eq('published', true)],
  order: [{ col: 'pinned', asc: false }, { col: 'created_at', asc: false }],
  limit: 5,
}

export default function Dashboard() {
  const auth = useAuth()
  const at = useNow(30_000)
  const { settings } = useConference()
  const { mine, loading } = useMyShifts()
  const posts = useList('posts', POSTS_Q)
  const today = localDate(at)

  const upcoming = useMemo(() => mine.filter((s) => shiftState(s, at) !== 'done').slice(0, 4), [mine, at])
  const myCommittees = auth.committees.filter((c) => auth.memberships.some((m) => m.committee_id === c.id))
  const firstName = auth.displayName.split(' ')[0]
  const counts = {
    ordning: myCommittees.some((c) => c.slug === 'ordning'),
    koket: myCommittees.some((c) => c.slug === 'koket'),
  }

  return (
    <div className="space-y-12">
      <PageHeader
        title={
          firstName ? (
            <>
              Hej <span className="font-display font-normal">{firstName}</span>!
            </>
          ) : (
            'Hej!'
          )
        }
        subtitle={<span className="inline-block first-letter:uppercase">{formatShortDay(today)} · {settings.conference_name}</span>}
      />

      {(counts.ordning || counts.koket) && (
        <CountLink at={at} ordning={counts.ordning} koket={counts.koket} mine={mine} koketId={myCommittees.find((c) => c.slug === 'koket')?.id} />
      )}

      <section>
        <SectionTitle to="/intern/mitt-schema" linkLabel="Hela mitt schema">
          Mina kommande pass
        </SectionTitle>
        {loading ? null : upcoming.length === 0 ? (
          <p className="text-base text-muted">Inga kommande pass.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {upcoming.map((s) => (
              <ShiftItem key={s.id} shift={s} state={shiftState(s, at)} dateLabel={s.date === today ? 'Idag' : formatShortDay(s.date)} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle to="/intern/info" linkLabel="All info">
          Senaste info
        </SectionTitle>
        {posts.loading ? null : posts.data.length === 0 ? (
          <p className="text-base text-muted">Inga interna meddelanden ännu.</p>
        ) : (
          <div className="divide-y divide-line border-y border-line">
            {posts.data.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold text-ink">Genvägar</h2>
        <ul className="divide-y divide-line border-y border-line">
          {myCommittees.map((c) => (
            <QuietLink
              key={c.id}
              to={`/intern/kommitteer/${c.slug}`}
              dot={c.color}
              title={c.name}
              meta={auth.memberships.some((m) => m.committee_id === c.id && m.is_lead) ? 'Du är ansvarig' : undefined}
            />
          ))}
          <QuietLink to="/intern/anteckningar" title="Ladda upp anteckning" />
          <QuietLink to="/intern/inkop" title="Registrera inköp" />
        </ul>
      </section>
    </div>
  )
}

/**
 * Länken till räknaren för ordning och kök. Accentfärgad bara när något ska göras nu:
 * en publikräkning är aktuell (från 2 min före till 10 min efter räknetillfället) eller köket är igång
 * (en måltid i programmet pågår, eller ditt pass i köket). Annars en vanlig rad.
 */
function CountLink({ at, ordning, koket, mine, koketId }: { at: Date; ordning: boolean; koket: boolean; mine: Shift[]; koketId?: string }) {
  const today = localDate(at)
  const dayStart = zonedToUtc(today, '00:00').toISOString()
  const sessions = useList('sessions', { order: [{ col: 'starts_at' }] })
  const counts = useList('flow_counts', { filters: [eq('area', 'hall'), where('counted_at', 'gte', dayStart)] }, { enabled: ordning, pollMs: 60_000 })

  // Dagens nästa publikräkning som inte är gjord (eller som nyss skulle ha gjorts)
  const next = ordning
    ? sessions.data
        .filter((s) => isTalk(s) && localDate(s.starts_at) === today)
        .flatMap((s) => checkpointsFor(s).map((c) => ({ s, ...c, since: (at.getTime() - c.at.getTime()) / 60_000 })))
        .filter((c) => c.since <= 10 && !counts.data.some((r) => r.session_id === c.s.id && r.checkpoint === c.key))
        .sort((a, b) => a.at.getTime() - b.at.getTime())[0]
    : undefined
  const countNow = !!next && next.since >= -2 && !counts.loading
  const meal = koket ? sessions.data.find((s) => s.kind === 'meal' && sessionStatus(s, at) === 'ongoing') : undefined
  const kitchenShift = koket ? mine.find((s) => s.committee_id === koketId && shiftState(s, at) === 'ongoing') : undefined
  const kitchenLive = !!meal || !!kitchenShift
  const live = countNow || kitchenLive

  let title: string
  let text: string
  if (countNow && next) {
    title = 'Räkna publiken nu'
    text = `${tr(next.s.title, 'sv')} – ${CHECKPOINT_LABEL[next.key].toLowerCase()} kl ${localTime(next.at)}.`
  } else if (kitchenLive) {
    title = 'Köksräknaren'
    text = `${meal ? `${tr(meal.title, 'sv')} pågår` : 'Ditt pass i köket pågår'}. Tryck för varje gäst och beställning.`
  } else {
    title = ordning && koket ? 'Räkna publiken och köket' : ordning ? 'Räkna publiken' : 'Köksräknaren'
    text = [
      ordning && (next ? `Nästa räkning kl ${localTime(next.at)}, ${tr(next.s.title, 'sv')}.` : 'Publiken räknas 5 min efter start, vid mittpunkten och 5 min före slut.'),
      koket && 'I köket trycker du för varje gäst och beställning.',
    ]
      .filter(Boolean)
      .join(' ')
  }

  return (
    <Link
      to="/intern/rakning"
      className={cx(
        'group flex min-h-14 items-center gap-4',
        live ? 'rounded-lg bg-accent px-5 py-4 text-ink hover:bg-accent-strong hover:text-white' : 'border-y border-line py-4 text-ink',
      )}
    >
      <Gauge className="size-6 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cx('block text-lg font-semibold', !live && 'group-hover:underline')}>{title}</span>
        <span className={cx('block text-base', live ? 'text-ink/80 group-hover:text-white/90' : 'text-muted')}>{text}</span>
      </span>
      <ChevronRight className={cx('size-5 shrink-0 rtl:rotate-180', !live && 'text-slate-400 group-hover:text-ink')} aria-hidden />
    </Link>
  )
}

function SectionTitle({ children, to, linkLabel }: { children: React.ReactNode; to: string; linkLabel: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
      <h2 className="text-xl font-semibold text-ink">{children}</h2>
      <Link to={to} className="inline-flex min-h-11 items-center text-base text-ink underline underline-offset-4 hover:text-ink-soft">
        {linkLabel}
      </Link>
    </div>
  )
}

function QuietLink({ to, title, meta, dot }: { to: string; title: string; meta?: string; dot?: string }) {
  return (
    <li>
      <Link to={to} className="group flex min-h-14 items-center gap-3 py-3 hover:bg-white/60">
        {dot && <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: dot }} aria-hidden />}
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium text-ink group-hover:underline">{title}</span>
          {meta && <span className="block text-sm text-muted">{meta}</span>}
        </span>
        <ChevronRight className="size-5 shrink-0 text-slate-400 group-hover:text-ink rtl:rotate-180" aria-hidden />
      </Link>
    </li>
  )
}
