import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Copy, Lightbulb, Pencil, Timer, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Checkbox, Empty, ErrorText, Field, Input, LocalizedInput, Modal, PageHeader, Select, Spinner, Tabs } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useConference } from '../../lib/conference'
import { tr } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { addMinutes, localDate, localTime, weekdayShort, zonedToUtc } from '../../lib/time'
import type { Audience, Lang, Localized, Session, SessionKind } from '../../lib/types'

const KIND_LABEL: Record<SessionKind, string> = {
  lecture: 'Föreläsning',
  preshow: 'Förprogram',
  activity: 'Aktivitet',
  break: 'Paus / fika',
  meal: 'Måltid',
  other: 'Övrigt',
}
const AUDIENCE_LABEL: Record<Audience, string> = { adults: 'Vuxna & ungdomar', kids: 'Barn', all: 'Alla' }

interface Form {
  id?: string
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
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!day && currentDay) setDay(currentDay.date)
  }, [day, currentDay])

  const list = useMemo(() => sessions.filter((s) => localDate(s.starts_at) === day), [sessions, day])
  const rooms = useMemo(() => [...new Set(sessions.map((s) => s.room).filter(Boolean))] as string[], [sessions])

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
    if (!form.title.sv?.trim()) return setErr('Titel på svenska behövs.')
    if (form.end <= form.start) return setErr('Sluttiden måste vara efter starttiden.')
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

  async function remove(s: Session) {
    if (!confirm(`Ta bort "${tr(s.title, 'sv')}"?`)) return
    await api.remove('sessions', s.id)
  }

  async function postpone(s: Session) {
    const affected = sessions.filter(
      (x) => localDate(x.starts_at) === localDate(s.starts_at) && (x.room ?? '') === (s.room ?? '') && x.starts_at >= s.starts_at,
    )
    if (!confirm(`Skjut upp ${affected.length} programpunkt(er) i ${s.room || 'samma sal'} med 5 minuter?`)) return
    for (const x of affected) {
      await api.update('sessions', x.id, {
        starts_at: addMinutes(x.starts_at, 5).toISOString(),
        ends_at: addMinutes(x.ends_at, 5).toISOString(),
      })
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
              <CalendarPlus className="size-4" /> Ny programpunkt
            </Button>
          )
        }
      />

      {!canEdit && (
        <p className="mb-4 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
          Du kan se programmet. Ändringar görs av styrgruppen eller ansvariga för Föreläsningar, Konferencierer och Fritids.
        </p>
      )}

      <Card className="mb-4 flex gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <Lightbulb className="mt-0.5 size-5 shrink-0" />
        <p>
          <b>Tips – förprogram:</b> Lägg en kort programpunkt av typen <i>Förprogram</i> (t.ex. poesi eller musik) 15 minuter före första
          föreläsningen. Då kommer publiken in i salen i tid och föreläsningen kan starta med fullsatt sal. Följ upp effekten under
          Statistik → räkningarna 5 min efter start.
        </p>
      </Card>

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
        <Empty>Inga programpunkter den här dagen.</Empty>
      ) : (
        <div className="space-y-2">
          {list.map((s) => (
            <Card key={s.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="w-24 shrink-0 font-semibold tabular-nums text-ink">
                {localTime(s.starts_at)}–{localTime(s.ends_at)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900">{tr(s.title, 'sv') || '(utan titel)'}</div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500">
                  <Badge tone={s.kind === 'lecture' ? 'blue' : s.kind === 'preshow' ? 'violet' : 'slate'}>{KIND_LABEL[s.kind]}</Badge>
                  <Badge tone={s.audience === 'kids' ? 'green' : 'slate'}>{AUDIENCE_LABEL[s.audience]}</Badge>
                  {!s.published && <Badge tone="amber">Dold</Badge>}
                  {s.speaker && <span>{s.speaker}</span>}
                  {s.room && <span>· {s.room}</span>}
                  {s.language && <span>· {s.language.toUpperCase()}</span>}
                  {(!s.title.en || !s.title.ar) && <span className="text-amber-600">· saknar {[!s.title.en && 'EN', !s.title.ar && 'AR'].filter(Boolean).join('/')}</span>}
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => postpone(s)} title="Skjut upp denna och efterföljande i samma sal">
                    <Timer className="size-4" /> +5 min
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setErr(null); setForm(toForm(s)) }} aria-label="Redigera">
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setErr(null); setForm({ ...toForm(s), id: undefined }) }} aria-label="Duplicera">
                    <Copy className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(s)} aria-label="Ta bort">
                    <Trash2 className="size-4 text-rose-600" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Redigera programpunkt' : 'Ny programpunkt'} wide>
        {form && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <div className="grid gap-3 sm:grid-cols-3">
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
            <div className="grid gap-3 sm:grid-cols-2">
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Talare">
                <Input value={form.speaker} onChange={(e) => set({ speaker: e.target.value })} />
              </Field>
              <Field label="Sal / plats">
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
              <Field label="Antal platser" hint="Används för att räkna fyllnadsgrad.">
                <Input type="number" min={0} inputMode="numeric" value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-5">
              <Checkbox label="Publicerad på besökarsidan" checked={form.published} onChange={(published) => set({ published })} />
              <Checkbox label="Besökare kan betygsätta" checked={form.feedback_enabled} onChange={(feedback_enabled) => set({ feedback_enabled })} />
            </div>
            <ErrorText>{err}</ErrorText>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Avbryt
              </Button>
              <Button type="submit" loading={busy}>
                Spara
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
