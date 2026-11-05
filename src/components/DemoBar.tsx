import { useState } from 'react'
import { ChevronDown, Clock, FlaskConical, RotateCcw } from 'lucide-react'
import { isDemo } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useConference } from '../lib/conference'
import { useNow } from '../lib/hooks'
import { resetDemoData } from '../lib/localAdapter'
import { isArtifact } from '../lib/platform'
import { formatShortDay, isSimulated, localDate, localTime, setSimulatedTime, weekdayShort } from '../lib/time'
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
    <details className="no-print group bg-amber-100 text-amber-950">
      <summary className="mx-auto flex min-h-11 max-w-6xl cursor-pointer list-none items-center gap-2 px-4 text-base [&::-webkit-details-marker]:hidden">
        <FlaskConical className="size-4 shrink-0" aria-hidden />
        <span className="font-medium">{label}</span>
        <span className="truncate text-amber-900">
          · {sim ? `Simulerad tid ${formatShortDay(localDate(at))} ${localTime(at)}` : 'Riktig tid'}
        </span>
        <ChevronDown className="ms-auto size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mx-auto flex max-w-6xl flex-nowrap items-center gap-2 overflow-x-auto px-4 pb-2 sm:flex-wrap">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-base">
          <Clock className="size-4" aria-hidden /> Visa sidan som:
        </span>
        {days.map((d) => (
          <button key={d.id} className={btn} onClick={() => setSimulatedTime(`${d.date}T16:20`)}>
            {weekdayShort(d.date)} 16:20
          </button>
        ))}
        {days.slice(1, 2).map((d) => (
          <button key={d.id + 'pm'} className={btn} onClick={() => setSimulatedTime(`${d.date}T19:50`)}>
            {weekdayShort(d.date)} 19:50
          </button>
        ))}
        <PickTime days={days.map((d) => d.date)} />
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

/** Valfri dag och tid, t.ex. för att se läget "Räkna nu" mitt under en föreläsning. */
function PickTime({ days }: { days: string[] }) {
  const [day, setDay] = useState(days[0] ?? '')
  const [time, setTime] = useState('16:05')
  if (!days.length) return null
  return (
    <form
      className="flex shrink-0 items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (day && /^\d{2}:\d{2}$/.test(time)) setSimulatedTime(`${day}T${time}`)
      }}
    >
      <label className="sr-only" htmlFor="sim-day">
        Dag
      </label>
      <select id="sim-day" className="min-h-11 rounded-lg border border-amber-300 bg-white px-2 text-base" value={day} onChange={(e) => setDay(e.target.value)}>
        {days.map((d) => (
          <option key={d} value={d}>
            {formatShortDay(d)}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="sim-time">
        Klockslag
      </label>
      <input id="sim-time" type="time" className="min-h-11 rounded-lg border border-amber-300 bg-white px-2 text-base" value={time} onChange={(e) => setTime(e.target.value)} />
      <button type="submit" className="inline-flex min-h-11 items-center rounded-lg bg-white px-3 text-base font-medium">
        Visa
      </button>
    </form>
  )
}
