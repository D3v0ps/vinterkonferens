import { useState } from 'react'
import { Baby, Plus, Ticket, Trash2 } from 'lucide-react'
import { Agenda, DayTabs, PostsList, useDaySessions, useSelectedDay } from '../../components/Agenda'
import { Button, Card, Checkbox, ErrorText, Field, Input, Modal, Spinner, Textarea } from '../../components/ui'
import { api } from '../../lib/api'
import { useConference } from '../../lib/conference'
import { tr } from '../../lib/format'
import { useLocalStorage } from '../../lib/hooks'
import { useI18n } from '../../lib/i18n'
import { weekdayShort } from '../../lib/time'
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
  const { settings } = useConference()
  const { days, date, setDate } = useSelectedDay()
  const { sessions, loading } = useDaySessions(date, [...AUD])
  const [open, setOpen] = useState(false)
  const [mine, setMine] = useLocalStorage<SavedReg[]>('vk-my-regs', [])

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t.kids}</h1>
      <p className="mb-4 text-sm text-slate-600">{t.kidsLead}</p>

      <Card className="mb-5 overflow-hidden">
        <div className="bg-emerald-700 p-4 text-white">
          <div className="flex items-center gap-2 text-lg font-bold">
            <Baby className="size-6" /> {t.fritids}
          </div>
          <p className="mt-1 text-sm text-white/90">{tr(settings.fritids_info, lang) || t.registerLead}</p>
          {tr(settings.fritids_price, lang) && <p className="mt-1 text-sm font-semibold">{tr(settings.fritids_price, lang)}</p>}
        </div>
        <div className="space-y-3 p-4">
          {mine.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{t.myRegistrations}</div>
              <div className="space-y-2">
                {mine.map((r) => (
                  <div key={r.number} className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3">
                    <div className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xl font-black tabular-nums text-white" dir="ltr">
                      #{r.number}
                    </div>
                    <div className="min-w-0 text-sm">
                      <div className="font-semibold text-slate-900">{r.children.join(', ')}</div>
                      <div className="text-slate-600">{r.days.map((d) => weekdayShort(d, lang)).join(', ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Button variant="accent" size="lg" className="w-full" onClick={() => setOpen(true)}>
            <Ticket className="size-5" /> {mine.length ? t.newRegistration : t.register}
          </Button>
        </div>
      </Card>

      <h2 className="mb-2 text-lg font-bold text-ink">{t.kidsActivities}</h2>
      <DayTabs days={days} value={date} onChange={setDate} />
      <PostsList page="kids" />
      {loading ? <Spinner /> : <Agenda sessions={sessions} showFeedback={false} />}

      <Modal open={open} onClose={() => setOpen(false)} title={t.register}>
        <RegistrationForm
          onDone={(r) => setMine([r, ...mine])}
          onClose={() => setOpen(false)}
        />
      </Modal>
    </>
  )
}

function RegistrationForm({ onDone, onClose }: { onDone: (r: SavedReg) => void; onClose: () => void }) {
  const { t, lang } = useI18n()
  const { days, today } = useConference()
  const [guardian_name, setName] = useState('')
  const [guardian_phone, setPhone] = useState('')
  const [guardian_email, setEmail] = useState('')
  const [children, setChildren] = useState<Child[]>([{ name: '', age: null, allergies: '' }])
  // Härlett standardval: kommande dagar, även om dagarna laddas in efter att formuläret öppnats.
  const [sel, setPicked] = useState<string[] | null>(null)
  const picked = sel ?? days.filter((d) => d.date >= today).map((d) => d.date)
  const [pickup_names, setPickup] = useState('')
  const [notes, setNotes] = useState('')
  const [photo_consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [number, setNumber] = useState<number | null>(null)

  const setChild = (i: number, patch: Partial<Child>) => setChildren(children.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const kids = children.filter((c) => c.name.trim())
    if (!guardian_name.trim() || !guardian_phone.trim() || !kids.length || !picked.length) return setErr(t.required)
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
    } catch {
      setErr(t.error)
    } finally {
      setBusy(false)
    }
  }

  if (number != null)
    return (
      <div className="py-4 text-center">
        <p className="font-semibold text-emerald-700">{t.regDone}</p>
        <div className="mt-3 text-sm text-slate-500">{t.yourNumber}</div>
        <div className="mx-auto mt-1 w-fit rounded-2xl bg-emerald-700 px-8 py-4 text-6xl font-black tabular-nums text-white" dir="ltr">
          #{number}
        </div>
        <p className="mt-4 text-sm text-slate-600">{t.regDoneInfo}</p>
        <Button className="mt-5" onClick={onClose}>
          {t.close}
        </Button>
      </div>
    )

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600">{t.registerLead}</p>
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-bold text-ink">{t.guardian}</legend>
        <Field label={t.guardianName} required>
          <Input autoComplete="name" value={guardian_name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t.phone} required>
          <Input type="tel" autoComplete="tel" inputMode="tel" dir="ltr" value={guardian_phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t.email}>
          <Input type="email" autoComplete="email" dir="ltr" value={guardian_email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-bold text-ink">{t.children}</legend>
        {children.map((c, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <Field label={t.childName} required>
                <Input value={c.name} onChange={(e) => setChild(i, { name: e.target.value })} />
              </Field>
              <Field label={t.age}>
                <Input type="number" min={0} max={17} inputMode="numeric" value={c.age ?? ''} onChange={(e) => setChild(i, { age: e.target.value ? Number(e.target.value) : null })} />
              </Field>
            </div>
            <Field label={t.allergies}>
              <Input value={c.allergies} onChange={(e) => setChild(i, { allergies: e.target.value })} />
            </Field>
            {children.length > 1 && (
              <button type="button" className="inline-flex items-center gap-1 text-sm text-rose-700" onClick={() => setChildren(children.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" /> {t.remove}
              </button>
            )}
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={() => setChildren([...children, { name: '', age: null, allergies: '' }])}>
          <Plus className="size-4" /> {t.addChild}
        </Button>
      </fieldset>

      {days.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold text-ink">{t.whichDays} *</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {days.map((d) => (
              <Checkbox
                key={d.id}
                label={<span className="inline-block first-letter:uppercase">{weekdayShort(d.date, lang)} – {tr(d.label, lang)}</span>}
                checked={picked.includes(d.date)}
                onChange={(on) => setPicked(on ? [...picked, d.date].sort() : picked.filter((x) => x !== d.date))}
              />
            ))}
          </div>
        </fieldset>
      )}

      <Field label={t.pickup}>
        <Input value={pickup_names} onChange={(e) => setPickup(e.target.value)} />
      </Field>
      <Field label={t.notes}>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Checkbox label={t.photoConsent} checked={photo_consent} onChange={setConsent} />
      <ErrorText>{err}</ErrorText>
      <Button type="submit" variant="accent" size="lg" className="w-full" loading={busy}>
        {t.submitReg}
      </Button>
    </form>
  )
}
