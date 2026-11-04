// Inloggning för interna vyn.
// Behörighet styrs av tabellen `volunteers`: den som finns med sin e-post i en
// kommitté är volontär där; `is_lead` = kommittéansvarig; medlemmar i Styrgruppen = admin.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, supabase } from './api'
import { onTableChange } from './db'
import type { Committee, Volunteer } from './types'

type Status = 'loading' | 'signedOut' | 'signedIn'

interface AuthState {
  status: Status
  email: string | null
  userId: string | null
  /** Personens rader i volunteers (en per kommitté). */
  memberships: Volunteer[]
  committees: Committee[]
  displayName: string
  isStaff: boolean
  isAdmin: boolean
  isMember: (committeeId: string | null | undefined) => boolean
  isLead: (committeeId: string | null | undefined) => boolean
  isMemberOf: (slug: string) => boolean
  isLeadOf: (slug: string) => boolean
  sendCode: (email: string) => Promise<void>
  verifyCode: (email: string, code: string) => Promise<void>
  demoSignIn: (email: string) => void
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)
const DEMO_KEY = 'vk-demo-user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [email, setEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [memberships, setMemberships] = useState<Volunteer[]>([])
  const [committees, setCommittees] = useState<Committee[]>([])

  // Sessionen
  useEffect(() => {
    if (!supabase) {
      const e = localStorage.getItem(DEMO_KEY)
      setEmail(e)
      setUserId(e ? 'demo-' + e : null)
      setStatus(e ? 'signedIn' : 'signedOut')
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email?.toLowerCase() ?? null)
      setUserId(data.session?.user.id ?? null)
      setStatus(data.session ? 'signedIn' : 'signedOut')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email?.toLowerCase() ?? null)
      setUserId(session?.user.id ?? null)
      setStatus(session ? 'signedIn' : 'signedOut')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Kommittéer + medlemskap
  const loadMemberships = useCallback(async () => {
    const cs = await api.list('committees', { order: [{ col: 'sort' }] }).catch(() => [])
    setCommittees(cs)
    if (!email) return setMemberships([])
    const vs = await api.list('volunteers', { filters: [{ col: 'email', op: 'eq', value: email }] }).catch(() => [])
    setMemberships(vs)
  }, [email])

  useEffect(() => {
    loadMemberships()
    const a = onTableChange('volunteers', loadMemberships)
    const b = onTableChange('committees', loadMemberships)
    return () => {
      a()
      b()
    }
  }, [loadMemberships])

  const value = useMemo<AuthState>(() => {
    const slugOf = (id: string) => committees.find((c) => c.id === id)?.slug
    const isAdmin = memberships.some((m) => slugOf(m.committee_id) === 'styrgruppen')
    const isMember = (id: string | null | undefined) => isAdmin || (!!id && memberships.some((m) => m.committee_id === id))
    const isLead = (id: string | null | undefined) => isAdmin || (!!id && memberships.some((m) => m.committee_id === id && m.is_lead))
    const idOf = (slug: string) => committees.find((c) => c.slug === slug)?.id
    return {
      status,
      email,
      userId,
      memberships,
      committees,
      displayName: memberships[0]?.full_name || email || '',
      isStaff: memberships.length > 0,
      isAdmin,
      isMember,
      isLead,
      isMemberOf: (slug) => isMember(idOf(slug)),
      isLeadOf: (slug) => isLead(idOf(slug)),
      async sendCode(e) {
        if (!supabase) return
        const { error } = await supabase.auth.signInWithOtp({
          email: e.trim().toLowerCase(),
          options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL + 'intern' },
        })
        if (error) throw new Error(error.message)
      },
      async verifyCode(e, code) {
        if (!supabase) return
        const { error } = await supabase.auth.verifyOtp({ email: e.trim().toLowerCase(), token: code.trim(), type: 'email' })
        if (error) throw new Error('Fel eller utgången kod. Försök igen.')
      },
      demoSignIn(e) {
        localStorage.setItem(DEMO_KEY, e)
        setEmail(e)
        setUserId('demo-' + e)
        setStatus('signedIn')
      },
      async signOut() {
        if (supabase) await supabase.auth.signOut()
        localStorage.removeItem(DEMO_KEY)
        setEmail(null)
        setUserId(null)
        setStatus('signedOut')
      },
    }
  }, [status, email, userId, memberships, committees])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth utanför AuthProvider')
  return v
}

/** Fält som sätts på rader som en inloggad person skapar. */
export function useAuthorFields() {
  const { userId, displayName } = useAuth()
  return () => ({
    author_name: displayName || null,
    ...(supabase && userId ? { created_by: userId } : {}),
  })
}
