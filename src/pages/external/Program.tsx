import { Agenda, DayTabs, NowNext, PageTitle, PostsList, useDaySessions, useSelectedDay } from '../../components/Agenda'
import { Spinner } from '../../components/ui'
import { useConference } from '../../lib/conference'
import { useI18n } from '../../lib/i18n'
import { formatDay } from '../../lib/time'

const AUD = ['adults', 'all'] as const

export default function Program() {
  const { t, lang } = useI18n()
  const { today } = useConference()
  const { days, date, setDate } = useSelectedDay()
  const { sessions, loading } = useDaySessions(date, [...AUD])
  return (
    <>
      <PageTitle title={t.adults} lead={t.programLead} />
      <PostsList page="program" />
      <DayTabs days={days} value={date} onChange={setDate} />
      {loading ? (
        <Spinner />
      ) : (
        <>
          {date === today && <NowNext sessions={sessions} />}
          {date && <h2 className="mb-2 text-xl font-semibold text-ink first-letter:uppercase">{formatDay(date, lang)}</h2>}
          <Agenda sessions={sessions} />
        </>
      )}
    </>
  )
}
