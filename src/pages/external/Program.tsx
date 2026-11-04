import { Agenda, DayTabs, NowNext, PostsList, useDaySessions, useSelectedDay } from '../../components/Agenda'
import { Spinner } from '../../components/ui'
import { useConference } from '../../lib/conference'
import { useI18n } from '../../lib/i18n'

const AUD = ['adults', 'all'] as const

export default function Program() {
  const { t } = useI18n()
  const { today } = useConference()
  const { days, date, setDate } = useSelectedDay()
  const { sessions, loading } = useDaySessions(date, [...AUD])
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t.adults}</h1>
      <p className="mb-4 text-sm text-slate-600">{t.programLead}</p>
      <DayTabs days={days} value={date} onChange={setDate} />
      <PostsList page="program" />
      {loading ? (
        <Spinner />
      ) : (
        <>
          {date === today && <NowNext sessions={sessions} />}
          <Agenda sessions={sessions} />
        </>
      )}
    </>
  )
}
