import { ChevronDown, Clock, FlaskConical, RotateCcw } from 'lucide-react'
import { isDemo } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useConference } from '../lib/conference'
import { useNow } from '../lib/hooks'
import { resetDemoData } from '../lib/localAdapter'
import { isArtifact } from '../lib/platform'
import { formatDateTime, isSimulated, setSimulatedTime, weekdayShort } from '../lib/time'
import { confirmDialog } from './dialogs'

/**
 * Tidsmaskin för förhandsvisning: se sidan som den ser ut mitt under konferensen.
 * Visas i demoläget, för admins i artifacten och när en simulerad tid är satt.
 */
export default function DemoBar() {
  const { days } = useConference()
  const auth = useAuth()
  const at = useNow(30_000)
  const sim = isSimulated()
  if (!isDemo && !sim && !(isArtifact && auth.realIsAdmin)) return null
  const btn = 'inline-flex min-h-11 shrink-0 items-center rounded-lg bg-white/70 px-3 text-base hover:bg-white'
  const label = isDemo ? 'Demoläge – data sparas bara i den här webbläsaren' : 'Förhandsvisning'
  return (
    <details className="no-print group bg-amber-100 text-amber-950" open={sim || undefined}>
      <summary className="mx-auto flex min-h-11 max-w-6xl cursor-pointer list-none items-center gap-2 px-4 text-base [&::-webkit-details-marker]:hidden">
        <FlaskConical className="size-4 shrink-0" aria-hidden />
        <span className="font-medium">{label}</span>
        <span className="truncate text-amber-900">
          · {sim ? `Simulerad tid ${formatDateTime(at.toISOString())}` : 'Riktig tid'}
        </span>
        <ChevronDown className="ms-auto size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mx-auto flex max-w-6xl flex-nowrap items-center gap-2 overflow-x-auto px-4 pb-2 sm:flex-wrap">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-base">
          <Clock className="size-4" aria-hidden /> Visa sidan som:
        </span>
        {days.map((d) => (
          <button key={d.id} className={btn} onClick={() => setSimulatedTime(`${d.date}T11:20`)}>
            {weekdayShort(d.date)} 11:20
          </button>
        ))}
        {days.slice(1, 2).map((d) => (
          <button key={d.id + 'pm'} className={btn} onClick={() => setSimulatedTime(`${d.date}T14:35`)}>
            {weekdayShort(d.date)} 14:35
          </button>
        ))}
        {sim && (
          <button className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-white px-3 text-base font-medium" onClick={() => setSimulatedTime(null)}>
            Riktig tid
          </button>
        )}
        {isDemo && (
          <button
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-base underline sm:ms-auto"
            onClick={async () => {
              if (await confirmDialog({ title: 'Återställ demon?', message: 'All demodata i den här webbläsaren raderas och börjar om.', confirmLabel: 'Återställ', danger: true })) resetDemoData()
            }}
          >
            <RotateCcw className="size-4" aria-hidden /> Återställ demo
          </button>
        )}
      </div>
    </details>
  )
}
