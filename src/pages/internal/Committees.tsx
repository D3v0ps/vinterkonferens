import { ChevronRight, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useList } from '../../lib/hooks'
import { Empty, PageHeader, Spinner } from '../../components/ui'

export default function Committees() {
  const auth = useAuth()
  const committees = useList('committees', { order: [{ col: 'sort' }] })
  const volunteers = useList('volunteers')

  if (committees.loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title={
          <>
            Kommittéer & <em className="font-display font-normal italic">scheman</em>
          </>
        }
        subtitle="Varje kommitté har ett eget schema där alla volontärer finns med."
      />
      {committees.data.length === 0 ? (
        <Empty icon={<UsersRound className="size-8 text-slate-300" />}>Inga kommittéer ännu.</Empty>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {committees.data.map((c) => {
            const members = volunteers.data.filter((v) => v.committee_id === c.id)
            const leads = members.filter((v) => v.is_lead)
            const mine = auth.memberships.some((m) => m.committee_id === c.id)
            const meta = [
              `${members.length} ${members.length === 1 ? 'volontär' : 'volontärer'}`,
              leads.length ? `ansvarig: ${leads.map((l) => l.full_name).join(', ')}` : null,
              mine ? 'du är med' : null,
            ].filter(Boolean)
            return (
              <li key={c.id}>
                <Link to={`/intern/kommitteer/${c.slug}`} className="group flex min-h-14 items-start gap-3 py-4 hover:bg-white/60">
                  <span className="mt-2 size-3 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-semibold text-ink group-hover:underline">{c.name}</span>
                    {c.description && <span className="mt-0.5 block text-base text-slate-700">{c.description}</span>}
                    <span className="mt-1 block text-sm text-muted first-letter:uppercase">{meta.join(' · ')}</span>
                  </span>
                  <ChevronRight className="mt-1.5 size-5 shrink-0 text-slate-400 group-hover:text-ink rtl:rotate-180" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
