import { Agenda, DayTabs, NowNext, PageTitle, PostsList, useDaySessions, useSelectedDay } from '../../components/Agenda'
import { Spinner, cx } from '../../components/ui'
import { useConference } from '../../lib/conference'
import { useI18n } from '../../lib/i18n'
import { formatShortDay } from '../../lib/time'

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
          {/* Dagflikarna visar redan dagen, så rubriken syns bara när det inte finns flikar (skärmläsare får den alltid). */}
          {date && (
            <h2 className={cx('mb-2 text-xl font-semibold text-ink first-letter:uppercase', days.length > 1 && 'sr-only')}>{formatShortDay(date, lang)}</h2>
          )}
          <Agenda sessions={sessions} />
        </>
      )}
    </>
  )
}
