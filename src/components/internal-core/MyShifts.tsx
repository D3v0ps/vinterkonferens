import { useMemo } from 'react'
import { useAuth } from '../../lib/auth'
import { useList } from '../../lib/hooks'
import type { Shift } from '../../lib/types'
import { Badge, cx } from '../ui'
import { byStart, shiftState, timeRange } from './shifts'

export function useMyShifts() {
  const auth = useAuth()
  const shifts = useList('shifts')
  const myIds = useMemo(() => new Set(auth.memberships.map((m) => m.id)), [auth.memberships])
  const mine = useMemo(() => shifts.data.filter((s) => s.volunteer_ids.some((id) => myIds.has(id))).sort(byStart), [shifts.data, myIds])
  return { mine, myIds, loading: shifts.loading }
}

/** Ett pass som rad i en lista. Lägg raderna i en <ul className="divide-y divide-line border-y border-line">. */
export function ShiftItem({ shift: s, state, others, dateLabel }: { shift: Shift; state: ReturnType<typeof shiftState>; others?: string[]; dateLabel?: string }) {
  const { committees } = useAuth()
  const c = committees.find((x) => x.id === s.committee_id)
  const meta = [c?.name, s.location].filter(Boolean).join(' · ')
  return (
    <li className={cx('flex gap-4 py-4', state === 'done' && 'opacity-60')}>
      <div className="w-28 shrink-0">
        {dateLabel && <div className="text-base text-muted first-letter:uppercase">{dateLabel}</div>}
        <div className={cx('text-base font-semibold tabular-nums', state === 'ongoing' ? 'text-accent-strong' : 'text-ink')}>{timeRange(s)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-base font-semibold text-ink">{s.title}</h3>
          {state === 'ongoing' && <Badge tone="accent">Pågår nu</Badge>}
          {state === 'done' && <Badge>Klart</Badge>}
        </div>
        {meta && (
          <p className="mt-0.5 flex items-center gap-2 text-base text-muted">
            {c && <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />}
            {meta}
          </p>
        )}
        {s.notes && <p className="mt-1 whitespace-pre-line text-base text-slate-700">{s.notes}</p>}
        {others && others.length > 0 && <p className="mt-1 text-base text-muted">Med dig: {others.join(', ')}</p>}
      </div>
    </li>
  )
}
