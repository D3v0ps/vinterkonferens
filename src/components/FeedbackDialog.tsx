import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Check, CheckCircle2, Star } from 'lucide-react'
import { api } from '../lib/api'
import { uuid } from '../lib/db'
import { deviceId } from '../lib/hooks'
import { safeStorage } from '../lib/platform'
import { Tr, errorText, useI18n } from '../lib/i18n'
import type { FeedbackAnswers, Session } from '../lib/types'
import { Button, ErrorText, Modal, Textarea, cx } from './ui'

// En gemensam lista för hela sidan, så att programlistan och anslaget alltid visar samma sak.
const RATED_KEY = 'vk-rated'
let ratedCache: string[] | null = null
const ratedListeners = new Set<() => void>()

function loadRated(): string[] {
  try {
    const v: unknown = JSON.parse(safeStorage.get(RATED_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

const getRated = () => (ratedCache ??= loadRated())

// Lyssnar alltid, så att betyg från andra flikar syns även om ingen lista var monterad just då.
window.addEventListener('storage', (e) => {
  if (e.key !== RATED_KEY && e.key !== null) return
  ratedCache = null
  ratedListeners.forEach((l) => l())
})

function subscribeRated(cb: () => void) {
  ratedListeners.add(cb)
  return () => {
    ratedListeners.delete(cb)
  }
}

function markRated(id: string) {
  // Slå ihop med det som redan ligger sparat (t.ex. från en annan flik) så att inget skrivs över.
  ratedCache = [...new Set([...getRated(), ...loadRated(), id])]
  safeStorage.set(RATED_KEY, JSON.stringify(ratedCache))
  ratedListeners.forEach((l) => l())
}

/**
 * Den som betygsätter: ett anonymt id för enheten. Betyg kopplas aldrig till personens konto.
 * (Är lagringen blockerad gäller id:t bara tills sidan laddas om.)
 */
async function raterId(): Promise<string> {
  return deviceId()
}

// Utan Supabase finns ingen unik nyckel i databasen, så betyget får ett id per föreläsning och betygsättare.
const uniqueIds = () => api.mode !== 'supabase'

export function useRated() {
  const rated = useSyncExternalStore(subscribeRated, getRated)
  return { rated, isRated: (id: string) => rated.includes(id), markRated }
}

/**
 * Modal för formulär som inte får tömmas av misstag. `persistent` räcker inte ensamt i Chromium: efter
 * ett par Esc i rad (utan klick emellan) går cancel inte längre att stoppa, dialogen stängs ändå och
 * Modal tar bort innehållet. Därför stoppas Esc redan vid tangenttrycket, och stängs dialogen ändå på
 * annat sätt (t.ex. Androids bakåtgest) öppnas den igen direkt med fokus och scroll kvar – innehållet
 * är fortfarande monterat. Krysset och formulärets egna knappar stänger som vanligt.
 * (Hör egentligen hemma i Modal i ui.tsx; när den gör samma sak kan den här bytas mot Modal.)
 */
export function FormModal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const saved = useRef<{ focus: Element | null; scroll: [Element, number][] } | null>(null)

  useEffect(() => {
    const d = open ? anchor.current?.closest('dialog') : null
    if (!d) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing && e.target instanceof Element && e.target.closest('dialog') === d) e.preventDefault()
    }
    // Inför en stängning vi inte bad om: kom ihåg fokus och scroll så att allt är som förut efteråt.
    const onCancel = () => {
      const scroll: [Element, number][] = []
      for (let el = anchor.current?.parentElement; el && el !== d; el = el.parentElement) if (el.scrollTop) scroll.push([el, el.scrollTop])
      saved.current = { focus: document.activeElement, scroll }
    }
    d.addEventListener('keydown', onKey)
    d.addEventListener('cancel', onCancel)
    return () => {
      d.removeEventListener('keydown', onKey)
      d.removeEventListener('cancel', onCancel)
    }
  }, [open])

  function handleClose() {
    const d = anchor.current?.closest('dialog')
    // Krysset anropar oss medan dialogen är öppen. Är den redan stängd var det webbläsaren: öppna igen.
    if (open && d && !d.open) {
      d.showModal()
      const s = saved.current
      saved.current = null
      s?.scroll.forEach(([el, y]) => (el.scrollTop = y))
      if (s?.focus instanceof HTMLElement && d.contains(s.focus)) s.focus.focus({ preventScroll: true })
      return
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title={title} persistent>
      <span ref={anchor} hidden />
      {children}
    </Modal>
  )
}

type Q = { key: keyof FeedbackAnswers; options: string[] }
// Tre snabba kryssfrågor. "arrival" hjälper oss förstå om publiken hinner in till starten.
const QUESTIONS: Q[] = [
  { key: 'relevance', options: ['yes', 'partly', 'no'] },
  { key: 'length', options: ['short', 'good', 'long'] },
  { key: 'arrival', options: ['early', 'ontime', 'late'] },
]

export default function FeedbackDialog({ session, onClose, onDone }: { session: Session | null; onClose: () => void; onDone: (id: string) => void }) {
  const { t, lang } = useI18n()
  const [rating, setRating] = useState(0)
  const [answers, setAnswers] = useState<FeedbackAnswers>({})
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  // Ökas när dialogen stängs, så att ett svar som kommer efteråt inte hamnar i nästa föreläsnings dialog.
  const gen = useRef(0)

  function reset() {
    gen.current++
    setBusy(false)
    setRating(0)
    setAnswers({})
    setComment('')
    setErr(null)
    setSent(false)
    onClose()
  }

  async function submit() {
    if (!session) return
    if (!rating) return setErr(t.chooseStars)
    const g = gen.current
    const current = () => g === gen.current
    setBusy(true)
    setErr(null)
    try {
      const rater = await raterId()
      const id = uniqueIds() ? `${session.id}_${rater}` : uuid()
      // Finns betyget redan (t.ex. efter en omladdning med blockerad lagring) räknas det som klart.
      if (!uniqueIds() || !(await api.get('feedback', id))) {
        await api.insert(
          'feedback',
          { id, session_id: session.id, rating, answers, comment: comment.trim() || null, device_id: rater, lang },
          { returning: false },
        )
      }
      if (current()) setSent(true)
      onDone(session.id)
    } catch (e) {
      // Redan betygsatt från den här enheten räknas som klart
      if (/duplicate|unique/i.test((e as Error).message)) {
        if (current()) setSent(true)
        onDone(session.id)
      } else if (current()) setErr(errorText(e, t))
    } finally {
      if (current()) setBusy(false)
    }
  }

  const label = (key: string) => (t as unknown as Record<string, string>)[key]

  return (
    // FormModal: Esc ska inte tömma ett halvifyllt betyg
    <FormModal open={!!session} onClose={reset} title={sent ? t.rated : session?.kind === 'panel' ? t.rateTitlePanel : t.rateTitle}>
      {session &&
        (sent ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto size-12 text-emerald-700" strokeWidth={1.75} aria-hidden />
            <p className="mt-3 text-lg text-ink">{t.ratedBody}</p>
            <Button className="mt-6 w-full sm:w-auto" onClick={reset}>
              {t.close}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-lg leading-snug font-semibold text-ink">
                <Tr value={session.title} />
              </p>
              <p className="mt-1 text-base text-muted">{t.feedbackHint}</p>
            </div>

            <fieldset>
              <legend className="mb-2 text-base font-medium text-ink">{t.stars}</legend>
              <div className="flex justify-center gap-0 min-[340px]:gap-1" dir="ltr">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setRating(n)
                      setErr(null)
                    }}
                    aria-label={t.starN(n)}
                    aria-pressed={rating === n}
                    className="grid size-14 place-items-center rounded-md"
                  >
                    <Star className={cx('size-11 transition-colors', n <= rating ? 'fill-accent text-accent-strong' : 'text-slate-300')} strokeWidth={1.5} />
                  </button>
                ))}
              </div>
              <p className="mt-1 min-h-6 text-center text-base text-muted" aria-live="polite">
                {rating ? t.starN(rating) : ''}
              </p>
            </fieldset>

            {QUESTIONS.map((q) => (
              <fieldset key={q.key}>
                <legend className="mb-2 text-base font-medium text-ink">{label(`q_${q.key}`)}</legend>
                <div className="flex flex-wrap gap-2">
                  {q.options.map((o) => {
                    const on = answers[q.key] === o
                    return (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setAnswers({ ...answers, [q.key]: on ? undefined : o })}
                        className={cx(
                          'inline-flex min-h-12 items-center gap-1.5 border px-4 text-base font-medium transition-colors',
                          on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-slate-400',
                        )}
                      >
                        {on && <Check className="size-4" aria-hidden />}
                        {label(`a_${o}`)}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ))}

            <label className="block">
              <span className="mb-1.5 block text-base font-medium text-ink">{t.comment}</span>
              <Textarea maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t.commentPh} />
            </label>
            <ErrorText>{err}</ErrorText>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={reset}>
                {t.cancel}
              </Button>
              <Button variant="accent" className="flex-1" loading={busy} onClick={submit}>
                {busy ? t.sending : t.send}
              </Button>
            </div>
          </div>
        ))}
    </FormModal>
  )
}
