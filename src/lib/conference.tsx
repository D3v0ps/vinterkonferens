import { createContext, useContext, useMemo, type ReactNode } from 'react'
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

interface Conference {
  settings: Settings
  days: ConferenceDay[]
  today: string
  isConferenceDay: boolean
  /** Idag om det är en konferensdag, annars nästa (eller sista) dag. */
  currentDay: ConferenceDay | null
  defaultLang: Lang
  loading: boolean
}

const Ctx = createContext<Conference | null>(null)

/** Hämtar inställningar och konferensdagar en gång för hela appen. */
export function ConferenceProvider({ children }: { children: ReactNode }) {
  const s = useList('settings', undefined, { pollMs: 300_000 })
  const d = useList('conference_days', { order: [{ col: 'date' }] })
  const at = useNow(60_000)
  const value = useMemo<Conference>(() => {
    const days = d.data
    const today = localDate(at)
    const todayDay = days.find((x) => x.date === today) ?? null
    return {
      settings: s.data[0] ?? EMPTY_SETTINGS,
      days,
      today,
      isConferenceDay: !!todayDay,
      currentDay: todayDay ?? days.find((x) => x.date > today) ?? days[days.length - 1] ?? null,
      defaultLang: todayDay?.default_lang ?? 'sv',
      loading: s.loading || d.loading,
    }
  }, [s.data, d.data, s.loading, d.loading, at])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useConference(): Conference {
  const v = useContext(Ctx)
  if (!v) throw new Error('useConference utanför ConferenceProvider')
  return v
}
