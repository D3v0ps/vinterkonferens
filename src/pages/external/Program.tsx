import { Agenda, DayTabs, DisplayLast, NowNext, PageTitle, PostsList, useDaySessions, useSelectedDay } from '../../components/Agenda'
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
          {/* Betygsknappen finns i listan, så Nu & nästa visar ingen egen uppmaning här. */}
          {date === today && <NowNext sessions={sessions} rateBanner={false} />}
          {/* Dagens rubrik som på den tryckta affischen ("Lördag 27 december"), ovanför hela dagens schema. */}
          {date && (
            <h2 className="mb-4 text-[1.75rem] leading-tight text-ink first-letter:uppercase sm:text-4xl">
              <DisplayLast text={formatDay(date, lang).replace(/[,،]/g, '')} />
            </h2>
          )}
          <Agenda sessions={sessions} />
        </>
      )}
    </>
  )
}
