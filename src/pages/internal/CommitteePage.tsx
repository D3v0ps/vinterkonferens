import { Fragment, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarPlus, ClipboardPaste, Download, Megaphone, Pencil, Plus, Printer, Search, Trash2, UserPlus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useConference } from '../../lib/conference'
import { eq } from '../../lib/db'
import { useList, useNow } from '../../lib/hooks'
import { canPrint, isArtifact, saveFile } from '../../lib/platform'
import { formatShortDate, formatShortDay, localTime } from '../../lib/time'
import type { Committee, Post, Shift, Volunteer } from '../../lib/types'
import { confirmDialog, notify } from '../../components/dialogs'
import { Button, Checkbox, Empty, ErrorText, Field, Input, Modal, PageHeader, Spinner, Tabs, Textarea, cx } from '../../components/ui'
import { ShiftEditor, byStart, shiftState, timeRange } from '../../components/internal-core/shifts'
import { PostCard, PostEditor } from './Posts'

type Tab = 'schema' | 'volunteers' | 'info'

export default function CommitteePage() {
  const { slug } = useParams()
  const committees = useList('committees', { filters: [eq('slug', slug)] })
  const committee = committees.data[0]
  const [tab, setTab] = useState<Tab>('schema')

  if (committees.loading) return <Spinner />
  if (!committee)
    return (
      <Empty>
        Kommittén finns inte.{' '}
        <Link to="/intern/kommitteer" className="text-ink underline">
          Till alla kommittéer
        </Link>
      </Empty>
    )

  return (
    <div>
      <Link to="/intern/kommitteer" className="no-print mb-2 inline-flex min-h-11 items-center gap-1.5 text-base text-muted hover:text-ink">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> Alla kommittéer
      </Link>
      <PageHeader title={committee.name} subtitle={committee.description || undefined} />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'schema', label: 'Schema' },
          { value: 'volunteers', label: 'Volontärer' },
          { value: 'info', label: 'Info' },
        ]}
      />
      {tab === 'schema' && <ScheduleTab committee={committee} />}
      {tab === 'volunteers' && <VolunteersTab committee={committee} />}
      {tab === 'info' && <InfoTab committee={committee} />}
    </div>
  )
}

// ---------------- Schema ----------------

function ScheduleTab({ committee }: { committee: Committee }) {
  const auth = useAuth()
  const { days, today, currentDay, settings } = useConference()
  const at = useNow(60_000)
  const shifts = useList('shifts', { filters: [eq('committee_id', committee.id)] })
  const volunteers = useList('volunteers', { filters: [eq('committee_id', committee.id)], order: [{ col: 'full_name' }] })
  const canEdit = auth.isLead(committee.id)
  const mine = useMemo(() => new Set(auth.memberships.map((m) => m.id)), [auth.memberships])

  const dates = useMemo(
    () => [...new Set([...days.map((d) => d.date), ...shifts.data.map((s) => s.date)])].sort(),
    [days, shifts.data],
  )
  const [date, setDate] = useState<string>('')
  useEffect(() => {
    if (!date && dates.length) setDate(dates.includes(today) ? today : (currentDay?.date ?? dates[0]))
  }, [dates, date, today, currentDay])

  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Partial<Shift> | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Sökning på namn visar personernas pass; utan sökning visas dagen pass för pass.
  const query = q.trim().toLowerCase()
  const vById = useMemo(() => new Map(volunteers.data.map((v) => [v.id, v])), [volunteers.data])
  const dayShifts = useMemo(() => shifts.data.filter((s) => s.date === date).sort(byStart), [shifts.data, date])

  const edit = (s: Partial<Shift> | null) => {
    setEditing(s)
    setOpen(true)
  }

  async function downloadSchedule() {
    setSaving(true)
    try {
      const html = scheduleHtml({ conference: settings.conference_name, committee, date, shifts: dayShifts, volunteers: volunteers.data })
      const saved = await saveFile(`schema-${committee.slug}-${date}.html`, html, 'text/html')
      if (saved) notify('Schemat är sparat. Öppna filen för att läsa eller skriva ut det.')
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (shifts.loading || volunteers.loading) return <Spinner />

  // Rad med de bemannade: du i fetstil
  const names = (people: Volunteer[]) =>
    people.map((v, i) => (
      <Fragment key={v.id}>
        {i > 0 && ', '}
        <NameText v={v} me={mine.has(v.id)} />
      </Fragment>
    ))

  const meTint = (me: boolean) => (me ? '-mx-3 bg-ice px-3' : '')
  const matches = query ? volunteers.data.filter((v) => v.full_name.toLowerCase().includes(query)) : []
  const free = volunteers.data.filter((v) => !dayShifts.some((s) => s.volunteer_ids.includes(v.id)))

  return (
    <div>
      <div className="no-print space-y-3">
        {dates.length > 0 && <Tabs value={date} onChange={setDate} options={dates.map((d) => ({ value: d, label: formatShortDay(d) }))} />}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label className="relative min-w-0 flex-1 basis-60 max-sm:basis-full sm:max-w-md">
            <span className="sr-only">Sök namn för att se en persons pass</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök namn" autoComplete="off" className="ps-9" />
          </label>
          {date && (
            <div className="flex flex-wrap max-sm:-ms-4 sm:ms-auto">
              {canEdit && (
                <Button variant="ghost" onClick={() => edit({ date })}>
                  <CalendarPlus className="size-4" aria-hidden /> Nytt pass
                </Button>
              )}
              {canPrint ? (
                <Button variant="ghost" onClick={() => window.print()}>
                  <Printer className="size-4" aria-hidden /> Skriv ut
                </Button>
              ) : (
                <Button variant="ghost" onClick={downloadSchedule} loading={saving}>
                  <Download className="size-4" aria-hidden /> Ladda ner schema
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {date && (
        <h2 className="mb-2 hidden text-xl font-semibold text-ink print:block">
          {committee.name} – <span className="inline-block first-letter:uppercase">{formatShortDay(date)}</span>
        </h2>
      )}

      <div className="mt-4">
        {dates.length === 0 ? (
          <Empty>Inga konferensdagar är inlagda ännu (Inställningar).</Empty>
        ) : query ? (
          <>
            <p className="no-print mb-1 flex flex-wrap items-baseline gap-x-3 text-base text-muted">
              <span>
                {matches.length === 0 ? `Ingen i ${committee.name} heter så.` : `Sökträffar för ”${q.trim()}”, ${formatShortDay(date)}.`}
              </span>
              <button type="button" className="min-h-11 text-ink underline underline-offset-4 hover:text-ink-soft" onClick={() => setQ('')}>
                Visa alla pass
              </button>
            </p>
            {matches.length > 0 && (
              <ul className="divide-y divide-line border-y border-line">
                {matches.map((v) => {
                  const own = dayShifts.filter((s) => s.volunteer_ids.includes(v.id))
                  return (
                    <li key={v.id} className={cx('print-break flex flex-wrap items-start gap-x-4 gap-y-1 py-3', meTint(mine.has(v.id)))}>
                      <div className="w-full text-base font-medium text-ink sm:w-44 sm:shrink-0">
                        {v.full_name}
                        {mine.has(v.id) && ' (du)'}
                        {v.is_lead && <LeadMark />}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5 text-base">
                        {own.length ? (
                          own.map((s) => (
                            <div key={s.id}>
                              <span className={cx('font-semibold tabular-nums', shiftState(s, at) === 'ongoing' ? 'text-accent-strong' : 'text-ink')}>{timeRange(s)}</span>{' '}
                              <span className="text-slate-800">{s.title}</span>
                              {s.location && <span className="text-muted"> · {s.location}</span>}
                            </div>
                          ))
                        ) : (
                          <span className="text-muted">Inga pass den här dagen</span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        ) : dayShifts.length === 0 ? (
          <Empty>Inga pass den här dagen.</Empty>
        ) : (
          <>
            <ul className="divide-y divide-line border-y border-line">
              {dayShifts.map((s) => {
                const people = s.volunteer_ids.map((id) => vById.get(id)).filter((v): v is Volunteer => !!v)
                const state = shiftState(s, at)
                const hasMe = people.some((v) => mine.has(v.id))
                return (
                  <li key={s.id} className={cx('print-break flex items-start gap-3 py-4', meTint(hasMe), state === 'done' && 'opacity-60')}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={cx('text-base font-semibold tabular-nums', state === 'ongoing' ? 'text-accent-strong' : 'text-ink')}>{timeRange(s)}</span>
                        <h3 className="text-base font-semibold text-ink">{s.title}</h3>
                        {state === 'ongoing' && <span className="inline-flex items-center gap-1.5 text-base font-medium text-accent-strong"><span className="size-2 rounded-full bg-accent" aria-hidden />Pågår nu</span>}
                      </div>
                      {s.location && <p className="mt-0.5 text-base text-muted">{s.location}</p>}
                      {s.notes && <p className="mt-1 whitespace-pre-line text-base text-slate-700">{s.notes}</p>}
                      <p className="mt-2 text-base text-slate-800">{people.length ? names(people) : <span className="text-muted">Ingen bemanning ännu</span>}</p>
                    </div>
                    {canEdit && <IconBtn label={`Redigera ${s.title}`} onClick={() => edit(s)} icon={<Pencil className="size-4" aria-hidden />} />}
                  </li>
                )
              })}
            </ul>
            {canEdit && free.length > 0 && (
              <p className="no-print mt-3 text-base text-muted">
                Utan pass den här dagen: {free.map((v) => v.full_name).join(', ')}.
              </p>
            )}
          </>
        )}
      </div>

      {canEdit && (
        <ShiftEditor
          open={open}
          onClose={() => setOpen(false)}
          initial={editing}
          committeeId={committee.id}
          days={days}
          volunteers={volunteers.data}
          defaultDate={date}
        />
      )}
    </div>
  )
}

function LeadMark() {
  return (
    <>
      <span className="text-slate-400" aria-hidden title="Kommittéansvarig">
        {' '}
        ★
      </span>
      <span className="sr-only"> (ansvarig)</span>
    </>
  )
}

function NameText({ v, me }: { v: Volunteer; me: boolean }) {
  return (
    <span className={cx('break-words', me && 'font-semibold text-ink')}>
      {v.full_name}
      {me && ' (du)'}
      {v.is_lead && <LeadMark />}
    </span>
  )
}

/** Radens enda handling: tyst ikonknapp. Att ta bort görs i redigeringsrutan. */
function IconBtn({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="no-print -me-2 grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-slate-100 hover:text-ink"
    >
      {icon}
    </button>
  )
}

// ---------------- Schema som fil ----------------
// I artifacten går det inte att skriva ut, så schemat sparas som en fristående
// HTML-fil som går att läsa i telefonen och skriva ut från webbläsaren.

/** "5 nov kl 14:35" */
const stamp = (iso: string) => `${formatShortDate(iso)} kl ${localTime(iso)}`

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function scheduleHtml({ conference, committee, date, shifts, volunteers }: { conference: string; committee: Committee; date: string; shifts: Shift[]; volunteers: Volunteer[] }): string {
  const day = formatShortDay(date)
  const dayCap = day.charAt(0).toUpperCase() + day.slice(1)
  const vById = new Map(volunteers.map((v) => [v.id, v]))
  const lead = (v: Volunteer) => (v.is_lead ? ' <span class="muted">(ansvarig)</span>' : '')

  const personRows = volunteers
    .map((v) => {
      const own = shifts.filter((s) => s.volunteer_ids.includes(v.id))
      const cell = own.length
        ? own.map((s) => `<div><span class="time">${esc(timeRange(s))}</span> ${esc(s.title)}${s.location ? ` <span class="muted">· ${esc(s.location)}</span>` : ''}</div>`).join('')
        : '<span class="muted">Ledig</span>'
      return `<tr><th scope="row">${esc(v.full_name)}${lead(v)}</th><td>${cell}</td></tr>`
    })
    .join('\n')

  const passItems = shifts
    .map((s) => {
      const people = s.volunteer_ids.map((id) => vById.get(id)).filter((v): v is Volunteer => !!v)
      return `<section class="pass">
  <h3><span class="time">${esc(timeRange(s))}</span> ${esc(s.title)}</h3>
  ${s.location ? `<p class="muted">${esc(s.location)}</p>` : ''}
  ${s.notes ? `<p class="notes">${esc(s.notes)}</p>` : ''}
  <p>${people.length ? people.map((v) => esc(v.full_name) + lead(v)).join(', ') : '<span class="muted">Ingen bemanning ännu</span>'}</p>
</section>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Schema – ${esc(committee.name)} – ${esc(day)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0 auto; max-width: 48rem; padding: 24px 16px 48px; background: #fff; color: #18233a;
    font-family: "Instrument Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 16px; line-height: 1.5; }
  h1 { margin: 2px 0 0; font-size: 28px; line-height: 1.2; color: #0e2240; }
  h2 { margin: 32px 0 8px; font-size: 20px; color: #0e2240; }
  h3 { margin: 0; font-size: 16px; }
  p { margin: 2px 0 0; }
  .muted { color: #55627a; }
  .day { font-size: 18px; }
  .time { font-weight: 600; font-variant-numeric: tabular-nums; margin-right: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px 12px 8px 0; border-top: 1px solid #dfe5ec; text-align: left; vertical-align: top; }
  th { width: 38%; font-weight: 600; }
  tr { break-inside: avoid; }
  tbody tr:last-child th, tbody tr:last-child td { border-bottom: 1px solid #dfe5ec; }
  .pass { padding: 10px 0; border-top: 1px solid #dfe5ec; break-inside: avoid; }
  .pass:last-of-type { border-bottom: 1px solid #dfe5ec; }
  .notes { white-space: pre-line; }
  footer { margin-top: 32px; font-size: 14px; }
  @media print {
    @page { margin: 15mm; }
    body { max-width: none; padding: 0; }
    .page-break { break-before: page; }
  }
</style>
</head>
<body>
<header>
  <p class="muted">${esc(conference)}</p>
  <h1>${esc(committee.name)}</h1>
  <p class="day">${esc(dayCap)}</p>
</header>

<h2>Per person</h2>
${volunteers.length ? `<table><tbody>\n${personRows}\n</tbody></table>` : '<p class="muted">Inga volontärer ännu.</p>'}

<h2 class="page-break">Per pass</h2>
${shifts.length ? passItems : '<p class="muted">Inga pass den här dagen.</p>'}

<footer class="muted">Sparat ${esc(stamp(new Date().toISOString()))}. Schemat kan ha ändrats sedan dess.</footer>
</body>
</html>
`
}

// ---------------- Volontärer ----------------

/** Telefon och e-post som text som går att markera. tel:/mailto: fungerar inte säkert i artifacten. */
function Contact({ href, text, className }: { href: string; text: string; className?: string }) {
  if (isArtifact) return <span className={cx('select-all break-all', className)}>{text}</span>
  return (
    <a href={href} className={cx('break-all underline-offset-4 hover:underline', className)}>
      {text}
    </a>
  )
}

function VolunteersTab({ committee }: { committee: Committee }) {
  const auth = useAuth()
  const canEdit = auth.isLead(committee.id)
  const volunteers = useList('volunteers', { filters: [eq('committee_id', committee.id)], order: [{ col: 'full_name' }] })
  const [editing, setEditing] = useState<Volunteer | null>(null)
  const [open, setOpen] = useState(false)
  const [bulk, setBulk] = useState(false)

  if (volunteers.loading) return <Spinner />

  const n = volunteers.data.length
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-[60ch] text-base text-muted">
          {n} {n === 1 ? 'volontär' : 'volontärer'}. Den som finns här med sin e-post kan logga in.
        </p>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setBulk(true)}>
              <ClipboardPaste className="size-4" /> Klistra in lista
            </Button>
            <Button
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              <UserPlus className="size-4" /> Lägg till
            </Button>
          </div>
        )}
      </div>
      {n === 0 ? (
        <Empty>Inga volontärer ännu.</Empty>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {volunteers.data.map((v) => {
            const meta = [v.is_lead && 'Kommittéansvarig', v.notes].filter(Boolean).join(' · ')
            return (
              <li key={v.id} className="flex items-start gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-medium text-ink">{v.full_name}</div>
                  {meta && <div className="text-sm text-muted">{meta}</div>}
                  {(v.phone || v.email) && (
                    <div className="mt-1 flex flex-col gap-x-6 text-base sm:flex-row sm:flex-wrap">
                      {v.phone && <Contact href={`tel:${v.phone.replace(/\s/g, '')}`} text={v.phone} className="text-slate-800" />}
                      {v.email && <Contact href={`mailto:${v.email}`} text={v.email} className="text-muted" />}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <IconBtn
                    label={`Redigera ${v.full_name}`}
                    onClick={() => {
                      setEditing(v)
                      setOpen(true)
                    }}
                    icon={<Pencil className="size-4" aria-hidden />}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
      {canEdit && (
        <>
          <VolunteerEditor open={open} onClose={() => setOpen(false)} volunteer={editing} committee={committee} existing={volunteers.data} />
          <BulkAdd open={bulk} onClose={() => setBulk(false)} committeeId={committee.id} existing={volunteers.data} />
        </>
      )}
    </div>
  )
}

const cleanEmail = (e: string) => e.trim().toLowerCase() || null
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function VolunteerEditor({
  open,
  onClose,
  volunteer,
  committee,
  existing,
}: {
  open: boolean
  onClose: () => void
  volunteer: Volunteer | null
  committee: Committee
  existing: Volunteer[]
}) {
  const committeeId = committee.id
  const { managedSignIn } = useAuth()
  const [d, setD] = useState({ full_name: '', email: '', phone: '', is_lead: false, notes: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setErr(null)
    setD({
      full_name: volunteer?.full_name ?? '',
      email: volunteer?.email ?? '',
      phone: volunteer?.phone ?? '',
      is_lead: volunteer?.is_lead ?? false,
      notes: volunteer?.notes ?? '',
    })
  }, [open, volunteer])

  async function save() {
    if (!d.full_name.trim()) return setErr('Skriv personens namn.')
    const email = cleanEmail(d.email)
    if (email && !EMAIL_RE.test(email)) return setErr('Skriv e-postadressen i formatet namn@exempel.se.')
    const twin = email && existing.find((x) => x.id !== volunteer?.id && x.email?.toLowerCase() === email)
    if (twin) return setErr(`${twin.full_name} har redan den e-postadressen i kommittén.`)
    setBusy(true)
    setErr(null)
    const row = {
      committee_id: committeeId,
      full_name: d.full_name.trim(),
      email,
      phone: d.phone.trim() || null,
      is_lead: d.is_lead,
      notes: d.notes.trim() || null,
    }
    try {
      if (volunteer) await api.update('volunteers', volunteer.id, row)
      else await api.insert('volunteers', row)
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!volunteer) return
    const v = volunteer
    const ok = await confirmDialog({
      title: `Ta bort ${v.full_name}?`,
      message: `${v.full_name} tas bort från ${committee.name} och från kommitténs pass.`,
      confirmLabel: 'Ta bort',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    setErr(null)
    try {
      // Hämta passen på nytt: någon kan ha ändrat dem medan frågan var öppen.
      const latest = await api.list('shifts', { filters: [eq('committee_id', committeeId)] })
      await Promise.all(
        latest
          .filter((s) => s.volunteer_ids.includes(v.id))
          .map((s) => api.update('shifts', s.id, { volunteer_ids: s.volunteer_ids.filter((x) => x !== v.id) })),
      )
      await api.remove('volunteers', v.id)
      notify(`${v.full_name} är borttagen`)
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={volunteer ? 'Redigera volontär' : 'Ny volontär'} persistent>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label="Namn">
          <Input value={d.full_name} autoComplete="off" onChange={(e) => setD({ ...d, full_name: e.target.value })} />
        </Field>
        <Field
          label="E-post (valfritt)"
          hint={
            managedSignIn
              ? 'Samma adress som personen är inloggad med på claude.ai. Med en annan adress kommer hen inte in.'
              : 'Samma adress som personen loggar in med. Utan e-post kan hen inte logga in.'
          }
        >
          <Input type="email" inputMode="email" autoComplete="off" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
        </Field>
        <Field label="Telefon (valfritt)">
          <Input type="tel" inputMode="tel" autoComplete="off" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
        </Field>
        <Field label="Anteckning (valfritt)" hint="Syns för alla i kommittén.">
          <Input value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </Field>
        <Checkbox label="Kommittéansvarig (kan redigera schema, volontärer och info)" checked={d.is_lead} onChange={(v) => setD({ ...d, is_lead: v })} />
        <ErrorText>{err}</ErrorText>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {volunteer && (
            <Button type="button" variant="ghost" className="text-rose-700" disabled={busy} onClick={remove}>
              <Trash2 className="size-4" aria-hidden /> Ta bort
            </Button>
          )}
          <div className="ms-auto flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Avbryt
            </Button>
            <Button type="submit" loading={busy}>
              Spara volontär
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function parseLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/[,;\t]/).map((p) => p.trim()).filter(Boolean))
    .filter((parts) => parts.length)
    .map((parts) => {
      const email = parts.find((p) => p.includes('@')) ?? ''
      const phone = parts.find((p) => p !== email && /^\+?[\d\s()-]{6,}$/.test(p)) ?? ''
      const full_name = parts.find((p) => p !== email && p !== phone) ?? ''
      return { full_name, email: cleanEmail(email), phone: phone || null }
    })
    .filter((r) => r.full_name)
}

function BulkAdd({ open, onClose, committeeId, existing }: { open: boolean; onClose: () => void; committeeId: string; existing: Volunteer[] }) {
  const { managedSignIn } = useAuth()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const { rows, skipped } = useMemo(() => {
    // Samma e-post får bara förekomma en gång i kommittén – även inom det inklistrade
    const seen = new Set(existing.map((v) => v.email?.toLowerCase()).filter(Boolean))
    const all = parseLines(text)
    const rows = all.filter((r) => {
      if (!r.email) return true
      if (seen.has(r.email)) return false
      seen.add(r.email)
      return true
    })
    return { rows, skipped: all.length - rows.length }
  }, [text, existing])

  useEffect(() => {
    if (open) {
      setText('')
      setErr(null)
    }
  }, [open])

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      await api.insertMany(
        'volunteers',
        rows.map((r) => ({ ...r, committee_id: committeeId, is_lead: false, notes: null })),
      )
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Lägg till flera volontärer" persistent>
      <div className="space-y-5">
        <Field
          label="En person per rad"
          hint={`Namn, e-post och telefon, åtskilda med komma, semikolon eller tabb (t.ex. inklistrat från Excel). E-posten ska vara den adress personen loggar in med${managedSignIn ? ' på claude.ai' : ''}.`}
        >
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Sara Ali, sara@exempel.se, 070-123 45 67\nOmar Berg, omar@exempel.se'} />
        </Field>
        {rows.length > 0 && (
          <div className="border-y border-line py-3 text-base">
            <div className="mb-1 font-medium text-ink">
              {rows.length} {rows.length === 1 ? 'ny person' : 'nya personer'}
              {skipped > 0 && <span className="font-normal text-muted"> ({skipped} dubbletter hoppas över)</span>}
            </div>
            <ul className="space-y-0.5 text-slate-700">
              {rows.slice(0, 12).map((r, i) => (
                <li key={i} className="break-words">
                  {r.full_name}
                  {r.email && <span className="text-muted"> · {r.email}</span>}
                  {r.phone && <span className="text-muted"> · {r.phone}</span>}
                </li>
              ))}
              {rows.length > 12 && <li>… och {rows.length - 12} till</li>}
            </ul>
          </div>
        )}
        <ErrorText>{err}</ErrorText>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={onClose}>
            Avbryt
          </Button>
          <Button onClick={save} loading={busy} disabled={!rows.length}>
            Lägg till {rows.length || ''}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------- Info ----------------

function InfoTab({ committee }: { committee: Committee }) {
  const auth = useAuth()
  const posts = useList('posts', { filters: [eq('committee_id', committee.id)], order: [{ col: 'pinned', asc: false }, { col: 'created_at', asc: false }] })
  const [editing, setEditing] = useState<Post | null>(null)
  const [open, setOpen] = useState(false)
  const canEdit = auth.isLead(committee.id)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-[60ch] text-base text-muted">Intern info till volontärerna och extern info som visas på besökarsidan.</p>
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            <Plus className="size-4" /> Nytt inlägg
          </Button>
        )}
      </div>
      {posts.loading ? (
        <Spinner />
      ) : posts.data.length === 0 ? (
        <Empty icon={<Megaphone className="size-8 text-slate-300" />}>Inga inlägg från {committee.name} ännu.</Empty>
      ) : (
        <div className="divide-y divide-line border-y border-line">
          {posts.data.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onEdit={(x) => {
                setEditing(x)
                setOpen(true)
              }}
            />
          ))}
        </div>
      )}
      {canEdit && <PostEditor open={open} onClose={() => setOpen(false)} post={editing} defaultCommitteeId={committee.id} />}
    </div>
  )
}
