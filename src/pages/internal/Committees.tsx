import { ChevronRight, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useList } from '../../lib/hooks'
import { Badge, Card, Empty, PageHeader, Spinner } from '../../components/ui'

export default function Committees() {
  const auth = useAuth()
  const committees = useList('committees', { order: [{ col: 'sort' }] })
  const volunteers = useList('volunteers')

  if (committees.loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Kommittéer & scheman" subtitle="Varje kommitté har ett eget schema där alla volontärer finns med." />
      {committees.data.length === 0 ? (
        <Empty icon={<UsersRound className="size-8 text-slate-300" />}>Inga kommittéer ännu.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {committees.data.map((c) => {
            const members = volunteers.data.filter((v) => v.committee_id === c.id)
            const leads = members.filter((v) => v.is_lead)
            const mine = auth.memberships.some((m) => m.committee_id === c.id)
            return (
              <Link key={c.id} to={`/intern/kommitteer/${c.slug}`} className="group">
                <Card className="h-full overflow-hidden transition group-hover:shadow-md">
                  <div className="h-1.5" style={{ background: c.color }} />
                  <div className="flex items-start justify-between gap-2 p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-ink">{c.name}</h2>
                        {mine && <Badge tone="accent">Min</Badge>}
                      </div>
                      {c.description && <p className="mt-1 text-sm text-slate-600">{c.description}</p>}
                      <p className="mt-2 text-sm text-slate-700">
                        {members.length} {members.length === 1 ? 'volontär' : 'volontärer'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        Ansvarig: {leads.length ? leads.map((l) => l.full_name).join(', ') : '–'}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 size-5 shrink-0 text-slate-400 group-hover:text-ink rtl:rotate-180" />
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
