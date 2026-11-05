import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, Camera, Copy, Image as ImageIcon, Pencil, Send, Timer, Trash2 } from 'lucide-react'
import { confirmDialog, notify } from '../../components/dialogs'
import { SchedulePosterDialog } from '../../components/SchedulePoster'
import { SpeakerAvatar, forgetFileUrl } from '../../components/SpeakerAvatar'
import { Badge, Button, Checkbox, Empty, ErrorText, Field, Input, LocalizedInput, Modal, PageHeader, Select, Spinner, Tabs } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useConference } from '../../lib/conference'
import { safeFileName, uuid } from '../../lib/db'
import { tr } from '../../lib/format'
import { useList, useNow } from '../../lib/hooks'
import { categoryLabel, isTalk, lectureNumbers } from '../../lib/sessions'
import { templateFor, templateRows } from '../../lib/template2025'
import { addMinutes, formatShortDay, localDate, localTime, sessionStatus, zonedToUtc } from '../../lib/time'
import type { Audience, Lang, Localized, Session, SessionKind } from '../../lib/types'

const KIND_LABEL: Record<SessionKind, string> = {
  lecture: 'Föreläsning',
  panel: 'Panel',
  preshow: 'Förprogram',
  prayer: 'Bön',
  activity: 'Aktivitet',
  break: 'Rast / fika',
  meal: 'Måltid',
  other: 'Övrigt',
}
const AUDIENCE_LABEL: Record<Audience, string> = { adults: 'Vuxna & ungdomar', kids: 'Barn', all: 'Alla' }
const LANG_LABEL: Record<Lang, string> = { sv: 'på svenska', en: 'på engelska', ar: 'på arabiska' }

// Schemats första kolumn med samma ord som besökarsidan (svenska), t.ex. "Föreläsning 2" eller "Rast".
const CATEGORY_SV: Record<string, string> = {
  kind_lecture: 'Föreläsning',
  kind_panel: 'Panel',
  kind_prayer: 'Bön',
  kind_break: 'Rast',
  kind_meal: 'Mat',
  kind_preshow: 'Förprogram',
  kind_activity: 'Aktivitet',
  kind_other: 'Program',
}

const norm = (name: string | null | undefined) => (name ?? '').trim().toLocaleLowerCase('sv')

/** "Fredag 26 december 2025" → "fredagens". */
const templateDayName = (name: string) => `${name.split(' ')[0].toLocaleLowerCase('sv')}ens`

/**
 * Beskär ett foto till en kvadrat och skalar ner till högst 600 px, som JPEG.
 * Stående bilder beskärs närmare överkanten, där ansiktet brukar vara.
 */
async function squarePhoto(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Bilden kunde inte läsas. Prova en JPG- eller PNG-bild.'))
      i.src = url
    })
    const w = img.naturalWidth
    const h = img.naturalHeight
    const side = Math.min(w, h)
    if (!side) throw new Error('Bilden kunde inte läsas. Prova en JPG- eller PNG-bild.')
    const size = Math.min(600, side)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Bilden kunde inte bearbetas i den här webbläsaren.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, (w - side) / 2, h > w ? (h - side) * 0.25 : 0, side, side, 0, 0, size, size)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bilden kunde inte sparas.'))), 'image/jpeg', 0.85),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
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
  label: Localized
  description: Localized
  speaker: string
  /** Sparat foto (filväg i lagringen). */
  speaker_photo: string | null
  /** Nytt foto som laddas upp när formuläret sparas. */
  photoBlob: Blob | null
  photoPreview: string | null
  /** Fotot som programpunkten hade när formuläret öppnades. */
  origPhoto: string | null
  /** Sätt samma foto på andra programpunkter med samma talare. */
  photoToAll: boolean
  room: string
  language: Lang | ''
  capacity: string
  published: boolean
  feedback_enabled: boolean
}

const NO_PHOTO = { speaker_photo: null, photoBlob: null, photoPreview: null, origPhoto: null, photoToAll: false }

function toForm(s: Session): Form {
  return {
    id: s.id,
    date: localDate(s.starts_at),
    start: localTime(s.starts_at),
    end: localTime(s.ends_at),
    kind: s.kind,
    audience: s.audience,
    title: s.title ?? {},
    label: s.label ?? {},
    description: s.description ?? {},
    speaker: s.speaker ?? '',
    ...NO_PHOTO,
    speaker_photo: s.speaker_photo ?? null,
    origPhoto: s.speaker_photo ?? null,
    room: s.room ?? '',
    language: s.language ?? '',
    capacity: s.capacity != null ? String(s.capacity) : '',
    published: s.published,
    feedback_enabled: s.feedback_enabled,
  }
}

const trimmed = (v: Localized): Localized =>
  Object.fromEntries(Object.entries(v).flatMap(([k, x]) => (x?.trim() ? [[k, x.trim()]] : []))) as Localized

/** Foton visas inte för paneler (flera medverkande) och kräver ett namn. */
const takesPhoto = (f: Pick<Form, 'kind' | 'speaker'>) => f.kind !== 'panel' && !!f.speaker.trim()

function fromForm(f: Form): Partial<Session> {
  return {
    starts_at: zonedToUtc(f.date, f.start).toISOString(),
    ends_at: zonedToUtc(f.date, f.end).toISOString(),
    kind: f.kind,
    audience: f.audience,
    title: f.title,
    label: trimmed(f.label),
    description: f.description,
    speaker: f.speaker.trim() || null,
    speaker_photo: takesPhoto(f) ? f.speaker_photo : null,
    room: f.room.trim() || null,
    language: f.language || null,
    capacity: f.capacity ? Number(f.capacity) : null,
    published: f.published,
    feedback_enabled: f.feedback_enabled,
  }
}

/** Fotot i formuläret: det nyss valda, annars det sparade, annars initialer. */
function PhotoPreview({ form }: { form: Form }) {
  if (form.photoPreview)
    return (
      <span className="inline-flex size-16 shrink-0 overflow-hidden rounded-full shadow-sm ring-2 ring-white" aria-hidden>
        <img src={form.photoPreview} alt="" className="size-full object-cover" />
      </span>
    )
  return <SpeakerAvatar name={form.speaker} photo={form.speaker_photo} className="size-16 text-lg" />
}

export default function ProgramAdmin() {
  const auth = useAuth()
  const canEdit = auth.isAdmin || auth.isLeadOf('forelasningar') || auth.isLeadOf('konferencierer') || auth.isLeadOf('fritids')
  const { days, currentDay } = useConference()
  const { data: sessions, loading } = useList('sessions', { order: [{ col: 'starts_at' }] })
  const [day, setDay] = useState<string>('')
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [poster, setPoster] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!day && currentDay) setDay(currentDay.date)
  }, [day, currentDay])

  // Förhandsvisningen av ett nytt foto släpps när formuläret stängs eller fotot byts.
  const preview = form?.photoPreview
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  const list = useMemo(() => sessions.filter((s) => localDate(s.starts_at) === day), [sessions, day])
  const numbers = useMemo(() => lectureNumbers(list), [list])
  const drafts = useMemo(() => list.filter((s) => !s.published), [list])
  const rooms = useMemo(() => [...new Set(sessions.map((s) => s.room).filter(Boolean))] as string[], [sessions])

  // "+5 min" bara där det går att använda: i varje sal den punkt som pågår, annars nästa – idag
  const t = useNow(30_000)
  const movable = useMemo(() => {
    const today = localDate(t)
    const byRoom = new Map<string, Session[]>()
    for (const s of sessions) {
      if (localDate(s.starts_at) !== today || sessionStatus(s, t) === 'done') continue
      const k = s.room ?? ''
      byRoom.set(k, [...(byRoom.get(k) ?? []), s])
    }
    const ids = new Set<string>()
    for (const list of byRoom.values()) {
      const ongoing = list.filter((s) => sessionStatus(s, t) === 'ongoing')
      for (const s of ongoing.length ? ongoing : list.slice(0, 1)) ids.add(s.id)
    }
    return ids
  }, [sessions, t])

  /** Andra programpunkter med samma talare (inte paneler). */
  const sameSpeaker = (f: Form) => (takesPhoto(f) ? sessions.filter((s) => s.id !== f.id && s.kind !== 'panel' && norm(s.speaker) === norm(f.speaker)) : [])
  const knownPhoto = form && takesPhoto(form) && !form.speaker_photo && !form.photoBlob ? sameSpeaker(form).find((s) => s.speaker_photo) : undefined
  const photoChanged = !!form && (!!form.photoBlob || form.speaker_photo !== form.origPhoto)
  const photoTargets = form && photoChanged && (form.photoBlob || form.speaker_photo) ? sameSpeaker(form).filter((s) => form.photoBlob || s.speaker_photo !== form.speaker_photo) : []

  /** Förval för en ny punkt på `date`: efter dagens sista punkt, i samma sal, på dagens språk. */
  function blank(date = day || days[0]?.date || localDate(new Date())): Form {
    const last = sessions.filter((s) => localDate(s.starts_at) === date).at(-1)
    const start = last ? localTime(last.ends_at) : '10:00'
    return {
      date,
      start,
      end: localTime(addMinutes(zonedToUtc(date, start), 60)),
      kind: 'lecture',
      audience: 'adults',
      title: {},
      label: {},
      description: {},
      speaker: '',
      ...NO_PHOTO,
      room: last?.room ?? 'Stora salen',
      language: days.find((d) => d.date === date)?.default_lang ?? 'sv',
      capacity: last?.capacity != null ? String(last.capacity) : '',
      published: true,
      feedback_enabled: true,
    }
  }

  /** Byt dag. I en ny punkt följer fält som ingen har ändrat med till den nya dagens förval. */
  function changeDate(date: string) {
    setForm((f) => {
      if (!f || f.id || f.copyOf) return f && { ...f, date }
      const was = blank(f.date)
      const next = blank(date)
      const patch: Partial<Form> = { date }
      if (f.start === was.start && f.end === was.end) Object.assign(patch, { start: next.start, end: next.end })
      if (f.room === was.room && f.capacity === was.capacity) Object.assign(patch, { room: next.room, capacity: next.capacity })
      if (f.language === was.language) patch.language = next.language
      return { ...f, ...patch }
    })
  }

  /** Tar bort foton som ingen programpunkt längre använder. */
  async function dropUnused(paths: (string | null | undefined)[], stillUsed: Set<string>) {
    for (const p of new Set(paths)) {
      if (!p || stillUsed.has(p)) continue
      forgetFileUrl('speakers', p)
      await api.removeFile('speakers', p).catch(() => undefined)
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setPhotoBusy(true)
    setErr(null)
    try {
      const blob = await squarePhoto(file)
      const url = URL.createObjectURL(blob)
      setForm((f) => (f ? { ...f, photoBlob: blob, photoPreview: url, photoToAll: true } : f))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setPhotoBusy(false)
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
      const f = { ...form }
      if (f.photoBlob && takesPhoto(f)) {
        f.speaker_photo = await api.upload('speakers', `${uuid()}-${safeFileName(`${f.speaker.trim().replace(/\./g, '')}.jpg`)}`, f.photoBlob)
      }
      const row = fromForm(f)
      const photo = row.speaker_photo ?? null
      let id = f.id
      if (f.id) await api.update('sessions', f.id, row)
      else id = (await api.insert('sessions', row)).id
      // Samma foto på talarens andra programpunkter
      const others = photo && f.photoToAll ? photoTargets : []
      for (const s of others) await api.update('sessions', s.id, { speaker_photo: photo })
      const changed = new Set([id, ...others.map((s) => s.id)])
      const used = new Set(sessions.flatMap((s) => (changed.has(s.id) ? [] : s.speaker_photo ? [s.speaker_photo] : [])))
      if (photo) used.add(photo)
      await dropUnused([f.origPhoto, ...others.map((s) => s.speaker_photo)], used)
      if (others.length) notify(`Fotot används nu i ${others.length + 1} programpunkter med ${f.speaker.trim()}`)
      setDay(f.date)
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
      const used = new Set(sessions.flatMap((s) => (s.id !== form.id && s.speaker_photo ? [s.speaker_photo] : [])))
      await dropUnused([form.origPhoto], used)
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
    // Kopian delar foto med originalet; inget gammalt foto att städa bort när den sparas.
    setForm({ ...form, id: undefined, origPhoto: null, photoToAll: false, copyOf: form.title.sv?.trim() || 'programpunkten' })
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

  /** Förra årets schema som utkast, på alla dagar eller bara på `only`. */
  async function addTemplate(only?: string) {
    const targets = days.map((d, i) => ({ d, tpl: templateFor(d, i) })).filter(({ d }) => !only || d.date === only)
    const rows = templateRows(days).filter((r) => !only || localDate(r.starts_at!) === only)
    if (!rows.length) return
    const which = targets.map(({ d, tpl }) => `${formatShortDay(d.date)} får ${templateDayName(tpl.name)} schema`).join(', ')
    const ok = await confirmDialog({
      title: only ? `Fylla ${formatShortDay(only)} med förra årets schema?` : 'Använda förra årets schema som mall?',
      message: `Programmet från december 2025 läggs in efter veckodag: ${which}. Det blir ${rows.length} programpunkter med böner, föreläsningar, raster och panel. Allt läggs in som utkast och syns inte för besökarna förrän du publicerar. Titlar och talare är förra årets, så ändra dem punkt för punkt.`,
      confirmLabel: 'Lägg in utkast',
    })
    if (!ok) return
    setBulkBusy(true)
    try {
      await api.insertMany('sessions', rows)
      if (!only && targets[0]) setDay((d) => d || targets[0].d.date)
      notify(`${rows.length} programpunkter är inlagda som utkast`)
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  async function publishDrafts() {
    const n = drafts.length
    const ok = await confirmDialog({
      title: `Publicera ${n} programpunkter?`,
      message: `De syns direkt i programmet för ${formatShortDay(day)} på besökarsidan.`,
      confirmLabel: 'Publicera',
    })
    if (!ok) return
    setBulkBusy(true)
    try {
      for (const s of drafts) await api.update('sessions', s.id, { published: true })
      notify(n === 1 ? 'Programpunkten är publicerad' : `${n} programpunkter är publicerade`)
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setBulkBusy(false)
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

      {days.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Tabs value={day} onChange={setDay} options={days.map((d) => ({ value: d.date, label: formatShortDay(d.date) }))} />
          {day && (
            <Button variant="secondary" className="ms-auto" onClick={() => setPoster(true)}>
              <ImageIcon className="size-4" aria-hidden /> Schemabild
            </Button>
          )}
        </div>
      )}

      {canEdit && drafts.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md bg-ice px-4 py-3">
          <p className="text-base text-ink">
            {drafts.length === 1 ? '1 programpunkt är utkast' : `${drafts.length} programpunkter är utkast`} och syns inte för besökarna.
          </p>
          <Button variant="secondary" loading={bulkBusy} onClick={publishDrafts}>
            <Send className="size-4" aria-hidden /> {drafts.length === 1 ? 'Publicera' : `Publicera alla ${drafts.length}`}
          </Button>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <div className="space-y-8">
          <Empty>Inga programpunkter den här dagen.</Empty>
          {canEdit &&
            (days.length === 0 ? (
              <p className="max-w-[65ch] text-base text-ink">
                Lägg först in konferensdagarna under{' '}
                <Link to="/intern/installningar" className="font-medium underline underline-offset-4 hover:text-ink-soft">
                  Inställningar
                </Link>
                .
              </p>
            ) : sessions.length === 0 ? (
              <section className="max-w-[65ch]">
                <h2 className="text-lg font-semibold text-ink">Börja från förra årets schema</h2>
                <p className="mt-1 text-base text-muted">
                  Upplägget brukar vara detsamma varje år: Jumuah och böner, föreläsningar med rast emellan och en panel som avslutar dagen.
                  Förra årets program läggs in som utkast på varje konferensdag, och du byter titlar och talare innan du publicerar.
                </p>
                <Button variant="secondary" className="mt-3" loading={bulkBusy} onClick={() => addTemplate()}>
                  Använd förra årets schema som mall
                </Button>
              </section>
            ) : (
              <section className="max-w-[65ch]">
                <p className="text-base text-muted">Förra årets program för samma veckodag kan läggas in som utkast och ändras punkt för punkt.</p>
                <Button variant="secondary" className="mt-3" loading={bulkBusy} onClick={() => addTemplate(day)}>
                  Fyll dagen med förra årets schema
                </Button>
              </section>
            ))}
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {list.map((s) => {
            const title = tr(s.title, 'sv') || '(utan titel)'
            const meta = [
              categoryLabel(s, 'sv', CATEGORY_SV, numbers),
              s.speaker,
              s.audience !== 'adults' && AUDIENCE_LABEL[s.audience],
              s.room,
              s.language && LANG_LABEL[s.language],
            ].filter(Boolean)
            const missing = [!s.title.en?.trim() && 'engelska', !s.title.ar?.trim() && 'arabiska'].filter(Boolean)
            return (
              <li key={s.id} className="flex flex-wrap items-start gap-x-3 gap-y-0.5 py-4 sm:flex-nowrap sm:items-center sm:gap-x-4">
                <div className="w-full shrink-0 font-semibold tabular-nums text-ink sm:w-28">
                  {localTime(s.starts_at)}–{localTime(s.ends_at)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-base font-medium text-ink">{title}</span>
                    {!s.published && <Badge tone="amber">Utkast</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{meta.join(' · ')}</p>
                  {missing.length > 0 && <p className="text-sm text-muted">Titeln saknas på {missing.join(' och ')}.</p>}
                </div>
                {s.speaker && s.kind !== 'panel' && <SpeakerAvatar name={s.speaker} photo={s.speaker_photo} className="size-10 text-sm max-sm:hidden" />}
                {canEdit && (
                  <div className="-me-2 flex shrink-0 gap-1 max-sm:-mt-2.5">
                    {movable.has(s.id) && (
                      <Button
                        variant="ghost"
                        className="text-muted hover:text-ink"
                        onClick={() => postpone(s)}
                        title="Skjut upp denna och efterföljande i samma sal"
                        aria-label={`Skjut upp ${title} och efterföljande i ${s.room || 'samma sal'} 5 minuter`}
                      >
                        <Timer className="size-4" aria-hidden /> Skjut upp 5 min
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="text-muted hover:text-ink"
                      onClick={() => {
                        setErr(null)
                        setForm(toForm(s))
                      }}
                      aria-label={`Redigera ${title}`}
                    >
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

      {day && <SchedulePosterDialog open={poster} onClose={() => setPoster(false)} date={day} />}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Redigera programpunkt' : form?.copyOf ? 'Kopia av programpunkt' : 'Ny programpunkt'}
        wide
        persistent
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
              <p className="rounded-md bg-ice px-4 py-3 text-base text-ink">
                Kopia av "{form.copyOf}". Ändra dag eller tid och spara för att lägga in den.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Dag" required>
                <Select value={form.date} onChange={(e) => changeDate(e.target.value)}>
                  {days.map((d) => (
                    <option key={d.id} value={d.date}>
                      {formatShortDay(d.date)}
                    </option>
                  ))}
                  {!days.some((d) => d.date === form.date) && <option value={form.date}>{formatShortDay(form.date)}</option>}
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
                    set({ kind, feedback_enabled: isTalk({ kind }) })
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
            <LocalizedInput
              label="Egen etikett i schemat (valfritt)"
              hint={`Lämna tom för att visa typen, t.ex. "${CATEGORY_SV[`kind_${form.kind}`]}${form.kind === 'lecture' ? ' 2' : ''}". Fyll i för t.ex. Jumuah eller Start.`}
              value={form.label}
              onChange={(label) => set({ label })}
            />
            <LocalizedInput label="Beskrivning (valfritt)" multiline value={form.description} onChange={(description) => set({ description })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={form.kind === 'panel' ? 'Medverkande (valfritt)' : 'Talare (valfritt)'}
                hint={form.kind === 'panel' ? 'Skriv namnen med kommatecken emellan.' : undefined}
              >
                <Input value={form.speaker} onChange={(e) => set({ speaker: e.target.value })} />
              </Field>
              <Field label="Sal eller plats (valfritt)">
                <Input list="vk-rooms" value={form.room} onChange={(e) => set({ room: e.target.value })} />
                <datalist id="vk-rooms">
                  {rooms.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </Field>
            </div>
            {takesPhoto(form) && (
              <section className="rounded-md border border-line px-4 py-3" aria-label="Talarens foto">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <PhotoPreview form={form} />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-base font-medium text-ink">Talarens foto (valfritt)</p>
                    <p className="text-base text-muted">Visas som rund bild i schemat. Bilden beskärs till en kvadrat.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden
                      onChange={(e) => {
                        void pickPhoto(e.target.files?.[0])
                        e.target.value = ''
                      }}
                    />
                    <Button type="button" variant="secondary" loading={photoBusy} onClick={() => fileRef.current?.click()}>
                      <Camera className="size-4" aria-hidden /> {form.speaker_photo || form.photoBlob ? 'Byt foto' : 'Välj foto'}
                    </Button>
                    {(form.speaker_photo || form.photoBlob) && (
                      <Button type="button" variant="ghost" className="text-rose-700" onClick={() => set({ speaker_photo: null, photoBlob: null, photoPreview: null, photoToAll: false })}>
                        Ta bort foto
                      </Button>
                    )}
                  </div>
                </div>
                {knownPhoto && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
                    <SpeakerAvatar name={form.speaker} photo={knownPhoto.speaker_photo} className="size-10 text-sm" />
                    <p className="min-w-0 flex-1 text-base text-ink">Det finns redan ett foto på {form.speaker.trim()}.</p>
                    <Button type="button" variant="secondary" onClick={() => set({ speaker_photo: knownPhoto.speaker_photo ?? null })}>
                      Använd det
                    </Button>
                  </div>
                )}
                {photoTargets.length > 0 && (
                  <Checkbox
                    className="mt-3"
                    label={`Använd fotot också i ${photoTargets.length === 1 ? 'den andra programpunkten' : `de ${photoTargets.length} andra programpunkterna`} med ${form.speaker.trim()}`}
                    checked={form.photoToAll}
                    onChange={(photoToAll) => set({ photoToAll })}
                  />
                )}
              </section>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Språk (valfritt)">
                <Select value={form.language} onChange={(e) => set({ language: e.target.value as Lang | '' })}>
                  <option value="">–</option>
                  <option value="sv">Svenska</option>
                  <option value="ar">Arabiska</option>
                  <option value="en">Engelska</option>
                </Select>
              </Field>
              <Field label="Antal platser (valfritt)" hint="Används för att räkna hur full salen är, till exempel 400.">
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
