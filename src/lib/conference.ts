import { useMemo } from 'react'
import { useList, useNow } from './hooks'
import { localDate } from './time'
import type { ConferenceDay, Lang, Settings } from './types'

export const EMPTY_SETTINGS: Settings = {
  id: 1,
  conference_name: 'Vinterkonferensen',
  tagline: {},
  venue: '',
  contact: '',
  kitchen_info: {},
  fritids_info: {},
  fritids_price: {},
}

/** Inställningar + konferensdagar + vilken dag som är "aktuell". */
export function useConference() {
  const s = useList('settings')
  const d = useList('conference_days', { order: [{ col: 'date' }] })
  const at = useNow(60_000)
  return useMemo(() => {
    const days: ConferenceDay[] = d.data
    const today = localDate(at)
    const todayDay = days.find((x) => x.date === today) ?? null
    // Före konferensen: första dagen. Efter: sista dagen.
    const currentDay = todayDay ?? days.find((x) => x.date > today) ?? days[days.length - 1] ?? null
    const defaultLang: Lang = todayDay?.default_lang ?? 'sv'
    return {
      settings: s.data[0] ?? EMPTY_SETTINGS,
      days,
      today,
      isConferenceDay: !!todayDay,
      currentDay,
      defaultLang,
      loading: s.loading || d.loading,
    }
  }, [s.data, d.data, s.loading, d.loading, at])
}
