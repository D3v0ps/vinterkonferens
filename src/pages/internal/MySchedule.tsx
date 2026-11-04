import { useMemo } from 'react'
import { CalendarCheck } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { useList, useNow } from '../../lib/hooks'
import { formatDay } from '../../lib/time'
import { Empty, PageHeader, Spinner } from '../../components/ui'
import { groupByDate, shiftState } from '../../components/internal-core/shifts'
import { ShiftItem, useMyShifts } from '../../components/internal-core/MyShifts'

export default function MySchedule() {
  const auth = useAuth()
  const at = useNow(60_000)
  const { mine, myIds, loading } = useMyShifts()
  const volunteers = useList('volunteers')
  const names = useMemo(() => new Map(volunteers.data.map((v) => [v.id, v.full_name])), [volunteers.data])

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title={
          <>
            Mitt <em className="font-display font-normal italic">schema</em>
          </>
        }
        subtitle={`Alla pass för ${auth.displayName} i alla kommittéer.`}
      />
      {mine.length === 0 ? (
        <Empty icon={<CalendarCheck className="size-8 text-slate-300" />}>Du har inga pass inlagda ännu. Fråga din kommittéansvarig.</Empty>
      ) : (
        <div className="space-y-10">
          {groupByDate(mine).map(([date, list]) => (
            <section key={date}>
              <h2 className="text-xl font-semibold text-ink first-letter:uppercase">{formatDay(date)}</h2>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {list.map((s) => (
                  <ShiftItem
                    key={s.id}
                    shift={s}
                    state={shiftState(s, at)}
                    others={s.volunteer_ids.filter((id) => !myIds.has(id)).flatMap((id) => names.get(id) ?? [])}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
