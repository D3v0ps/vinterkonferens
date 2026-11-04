// Inloggning för interna vyn.
// Behörighet styrs av tabellen `volunteers`: den som finns med sin e-post i en
// kommitté är volontär där; `is_lead` = kommittéansvarig; medlemmar i Styrgruppen = admin.
// I artifacten är man inloggad via claude.ai: e-posten kommer därifrån och artifactens
// ägare är alltid admin (så att någon kan lägga in de första volontärerna).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, supabase } from './api'
import { onTableChange } from './db'
import { claudeUse, safeStorage } from './platform'
import type { Committee, Volunteer } from './types'

interface ArtifactUser {
  me(): Promise<{ id: string | null; name: string; email: string | null; isOwner: boolean }>
}

type Status = 'loading' | 'signedOut' | 'signedIn'

interface AuthState {
  status: Status
  email: string | null
  userId: string | null
  /** Personens rader i volunteers (en per kommitté). */
  memberships: Volunteer[]
  committees: Committee[]
  /** Medlemskapen för nuvarande e-post är hämtade. */
  membershipsLoaded: boolean
  /** Felmeddelande om hämtningen av medlemskap misslyckades. */
  membershipsError: string | null
  reloadMemberships: () => void
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
  /** Inloggningen sköts av claude.ai (artifacten) – ingen in- eller utloggning i appen. */
  managedSignIn: boolean
  /** Admin som tillfälligt ser sidan som en annan volontär (förhandsgranskning av roller). */
  viewAs: string | null
  setViewAs: (email: string | null) => void
  /** Den inloggade personen är admin på riktigt (även när viewAs används). */
  realIsAdmin: boolean
}

const Ctx = createContext<AuthState | null>(null)
const DEMO_KEY = 'vk-demo-user'
const VIEW_AS_KEY = 'vk-view-as'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [realEmail, setRealEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [viewAs, setViewAsState] = useState<string | null>(() => safeStorage.get(VIEW_AS_KEY, true))
  const [realAdminEmails, setRealAdminEmails] = useState<string[]>([])
  const managedSignIn = api.mode === 'artifact'
  // När en admin förhandsgranskar som någon annan gäller den personens e-post
  const realIsAdmin = (managedSignIn && isOwner) || (!!realEmail && realAdminEmails.includes(realEmail))
  const email = viewAs && realIsAdmin ? viewAs : realEmail
  const setEmail = setRealEmail
  const [loadedMemberships, setLoadedMemberships] = useState<Volunteer[]>([])
  const [committees, setCommittees] = useState<Committee[]>([])
  // Vilken e-post `memberships` gäller (undefined = inget hämtat än)
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<{ for: string | null; message: string } | null>(null)
  const reqRef = useRef(0)

  // Sessionen
  useEffect(() => {
    if (managedSignIn) {
      claudeUse<ArtifactUser>('user').then(async (u) => {
        const me = u ? await u.me() : null
        setRealEmail(me?.email?.trim().toLowerCase() || null)
        setUserId(me?.id ?? null)
        setIsOwner(!!me?.isOwner)
        setProfileName(me?.name ?? '')
        setStatus(me && (me.id || me.isOwner || me.email) ? 'signedIn' : 'signedOut')
      })
      return
    }
    if (!supabase) {
      const e = safeStorage.get(DEMO_KEY)
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
    const req = ++reqRef.current
    setLoadError(null)
    try {
      const cs = await api.list('committees', { order: [{ col: 'sort' }] })
      const vs = email ? await api.list('volunteers', { filters: [{ col: 'email', op: 'eq', value: email }] }) : []
      // Är den inloggade (inte förhandsgranskade) personen med i styrgruppen?
      const sg = cs.find((c) => c.slug === 'styrgruppen')
      const admins = sg && realEmail ? (await api.list('volunteers', { filters: [{ col: 'committee_id', op: 'eq', value: sg.id }] })).map((v) => v.email ?? '') : []
      if (req !== reqRef.current) return // svar på en äldre hämtning
      setCommittees(cs)
      setLoadedMemberships(vs)
      setRealAdminEmails(admins)
      setLoadedFor(email)
    } catch (e) {
      if (req === reqRef.current) setLoadError({ for: email, message: (e as Error).message })
    }
  }, [email, realEmail])

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
    const membershipsLoaded = loadedFor === email
    // Visa aldrig en annan e-posts medlemskap medan de nya hämtas
    const memberships = membershipsLoaded ? loadedMemberships : []
    const slugOf = (id: string) => committees.find((c) => c.id === id)?.slug
    // Artifactens ägare är alltid admin – utom när hen förhandsgranskar som någon annan
    const ownerAdmin = managedSignIn && isOwner && !(viewAs && realIsAdmin)
    const isAdmin = ownerAdmin || memberships.some((m) => slugOf(m.committee_id) === 'styrgruppen')
    const isMember = (id: string | null | undefined) => isAdmin || (!!id && memberships.some((m) => m.committee_id === id))
    const isLead = (id: string | null | undefined) => isAdmin || (!!id && memberships.some((m) => m.committee_id === id && m.is_lead))
    const idOf = (slug: string) => committees.find((c) => c.slug === slug)?.id
    return {
      status,
      email,
      userId,
      memberships,
      committees,
      membershipsLoaded,
      membershipsError: !membershipsLoaded && loadError?.for === email ? loadError.message : null,
      reloadMemberships: () => void loadMemberships(),
      displayName: memberships[0]?.full_name || (viewAs && realIsAdmin ? email : profileName) || email || (ownerAdmin ? 'Ägaren' : ''),
      isStaff: memberships.length > 0 || ownerAdmin,
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
        safeStorage.set(DEMO_KEY, e)
        setEmail(e)
        setUserId('demo-' + e)
        setStatus('signedIn')
      },
      async signOut() {
        if (managedSignIn) return
        if (supabase) await supabase.auth.signOut()
        safeStorage.set(DEMO_KEY, null)
        safeStorage.set(VIEW_AS_KEY, null, true)
        setViewAsState(null)
        setEmail(null)
        setUserId(null)
        setStatus('signedOut')
      },
      managedSignIn,
      viewAs: viewAs && realIsAdmin ? viewAs : null,
      setViewAs(e) {
        const v = e?.trim().toLowerCase() || null
        safeStorage.set(VIEW_AS_KEY, v, true)
        setViewAsState(v)
      },
      realIsAdmin,
    }
  }, [status, email, userId, loadedMemberships, committees, loadedFor, loadError, loadMemberships, managedSignIn, isOwner, viewAs, realIsAdmin, profileName, setEmail])

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
    ...((supabase || api.mode === 'artifact') && userId ? { created_by: userId } : {}),
  })
}
