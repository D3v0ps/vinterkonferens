import { Clock, FlaskConical, RotateCcw } from 'lucide-react'
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
  const btn = 'min-h-8 rounded-md bg-white/70 px-2.5 py-1 hover:bg-white'
  return (
    <div className="no-print bg-amber-100 text-amber-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <FlaskConical className="size-4" />
          {isDemo ? 'Demoläge – data sparas bara i den här webbläsaren' : 'Förhandsvisning'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-4" /> {sim ? 'Simulerad tid' : 'Tid'}: {formatDateTime(at.toISOString())}
        </span>
        <span className="flex flex-wrap gap-1.5">
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
            <button className="min-h-8 rounded-md bg-white px-2.5 py-1 font-medium" onClick={() => setSimulatedTime(null)}>
              Riktig tid
            </button>
          )}
        </span>
        {isDemo && (
          <button
            className="ms-auto inline-flex min-h-8 items-center gap-1.5 underline"
            onClick={async () => {
              if (await confirmDialog({ title: 'Återställ demon?', message: 'All demodata i den här webbläsaren raderas och börjar om.', confirmLabel: 'Återställ', danger: true })) resetDemoData()
            }}
          >
            <RotateCcw className="size-4" /> Återställ demo
          </button>
        )}
      </div>
    </div>
  )
}
