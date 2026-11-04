import { Clock, FlaskConical, RotateCcw } from 'lucide-react'
import { isDemo } from '../lib/api'
import { useConference } from '../lib/conference'
import { useNow } from '../lib/hooks'
import { resetDemoData } from '../lib/localAdapter'
import { formatDateTime, isSimulated, setSimulatedTime, weekdayShort } from '../lib/time'

/** Visas i demoläge, eller när "tidsmaskinen" (?tid=…) används för förhandsvisning. */
export default function DemoBar() {
  const { days } = useConference()
  const at = useNow(30_000)
  const sim = isSimulated()
  if (!isDemo && !sim) return null
  return (
    <div className="no-print bg-amber-100 text-amber-950 text-xs">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2">
        {isDemo && (
          <span className="inline-flex items-center gap-1 font-semibold">
            <FlaskConical className="size-3.5" /> Demoläge – data sparas bara i den här webbläsaren
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" /> {sim ? 'Simulerad tid:' : 'Tid:'} {formatDateTime(at.toISOString())}
        </span>
        <span className="flex flex-wrap gap-1">
          {days.map((d) => (
            <button key={d.id} className="rounded-md bg-white/70 px-2 py-0.5 hover:bg-white" onClick={() => setSimulatedTime(`${d.date}T11:20`)}>
              {weekdayShort(d.date)} 11:20
            </button>
          ))}
          {days.slice(1, 2).map((d) => (
            <button key={d.id + 'pm'} className="rounded-md bg-white/70 px-2 py-0.5 hover:bg-white" onClick={() => setSimulatedTime(`${d.date}T14:35`)}>
              {weekdayShort(d.date)} 14:35
            </button>
          ))}
          {sim && (
            <button className="rounded-md bg-white px-2 py-0.5 font-semibold" onClick={() => setSimulatedTime(null)}>
              Riktig tid
            </button>
          )}
        </span>
        {isDemo && (
          <button className="ms-auto inline-flex items-center gap-1 underline" onClick={() => confirm('Återställ all demodata?') && resetDemoData()}>
            <RotateCcw className="size-3.5" /> Återställ demo
          </button>
        )}
      </div>
    </div>
  )
}
