import { useMemo } from 'react'
import { CalendarCheck, ChevronRight, Coffee, Gauge, Megaphone, NotebookPen, ShoppingCart } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useConference } from '../../lib/conference'
import { eq } from '../../lib/db'
import { useList, useNow } from '../../lib/hooks'
import { formatDay, localDate } from '../../lib/time'
import { Card, Empty, PageHeader } from '../../components/ui'
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

  return (
    <div className="space-y-8">
      <PageHeader title={`Hej ${firstName}!`} subtitle={<span className="inline-block first-letter:uppercase">{formatDay(today)} · {settings.conference_name}</span>} />

      {myCommittees.some((c) => c.slug === 'ordning' || c.slug === 'koket') && (
        <div className="grid gap-3 sm:grid-cols-2">
          {myCommittees.some((c) => c.slug === 'ordning') && (
            <QuickLink to="/intern/rakning" icon={<Gauge className="size-6" />} title="Räkna publiken" text="5 min efter start, vid mittpunkten och 5 min före slut." accent />
          )}
          {myCommittees.some((c) => c.slug === 'koket') && (
            <QuickLink to="/intern/rakning" icon={<Coffee className="size-6" />} title="Köksräknaren" text="Tryck för varje gäst och beställning." accent />
          )}
        </div>
      )}

      <section>
        <SectionTitle to="/intern/mitt-schema" icon={<CalendarCheck className="size-4" />}>
          Mina kommande pass
        </SectionTitle>
        {loading ? null : upcoming.length === 0 ? (
          <Empty>Inga kommande pass.</Empty>
        ) : (
          <div className="space-y-3">
            {upcoming.map((s) => (
              <ShiftItem key={s.id} shift={s} state={shiftState(s, at)} dateLabel={s.date === today ? 'Idag' : formatDay(s.date, 'sv', { weekday: 'short', day: 'numeric', month: 'short' })} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle to="/intern/info" icon={<Megaphone className="size-4" />}>
          Senaste info
        </SectionTitle>
        {posts.loading ? null : posts.data.length === 0 ? (
          <Empty>Inga interna meddelanden ännu.</Empty>
        ) : (
          <div className="space-y-3">
            {posts.data.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Mina kommittéer</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {myCommittees.map((c) => (
            <Link key={c.id} to={`/intern/kommitteer/${c.slug}`}>
              <Card className="flex items-center gap-3 p-4 transition hover:shadow-md">
                <span className="size-3 rounded-full" style={{ background: c.color }} />
                <span className="flex-1 font-medium text-ink">{c.name}</span>
                {auth.memberships.some((m) => m.committee_id === c.id && m.is_lead) && <span className="text-xs text-slate-500">Ansvarig</span>}
                <ChevronRight className="size-4 text-slate-400" />
              </Card>
            </Link>
          ))}
          <QuickLink to="/intern/anteckningar" icon={<NotebookPen className="size-5" />} title="Ladda upp anteckning" />
          <QuickLink to="/intern/inkop" icon={<ShoppingCart className="size-5" />} title="Registrera inköp" />
        </div>
      </section>
    </div>
  )
}

function SectionTitle({ children, to, icon }: { children: React.ReactNode; to: string; icon: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {icon} {children}
      </h2>
      <Link to={to} className="text-sm text-ink hover:underline">
        Visa alla
      </Link>
    </div>
  )
}

function QuickLink({ to, icon, title, text, accent }: { to: string; icon: React.ReactNode; title: string; text?: string; accent?: boolean }) {
  return (
    <Link to={to}>
      <Card className={`flex h-full items-center gap-3 p-4 transition hover:shadow-md ${accent ? 'border-accent/40 bg-accent-soft' : ''}`}>
        <span className={accent ? 'text-accent' : 'text-ink'}>{icon}</span>
        <span className="flex-1">
          <span className="block font-semibold text-ink">{title}</span>
          {text && <span className="block text-sm text-slate-600">{text}</span>}
        </span>
        <ChevronRight className="size-4 text-slate-400" />
      </Card>
    </Link>
  )
}
