import { useMemo } from 'react'
import { ChevronRight, Gauge } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useConference } from '../../lib/conference'
import { eq } from '../../lib/db'
import { useList, useNow } from '../../lib/hooks'
import { formatDay, localDate } from '../../lib/time'
import { PageHeader } from '../../components/ui'
import { shiftState } from '../../components/internal-core/shifts'
import { ShiftItem, useMyShifts } from '../../components/internal-core/MyShifts'
import { PostCard } from './Posts'

const POSTS_Q = {
  filters: [eq('audience', 'internal'), eq('published', true)],
  order: [{ col: 'pinned', asc: false }, { col: 'created_at', asc: false }],
  limit: 5,
}

export default function Dashboard() {
  const auth = useAuth()
  const at = useNow(60_000)
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
              Hej <em className="font-display font-normal italic">{firstName}</em>!
            </>
          ) : (
            'Hej!'
          )
        }
        subtitle={<span className="inline-block first-letter:uppercase">{formatDay(today)} · {settings.conference_name}</span>}
      />

      {(counts.ordning || counts.koket) && <CountLink ordning={counts.ordning} koket={counts.koket} />}

      <section>
        <SectionTitle to="/intern/mitt-schema" linkLabel="Hela mitt schema">
          Mina kommande pass
        </SectionTitle>
        {loading ? null : upcoming.length === 0 ? (
          <p className="text-base text-muted">Inga kommande pass.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {upcoming.map((s) => (
              <ShiftItem key={s.id} shift={s} state={shiftState(s, at)} dateLabel={s.date === today ? 'Idag' : formatDay(s.date, 'sv', { weekday: 'short', day: 'numeric', month: 'short' })} />
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

/** Dagens viktigaste handling för ordning och kök: räknaren. Enda accentfärgade ytan på sidan. */
function CountLink({ ordning, koket }: { ordning: boolean; koket: boolean }) {
  const title = ordning && koket ? 'Räkna publiken och köket' : ordning ? 'Räkna publiken' : 'Köksräknaren'
  const text = [
    ordning && 'Publiken räknas 5 min efter start, vid mittpunkten och 5 min före slut.',
    koket && 'I köket trycker du för varje gäst och beställning.',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Link to="/intern/rakning" className="flex min-h-14 items-center gap-4 rounded-2xl bg-accent px-5 py-4 text-white hover:bg-accent-strong">
      <Gauge className="size-6 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold">{title}</span>
        <span className="block text-base text-white/90">{text}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 rtl:rotate-180" aria-hidden />
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
        {dot && <span className="size-3 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />}
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium text-ink group-hover:underline">{title}</span>
          {meta && <span className="block text-sm text-muted">{meta}</span>}
        </span>
        <ChevronRight className="size-5 shrink-0 text-slate-400 group-hover:text-ink rtl:rotate-180" aria-hidden />
      </Link>
    </li>
  )
}
