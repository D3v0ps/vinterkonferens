import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, Copy, Pencil, Timer, Trash2 } from 'lucide-react'
import { confirmDialog, notify } from '../../components/dialogs'
import { Badge, Button, Checkbox, Empty, ErrorText, Field, Input, LocalizedInput, Modal, PageHeader, Select, Spinner, Tabs } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useConference } from '../../lib/conference'
import { tr } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { addMinutes, localDate, localTime, weekdayShort, zonedToUtc } from '../../lib/time'
import type { Audience, ConferenceDay, Lang, Localized, Session, SessionKind } from '../../lib/types'

const KIND_LABEL: Record<SessionKind, string> = {
  lecture: 'Föreläsning',
  preshow: 'Förprogram',
  activity: 'Aktivitet',
  break: 'Paus / fika',
  meal: 'Måltid',
  other: 'Övrigt',
}
const AUDIENCE_LABEL: Record<Audience, string> = { adults: 'Vuxna & ungdomar', kids: 'Barn', all: 'Alla' }
const LANG_LABEL: Record<Lang, string> = { sv: 'på svenska', en: 'på engelska', ar: 'på arabiska' }

// ---------------------------------------------------------------- Exempelprogram
// Ett litet program per konferensdag så att ägaren kan se överstrykning, "Nästa" och betyg
// fungera innan det riktiga programmet finns. Allt börjar med "Exempel:" och tas bort med en knapp.

const EXAMPLE_PREFIX = 'Exempel:'
const isExample = (s: Session) => (s.title?.sv ?? '').trim().startsWith(EXAMPLE_PREFIX)

interface ExampleItem {
  start: string
  end: string
  kind: SessionKind
  audience: Audience
  room: string
  title: Localized
  speaker?: string
  capacity?: number
}

const POETRY: Localized = { sv: 'Exempel: Förprogram – poesi', en: 'Example: Pre-show – poetry', ar: 'مثال: برنامج تمهيدي – شعر' }

const EXAMPLE_DAY: ExampleItem[] = [
  { start: '09:45', end: '10:00', kind: 'preshow', audience: 'adults', room: 'Stora salen', capacity: 400, title: POETRY },
  {
    start: '10:00',
    end: '11:00',
    kind: 'lecture',
    audience: 'adults',
    room: 'Stora salen',
    capacity: 400,
    speaker: 'Exempeltalare',
    title: { sv: 'Exempel: Föreläsning om gemenskap', en: 'Example: Lecture on community', ar: 'مثال: محاضرة عن المجتمع' },
  },
  { start: '10:00', end: '11:30', kind: 'activity', audience: 'kids', room: 'Fritids', title: { sv: 'Exempel: Pyssel och lek', en: 'Example: Crafts and games', ar: 'مثال: أشغال يدوية وألعاب' } },
  { start: '12:00', end: '13:00', kind: 'meal', audience: 'all', room: 'Matsalen', title: { sv: 'Exempel: Lunch', en: 'Example: Lunch', ar: 'مثال: غداء' } },
  { start: '13:15', end: '13:30', kind: 'preshow', audience: 'adults', room: 'Stora salen', capacity: 400, title: POETRY },
  {
    start: '13:30',
    end: '14:30',
    kind: 'lecture',
    audience: 'adults',
    room: 'Stora salen',
    capacity: 400,
    speaker: 'Exempeltalare',
    title: { sv: 'Exempel: Föreläsning om hopp', en: 'Example: Lecture on hope', ar: 'مثال: محاضرة عن الأمل' },
  },
  { start: '13:30', end: '15:00', kind: 'activity', audience: 'kids', room: 'Fritids', title: { sv: 'Exempel: Utelek i snön', en: 'Example: Outdoor play in the snow', ar: 'مثال: لعب في الثلج' } },
]

const EXAMPLE_NOTE: Localized = {
  sv: 'Exempelpunkt för att prova programmet. Ändra eller ta bort den.',
  en: 'Example item for trying out the programme. Edit or delete it.',
  ar: 'عنصر تجريبي لتجربة البرنامج. عدّله أو احذفه.',
}

function exampleRows(days: ConferenceDay[]): Partial<Session>[] {
  return days.flatMap((d) =>
    EXAMPLE_DAY.map((x) => ({
      starts_at: zonedToUtc(d.date, x.start).toISOString(),
      ends_at: zonedToUtc(d.date, x.end).toISOString(),
      kind: x.kind,
      audience: x.audience,
      title: x.title,
      description: EXAMPLE_NOTE,
      speaker: x.speaker ?? null,
      room: x.room,
      language: x.kind === 'lecture' || x.kind === 'preshow' ? d.default_lang : null,
      capacity: x.capacity ?? null,
      published: true,
      feedback_enabled: x.kind === 'lecture',
    })),
  )
}

// ---------------------------------------------------------------- Formulär

interface Form {
  id?: string
  /** Titel på programpunkten som kopieras (visas som påminnelse i formuläret). */
  copyOf?: string
  date: string
  start: string
  end: string
  kind: SessionKind
  audience: Audience
  title: Localized
  description: Localized
  speaker: string
  room: string
  language: Lang | ''
  capacity: string
  published: boolean
  feedback_enabled: boolean
}

function toForm(s: Session): Form {
  return {
    id: s.id,
    date: localDate(s.starts_at),
    start: localTime(s.starts_at),
    end: localTime(s.ends_at),
    kind: s.kind,
    audience: s.audience,
    title: s.title ?? {},
    description: s.description ?? {},
    speaker: s.speaker ?? '',
    room: s.room ?? '',
    language: s.language ?? '',
    capacity: s.capacity != null ? String(s.capacity) : '',
    published: s.published,
    feedback_enabled: s.feedback_enabled,
  }
}

function fromForm(f: Form): Partial<Session> {
  return {
    starts_at: zonedToUtc(f.date, f.start).toISOString(),
    ends_at: zonedToUtc(f.date, f.end).toISOString(),
    kind: f.kind,
    audience: f.audience,
    title: f.title,
    description: f.description,
    speaker: f.speaker.trim() || null,
    room: f.room.trim() || null,
    language: f.language || null,
    capacity: f.capacity ? Number(f.capacity) : null,
    published: f.published,
    feedback_enabled: f.feedback_enabled,
  }
}

export default function ProgramAdmin() {
  const auth = useAuth()
  const canEdit = auth.isAdmin || auth.isLeadOf('forelasningar') || auth.isLeadOf('konferencierer') || auth.isLeadOf('fritids')
  const { days, currentDay } = useConference()
  const { data: sessions, loading } = useList('sessions', { order: [{ col: 'starts_at' }] })
  const [day, setDay] = useState<string>('')
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [exBusy, setExBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!day && currentDay) setDay(currentDay.date)
  }, [day, currentDay])

  const list = useMemo(() => sessions.filter((s) => localDate(s.starts_at) === day), [sessions, day])
  const rooms = useMemo(() => [...new Set(sessions.map((s) => s.room).filter(Boolean))] as string[], [sessions])
  const examples = useMemo(() => sessions.filter(isExample), [sessions])
  const offerExample = auth.isAdmin && !loading && sessions.length === 0

  function blank(): Form {
    const last = list[list.length - 1]
    const start = last ? localTime(last.ends_at) : '10:00'
    return {
      date: day || days[0]?.date || localDate(new Date()),
      start,
      end: localTime(addMinutes(zonedToUtc(day || days[0]?.date || localDate(new Date()), start), 60)),
      kind: 'lecture',
      audience: 'adults',
      title: {},
      description: {},
      speaker: '',
      room: last?.room ?? 'Stora salen',
      language: days.find((d) => d.date === day)?.default_lang ?? 'sv',
      capacity: last?.capacity != null ? String(last.capacity) : '',
      published: true,
      feedback_enabled: true,
    }
  }

  async function save() {
    if (!form) return
    if (!form.title.sv?.trim()) return setErr('Skriv en titel på svenska.')
    if (form.end <= form.start) return setErr('Sluttiden måste vara efter starttiden.')
    if (form.capacity && !(Number(form.capacity) >= 0)) return setErr('Antal platser måste vara ett tal, t.ex. 400.')
    setBusy(true)
    setErr(null)
    try {
      if (form.id) await api.update('sessions', form.id, fromForm(form))
      else await api.insert('sessions', fromForm(form))
      setDay(form.date)
      setForm(null)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!form?.id) return
    const ok = await confirmDialog({
      title: `Ta bort "${form.title.sv?.trim() || 'programpunkten'}"?`,
      message: 'Programpunkten försvinner från besökarsidan. Det går inte att ångra.',
      confirmLabel: 'Ta bort',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    setErr(null)
    try {
      await api.remove('sessions', form.id)
      setForm(null)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function duplicate() {
    if (!form) return
    setErr(null)
    setForm({ ...form, id: undefined, copyOf: form.title.sv?.trim() || 'programpunkten' })
  }

  async function postpone(s: Session) {
    const affected = sessions.filter(
      (x) => localDate(x.starts_at) === localDate(s.starts_at) && (x.room ?? '') === (s.room ?? '') && x.starts_at >= s.starts_at,
    )
    const ok = await confirmDialog({
      title: 'Skjuta upp 5 minuter?',
      message: `${affected.length === 1 ? 'Den här programpunkten' : `${affected.length} programpunkter`} i ${s.room || 'samma sal'} från kl ${localTime(s.starts_at)} flyttas 5 minuter senare.`,
      confirmLabel: 'Skjut upp',
    })
    if (!ok) return
    try {
      for (const x of affected) {
        await api.update('sessions', x.id, {
          starts_at: addMinutes(x.starts_at, 5).toISOString(),
          ends_at: addMinutes(x.ends_at, 5).toISOString(),
        })
      }
      notify(affected.length === 1 ? 'Flyttad 5 minuter' : `${affected.length} programpunkter flyttade 5 minuter`)
    } catch (e) {
      notify((e as Error).message, 'error')
    }
  }

  async function addExamples() {
    const ok = await confirmDialog({
      title: 'Lägga in exempelprogram?',
      message: `Varje konferensdag (${days.length} st) får ett förprogram med poesi före varje föreläsning, två föreläsningar, lunch och två barnaktiviteter. Allt syns på besökarsidan med "Exempel:" först i titeln och tas bort med en knapp här.`,
      confirmLabel: 'Lägg in',
    })
    if (!ok) return
    setExBusy(true)
    try {
      await api.insertMany('sessions', exampleRows(days))
      notify('Exempelprogrammet är inlagt')
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setExBusy(false)
    }
  }

  async function removeExamples() {
    const ok = await confirmDialog({
      title: `Ta bort ${examples.length} exempelpunkter?`,
      message: 'Bara programpunkter vars titel börjar med "Exempel:" tas bort. Annat i programmet lämnas kvar.',
      confirmLabel: 'Ta bort exemplen',
      danger: true,
    })
    if (!ok) return
    setExBusy(true)
    try {
      for (const s of examples) await api.remove('sessions', s.id)
      notify('Exempelprogrammet är borttaget')
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setExBusy(false)
    }
  }

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f))

  return (
    <div>
      <PageHeader
        title="Program"
        subtitle="Föreläsningar och aktiviteter som visas på besökarsidan."
        actions={
          canEdit && (
            <Button onClick={() => { setErr(null); setForm(blank()) }}>
              <CalendarPlus className="size-4" aria-hidden /> Ny programpunkt
            </Button>
          )
        }
      />

      {!canEdit && (
        <p className="mb-4 max-w-[65ch] text-base text-muted">
          Du kan se programmet. Ändringar görs av styrgruppen eller ansvariga för Föreläsningar, Konferencierer och Fritids.
        </p>
      )}

      <p className="mb-6 max-w-[65ch] text-base text-muted">
        <span className="font-medium text-ink">Tips:</span> lägg ett kort förprogram, t.ex. poesi eller musik, 15 minuter före första
        föreläsningen. Då är publiken på plats när föreläsningen börjar. Effekten syns under Statistik, i räkningen 5 minuter efter start.
      </p>

      {canEdit && examples.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-ice px-4 py-3">
          <p className="text-base text-ink">Exempelprogrammet ligger inne och syns på besökarsidan.</p>
          <Button variant="ghost" className="text-rose-700" loading={exBusy} onClick={removeExamples}>
            <Trash2 className="size-4" aria-hidden /> Ta bort exemplen
          </Button>
        </div>
      )}

      {days.length > 0 && (
        <Tabs
          className="mb-4"
          value={day}
          onChange={setDay}
          options={days.map((d) => ({ value: d.date, label: `${weekdayShort(d.date)} ${d.date.slice(5)}` }))}
        />
      )}

      {loading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <div className="space-y-8">
          <Empty>Inga programpunkter den här dagen.</Empty>
          {offerExample && (
            <section className="max-w-[65ch]">
              <h2 className="text-lg font-semibold text-ink">Vill du se hur det fungerar först?</h2>
              <p className="mt-1 text-base text-muted">
                Ett litet exempelprogram för varje dag visar hur avklarade punkter stryks över, vad som är nästa och hur besökarna betygsätter
                föreläsningar.
              </p>
              {days.length > 0 ? (
                <Button variant="secondary" className="mt-3" loading={exBusy} onClick={addExamples}>
                  Lägg in exempelprogram
                </Button>
              ) : (
                <p className="mt-3 text-base text-ink">
                  Lägg först in konferensdagarna under{' '}
                  <Link to="/intern/installningar" className="font-medium underline underline-offset-4 hover:text-ink-soft">
                    Inställningar
                  </Link>
                  .
                </p>
              )}
            </section>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {list.map((s) => {
            const title = tr(s.title, 'sv') || '(utan titel)'
            const meta = [KIND_LABEL[s.kind], s.audience !== 'adults' && AUDIENCE_LABEL[s.audience], s.speaker, s.room, s.language && LANG_LABEL[s.language]].filter(Boolean)
            const missing = [!s.title.en?.trim() && 'engelska', !s.title.ar?.trim() && 'arabiska'].filter(Boolean)
            return (
              <li key={s.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-4 sm:flex-nowrap sm:items-center">
                <div className="w-28 shrink-0 font-semibold tabular-nums text-ink">
                  {localTime(s.starts_at)}–{localTime(s.ends_at)}
                </div>
                <div className="min-w-0 flex-1 basis-52">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-base font-medium text-ink">{title}</span>
                    {!s.published && <Badge tone="amber">Dold</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{meta.join(' · ')}</p>
                  {missing.length > 0 && <p className="text-sm text-amber-800">Titeln saknas på {missing.join(' och ')}.</p>}
                </div>
                {canEdit && (
                  <div className="ms-auto flex shrink-0 gap-1">
                    <Button variant="secondary" onClick={() => postpone(s)} title="Skjut upp denna och efterföljande i samma sal">
                      <Timer className="size-4" aria-hidden /> +5 min
                    </Button>
                    <Button variant="ghost" onClick={() => { setErr(null); setForm(toForm(s)) }} aria-label={`Redigera ${title}`}>
                      <Pencil className="size-4" aria-hidden />
                      <span className="hidden sm:inline">Redigera</span>
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Redigera programpunkt' : form?.copyOf ? 'Kopia av programpunkt' : 'Ny programpunkt'}
        wide
      >
        {form && (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            {form.copyOf && !form.id && (
              <p className="rounded-xl bg-ice px-4 py-3 text-base text-ink">
                Kopia av "{form.copyOf}". Ändra dag eller tid och spara för att lägga in den.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Dag" required>
                <Select value={form.date} onChange={(e) => set({ date: e.target.value })}>
                  {days.map((d) => (
                    <option key={d.id} value={d.date}>
                      {weekdayShort(d.date)} {d.date}
                    </option>
                  ))}
                  {!days.some((d) => d.date === form.date) && <option value={form.date}>{form.date}</option>}
                </Select>
              </Field>
              <Field label="Start" required>
                <Input type="time" required value={form.start} onChange={(e) => set({ start: e.target.value })} />
              </Field>
              <Field label="Slut" required>
                <Input type="time" required value={form.end} onChange={(e) => set({ end: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Typ">
                <Select
                  value={form.kind}
                  onChange={(e) => {
                    const kind = e.target.value as SessionKind
                    set({ kind, feedback_enabled: kind === 'lecture' })
                  }}
                >
                  {Object.entries(KIND_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Visas för">
                <Select value={form.audience} onChange={(e) => set({ audience: e.target.value as Audience })}>
                  {Object.entries(AUDIENCE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <LocalizedInput label="Titel" required value={form.title} onChange={(title) => set({ title })} />
            <LocalizedInput label="Beskrivning" multiline value={form.description} onChange={(description) => set({ description })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Talare">
                <Input value={form.speaker} onChange={(e) => set({ speaker: e.target.value })} />
              </Field>
              <Field label="Sal eller plats">
                <Input list="vk-rooms" value={form.room} onChange={(e) => set({ room: e.target.value })} />
                <datalist id="vk-rooms">
                  {rooms.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </Field>
              <Field label="Språk">
                <Select value={form.language} onChange={(e) => set({ language: e.target.value as Lang | '' })}>
                  <option value="">–</option>
                  <option value="sv">Svenska</option>
                  <option value="ar">Arabiska</option>
                  <option value="en">Engelska</option>
                </Select>
              </Field>
              <Field label="Antal platser" hint="Används för att räkna hur full salen är.">
                <Input type="number" min={0} inputMode="numeric" value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-x-6">
              <Checkbox label="Publicerad på besökarsidan" checked={form.published} onChange={(published) => set({ published })} />
              <Checkbox label="Besökare kan betygsätta" checked={form.feedback_enabled} onChange={(feedback_enabled) => set({ feedback_enabled })} />
            </div>
            <ErrorText>{err}</ErrorText>
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {form.id && (
                <>
                  <Button type="button" variant="ghost" className="text-rose-700" disabled={busy} onClick={remove}>
                    <Trash2 className="size-4" aria-hidden /> Ta bort
                  </Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={duplicate}>
                    <Copy className="size-4" aria-hidden /> Duplicera
                  </Button>
                </>
              )}
              <div className="ms-auto flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                  Avbryt
                </Button>
                <Button type="submit" loading={busy}>
                  Spara
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
