import { useId, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Plus, Ticket, Trash2 } from 'lucide-react'
import { Agenda, DayTabs, PageTitle, PostsList, useDaySessions, useSelectedDay } from '../../components/Agenda'
import { FormModal } from '../../components/FeedbackDialog'
import { Button, Checkbox, ErrorText, Input, Spinner, Textarea, cx } from '../../components/ui'
import { api } from '../../lib/api'
import { useConference } from '../../lib/conference'
import { tr } from '../../lib/format'
import { useLocalStorage } from '../../lib/hooks'
import { Tr, errorText, useI18n } from '../../lib/i18n'
import { formatShortDay } from '../../lib/time'
import type { Child } from '../../lib/types'

const AUD = ['kids', 'all'] as const

interface SavedReg {
  number: number
  guardian: string
  children: string[]
  days: string[]
}

export default function Kids() {
  const { t, lang } = useI18n()
  const { settings, isConferenceDay, today } = useConference()
  const { days, date, setDate } = useSelectedDay()
  const { sessions, loading } = useDaySessions(date, [...AUD])
  const [open, setOpen] = useState(false)
  const [mine, setMine] = useLocalStorage<SavedReg[]>('vk-my-regs', [])
  const price = tr(settings.fritids_price, lang)
  // När alla dagar har varit finns inget kvar att anmäla till: då försvinner inbjudan, och hela
  // fritidsdelen om det inte finns egna anmälningar att visa.
  const canRegister = !days.length || days.some((d) => d.date >= today)
  const showFritids = canRegister || mine.length > 0
  const fritidsFirst = !isConferenceDay && showFritids

  const fritids = showFritids && (
    <section key="fritids" className={cx(!fritidsFirst && 'mt-14')} aria-labelledby="fritids-title">
      <h2 id="fritids-title" className="text-2xl font-semibold text-ink">
        {t.fritids}
      </h2>
      {canRegister && (
        <>
          <p className="mt-2 max-w-[60ch] text-base">{tr(settings.fritids_info, lang) ? <Tr value={settings.fritids_info} /> : t.registerLead}</p>
          {price && (
            <p className="mt-1 text-base font-medium text-ink">
              <Tr value={settings.fritids_price} />
            </p>
          )}
        </>
      )}

      {mine.length > 0 && (
        <div className={canRegister ? 'mt-6' : 'mt-3'}>
          <h3 className="text-lg font-semibold text-ink">{t.myRegistrations}</h3>
          <ul className="mt-2 space-y-2">
            {mine.map((r) => (
              <li key={r.number} className="flex items-center gap-4 rounded-lg border border-line bg-white px-4 py-3">
                <span className="shrink-0 text-3xl font-semibold tabular-nums text-ink" dir="ltr">
                  #{r.number}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{r.children.join(t.listSep)}</span>
                  <span className="block text-base text-muted first-letter:uppercase">{r.days.map((d) => formatShortDay(d, lang)).join(t.listSep)}</span>
                </span>
              </li>
            ))}
          </ul>
          {canRegister && <p className="mt-2 text-base text-muted">{t.regDoneInfo}</p>}
        </div>
      )}

      {canRegister && (
        <Button variant="accent" size="lg" className="mt-6 w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Ticket className="size-5" aria-hidden /> {mine.length ? t.newRegistration : t.register}
        </Button>
      )}
    </section>
  )

  // Barnens aktiviteter. Dagvalet visar redan datumet; bara en ensam dag får en egen datumrad.
  const activities = (
    <section key="activities" className={cx(fritidsFirst && 'mt-14')} aria-labelledby="kids-activities-title">
      {/* Kommer aktiviteterna först säger sidrubriken redan vad det är */}
      <h2 id="kids-activities-title" className={cx('text-2xl font-semibold text-ink', days.length > 1 && 'mb-4', !fritidsFirst && 'sr-only')}>
        {t.kidsActivities}
      </h2>
      {date && days.length < 2 && <p className="mt-1 mb-4 text-base text-muted first-letter:uppercase">{formatShortDay(date, lang)}</p>}
      <DayTabs days={days} value={date} onChange={setDate} />
      {loading ? <Spinner /> : <Agenda sessions={sessions} showFeedback={false} />}
    </section>
  )

  return (
    <>
      <PageTitle title={t.kids} lead={t.kidsLead} />
      {!fritidsFirst && canRegister && (
        <button
          type="button"
          className="-mt-2 mb-6 inline-flex min-h-11 items-center gap-1.5 text-base font-medium text-ink underline underline-offset-4"
          onClick={() => document.getElementById('fritids-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          {t.register} <span aria-hidden>↓</span>
        </button>
      )}
      <PostsList page="kids" />
      {/* Under konferensdagarna är det viktigaste vad barnen gör just nu, så aktiviteterna kommer först. */}
      {fritidsFirst ? [fritids, activities] : [activities, fritids]}

      {/* FormModal: Esc ska inte tömma ett halvifyllt formulär */}
      <FormModal open={open} onClose={() => setOpen(false)} title={t.register}>
        <RegistrationForm onDone={(r) => setMine([r, ...mine])} onClose={() => setOpen(false)} />
      </FormModal>
    </>
  )
}

type A11y = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true }

/** Fält i GOV.UK-stil: etikett, ledtråd under etiketten, felet tydligt ovanför fältet. */
function FormField({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: (a: A11y) => ReactNode }) {
  const { t } = useI18n()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-error` : undefined
  return (
    <div className={cx(error && 'border-s-4 border-rose-700 ps-3')}>
      <label htmlFor={id} className="block text-base font-medium text-ink">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mt-0.5 text-base text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="mt-1 text-base font-medium text-rose-800">
          <span className="sr-only">{t.errorPrefix} </span>
          {error}
        </p>
      )}
      <div className="mt-1.5">{children({ id, 'aria-describedby': [hintId, errId].filter(Boolean).join(' ') || undefined, 'aria-invalid': error ? true : undefined })}</div>
    </div>
  )
}

const invalidCls = (on: boolean) => (on ? 'border-2 border-rose-700' : undefined)

/** Flyttar fokus till fältet (eller första kryssrutan i en grupp). Inga #ankare: adressens # styr sidbytet. */
function focusField(id: string) {
  const el = document.getElementById(id)
  const target = el && (el.matches('input, textarea, select') ? el : el.querySelector<HTMLElement>('input, textarea, select'))
  target?.focus()
}

function RegistrationForm({ onDone, onClose }: { onDone: (r: SavedReg) => void; onClose: () => void }) {
  const { t, lang } = useI18n()
  const { days, today } = useConference()
  const uid = useId()
  const ids = {
    name: `${uid}-name`,
    phone: `${uid}-phone`,
    email: `${uid}-email`,
    days: `${uid}-days`,
    child: (i: number) => `${uid}-child-${i}`,
    age: (i: number) => `${uid}-age-${i}`,
  }
  const [guardian_name, setName] = useState('')
  const [guardian_phone, setPhone] = useState('')
  const [guardian_email, setEmail] = useState('')
  const [children, setChildren] = useState<Child[]>([{ name: '', age: null, allergies: '' }])
  // Dagar som redan varit går inte att välja.
  const openDays = days.filter((d) => d.date >= today)
  // Härlett standardval: alla kommande dagar, även om dagarna laddas in efter att formuläret öppnats.
  const [sel, setPicked] = useState<string[] | null>(null)
  const picked = (sel ?? openDays.map((d) => d.date)).filter((x) => openDays.some((d) => d.date === x))
  const [pickup_names, setPickup] = useState('')
  const [notes, setNotes] = useState('')
  const [photo_consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [number, setNumber] = useState<number | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)

  const clearError = (id: string) =>
    setErrors((e) => {
      if (!(id in e)) return e
      const rest = { ...e }
      delete rest[id]
      return rest
    })

  const setChild = (i: number, patch: Partial<Child>) => setChildren(children.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    if (!guardian_name.trim()) e[ids.name] = t.errGuardianName
    const digits = guardian_phone.replace(/\D/g, '')
    if (!guardian_phone.trim()) e[ids.phone] = t.errPhone
    else if (digits.length < 6) e[ids.phone] = t.errPhoneShort
    if (guardian_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardian_email.trim())) e[ids.email] = t.errEmail
    const anyNamed = children.some((c) => c.name.trim())
    children.forEach((c, i) => {
      // Tomma extra rader hoppas över, men minst ett barn och varje rad med ålder eller allergier behöver ett namn.
      if (!c.name.trim() && ((!anyNamed && i === 0) || c.age != null || c.allergies.trim())) e[ids.child(i)] = t.errChildName
      if (c.age != null && (c.age < 0 || c.age > 17)) e[ids.age(i)] = t.errAge
    })
    if (!picked.length) e[ids.days] = t.errDays
    return e
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) {
      // Fokus till felsammanfattningen när den har ritats, så att den syns och läses upp.
      requestAnimationFrame(() => summaryRef.current?.focus())
      return
    }
    const kids = children.filter((c) => c.name.trim())
    setBusy(true)
    setErr(null)
    try {
      const n = await api.rpc<number>('register_kids', {
        payload: {
          guardian_name: guardian_name.trim(),
          guardian_phone: guardian_phone.trim(),
          guardian_email: guardian_email.trim() || null,
          children: kids.map((c) => ({ name: c.name.trim(), age: c.age, allergies: c.allergies.trim() })),
          days: picked,
          pickup_names: pickup_names.trim() || null,
          notes: notes.trim() || null,
          photo_consent,
          lang,
        },
      })
      setNumber(n)
      onDone({ number: n, guardian: guardian_name.trim(), children: kids.map((c) => c.name.trim()), days: picked })
    } catch (e) {
      setErr(errorText(e, t))
    } finally {
      setBusy(false)
    }
  }

  // Kvitto: numret visas stort, som en GOV.UK-bekräftelse.
  if (number != null)
    return (
      <div className="py-2 text-center">
        <div className="rounded-lg bg-ink px-6 py-6 text-white">
          <CheckCircle2 className="mx-auto size-9" strokeWidth={1.75} aria-hidden />
          <p className="mt-2 text-xl font-semibold">{t.regDone}</p>
          <p className="mt-3 text-base text-white/90">{t.yourNumber}</p>
          <p className="text-6xl font-semibold tabular-nums" dir="ltr">
            #{number}
          </p>
        </div>
        <p className="mt-4 text-base">{t.regDoneInfo}</p>
        <Button className="mt-6 w-full sm:w-auto" onClick={onClose}>
          {t.close}
        </Button>
      </div>
    )

  const errorList = Object.entries(errors)

  return (
    <form onSubmit={submit} noValidate className="space-y-7">

      {errorList.length > 0 && (
        <div ref={summaryRef} tabIndex={-1} role="alert" aria-labelledby={`${uid}-summary`} className="rounded-md border-2 border-rose-700 p-4 focus:outline-none">
          <h3 id={`${uid}-summary`} className="text-lg font-semibold text-ink">
            {t.errorSummary}
          </h3>
          <ul className="mt-1">
            {errorList.map(([id, msg]) => (
              <li key={id}>
                <button type="button" onClick={() => focusField(id)} className="min-h-11 py-2 text-start text-base font-medium text-rose-800 underline underline-offset-2">
                  {msg}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <fieldset className="space-y-5">
        <legend className="mb-3 text-lg font-semibold text-ink">{t.guardian}</legend>
        <FormField id={ids.name} label={t.guardianName} error={errors[ids.name]}>
          {(a) => (
            <Input
              {...a}
              autoComplete="name"
              value={guardian_name}
              className={invalidCls(!!errors[ids.name])}
              onChange={(e) => {
                setName(e.target.value)
                clearError(ids.name)
              }}
            />
          )}
        </FormField>
        <FormField id={ids.phone} label={t.phone} hint={t.phoneHint} error={errors[ids.phone]}>
          {(a) => (
            <Input
              {...a}
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              dir="ltr"
              value={guardian_phone}
              className={cx('sm:max-w-xs', invalidCls(!!errors[ids.phone]))}
              onChange={(e) => {
                setPhone(e.target.value)
                clearError(ids.phone)
              }}
            />
          )}
        </FormField>
        <FormField id={ids.email} label={t.email} error={errors[ids.email]}>
          {(a) => (
            <Input
              {...a}
              type="email"
              autoComplete="email"
              inputMode="email"
              dir="ltr"
              spellCheck={false}
              value={guardian_email}
              className={invalidCls(!!errors[ids.email])}
              onChange={(e) => {
                setEmail(e.target.value)
                clearError(ids.email)
              }}
            />
          )}
        </FormField>
      </fieldset>

      <div className="space-y-6 border-t border-line pt-6">
        {children.map((c, i) => (
          <fieldset key={i} className="space-y-5">
            <legend className="mb-3 text-lg font-semibold text-ink">{children.length > 1 ? t.childN(i + 1) : t.children}</legend>
            <FormField id={ids.child(i)} label={t.childName} error={errors[ids.child(i)]}>
              {(a) => (
                <Input
                  {...a}
                  value={c.name}
                  className={invalidCls(!!errors[ids.child(i)])}
                  onChange={(e) => {
                    setChild(i, { name: e.target.value })
                    clearError(ids.child(i))
                  }}
                />
              )}
            </FormField>
            <FormField id={ids.age(i)} label={t.age} error={errors[ids.age(i)]}>
              {(a) => (
                <Input
                  {...a}
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  dir="ltr"
                  value={c.age ?? ''}
                  className={cx('max-w-24', invalidCls(!!errors[ids.age(i)]))}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 2)
                    setChild(i, { age: v ? Number(v) : null })
                    clearError(ids.age(i))
                  }}
                />
              )}
            </FormField>
            <FormField id={`${uid}-allergies-${i}`} label={t.allergies} hint={t.allergiesHint}>
              {(a) => <Input {...a} value={c.allergies} onChange={(e) => setChild(i, { allergies: e.target.value })} />}
            </FormField>
            {children.length > 1 && (
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-1.5 text-base text-rose-800 underline-offset-2 hover:underline"
                onClick={() => {
                  setChildren(children.filter((_, j) => j !== i))
                  // Raderna byter index, så gamla fel för barnen gäller inte längre.
                  setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(`${uid}-child-`) && !k.startsWith(`${uid}-age-`))))
                }}
              >
                <Trash2 className="size-4" aria-hidden /> {t.remove}
              </button>
            )}
          </fieldset>
        ))}
        <Button type="button" variant="secondary" onClick={() => setChildren([...children, { name: '', age: null, allergies: '' }])}>
          <Plus className="size-4" aria-hidden /> {t.addChild}
        </Button>
      </div>

      {openDays.length > 0 && (
        <div className="border-t border-line pt-6">
          {/* Felmarkeringen ligger på en egen div: en fieldsets kantlinje ritas i höjd med legendens mitt. */}
          <div className={cx(errors[ids.days] && 'border-s-4 border-s-rose-700 ps-3')}>
            <fieldset
              id={ids.days}
              className="min-w-0"
              aria-describedby={cx(`${ids.days}-hint`, errors[ids.days] && `${ids.days}-error`)}
            >
              <legend className="text-lg font-semibold text-ink">{t.whichDays}</legend>
              <p id={`${ids.days}-hint`} className="mt-0.5 text-base text-muted">
                {t.daysHint}
              </p>
              {errors[ids.days] && (
                <p id={`${ids.days}-error`} className="mt-1 text-base font-medium text-rose-800">
                  <span className="sr-only">{t.errorPrefix} </span>
                  {errors[ids.days]}
                </p>
              )}
              <div className="mt-2 flex flex-col">
                {openDays.map((d) => (
                  <Checkbox
                    key={d.id}
                    label={
                      <span className="inline-block first-letter:uppercase">
                        {formatShortDay(d.date, lang)}
                        {tr(d.label, lang) && (
                          <span className="text-muted">
                            {' '}
                            · <Tr value={d.label} />
                          </span>
                        )}
                      </span>
                    }
                    checked={picked.includes(d.date)}
                    onChange={(on) => {
                      setPicked(on ? [...picked, d.date].sort() : picked.filter((x) => x !== d.date))
                      clearError(ids.days)
                    }}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      )}
      {openDays.length === 0 && errors[ids.days] && <ErrorText>{errors[ids.days]}</ErrorText>}

      <div className="space-y-5 border-t border-line pt-6">
        <FormField id={`${uid}-pickup`} label={t.pickup}>
          {(a) => <Input {...a} value={pickup_names} onChange={(e) => setPickup(e.target.value)} />}
        </FormField>
        <FormField id={`${uid}-notes`} label={t.notes}>
          {(a) => <Textarea {...a} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </FormField>
        <Checkbox label={t.photoConsent} checked={photo_consent} onChange={setConsent} />
      </div>

      <ErrorText>{err}</ErrorText>
      <Button type="submit" variant="accent" size="lg" className="w-full" loading={busy}>
        {t.submitReg}
      </Button>
    </form>
  )
}
