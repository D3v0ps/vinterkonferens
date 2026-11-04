import { useMemo } from 'react'
import { MapPin, UsersRound } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { useList } from '../../lib/hooks'
import type { Shift } from '../../lib/types'
import { Badge, Card, cx } from '../ui'
import { byStart, shiftState, timeRange } from './shifts'

export function useMyShifts() {
  const auth = useAuth()
  const shifts = useList('shifts')
  const myIds = useMemo(() => new Set(auth.memberships.map((m) => m.id)), [auth.memberships])
  const mine = useMemo(() => shifts.data.filter((s) => s.volunteer_ids.some((id) => myIds.has(id))).sort(byStart), [shifts.data, myIds])
  return { mine, myIds, loading: shifts.loading }
}

export function ShiftItem({ shift: s, state, others, dateLabel }: { shift: Shift; state: ReturnType<typeof shiftState>; others?: string[]; dateLabel?: string }) {
  const { committees } = useAuth()
  const c = committees.find((x) => x.id === s.committee_id)
  return (
    <Card className={cx('p-4', state === 'ongoing' && 'border-emerald-300 ring-1 ring-emerald-200', state === 'done' && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-2">
        {dateLabel && <span className="text-sm font-medium first-letter:uppercase text-slate-500">{dateLabel}</span>}
        <span className="font-mono text-sm font-semibold tabular-nums text-ink">{timeRange(s)}</span>
        <h3 className="font-semibold text-ink">{s.title}</h3>
        {state === 'ongoing' && <Badge tone="green">Pågår nu</Badge>}
        {state === 'done' && <Badge>Klart</Badge>}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        {c && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: c.color }} /> {c.name}
          </span>
        )}
        {s.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" /> {s.location}
          </span>
        )}
      </div>
      {s.notes && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{s.notes}</p>}
      {others && others.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-600">
          <UsersRound className="mt-0.5 size-4 shrink-0 text-slate-400" />
          <span>Med dig: {others.join(', ')}</span>
        </p>
      )}
    </Card>
  )
}
