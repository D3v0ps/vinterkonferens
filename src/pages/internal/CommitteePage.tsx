import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarPlus, ClipboardPaste, Copy, MapPin, Megaphone, Pencil, Plus, Printer, Search, Trash2, UserPlus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useConference } from '../../lib/conference'
import { eq } from '../../lib/db'
import { useList, useNow } from '../../lib/hooks'
import { formatDay } from '../../lib/time'
import type { Committee, Post, Shift, Volunteer } from '../../lib/types'
import { Badge, Button, Card, Checkbox, Empty, ErrorText, Field, Input, Modal, PageHeader, Spinner, Tabs, Textarea, cx } from '../../components/ui'
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
      <Link to="/intern/kommitteer" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink">
        <ArrowLeft className="size-4" /> Alla kommittéer
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <span className="size-3.5 rounded-full" style={{ background: committee.color }} />
            {committee.name}
          </span>
        }
        subtitle={committee.description || undefined}
      />
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
  const { days, today, currentDay } = useConference()
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

  const [view, setView] = useState<'pass' | 'person'>('pass')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Partial<Shift> | null>(null)
  const [open, setOpen] = useState(false)

  const query = q.trim().toLowerCase()
  const isMatch = (v: Volunteer) => !!query && v.full_name.toLowerCase().includes(query)
  const vById = useMemo(() => new Map(volunteers.data.map((v) => [v.id, v])), [volunteers.data])
  const dayShifts = useMemo(() => shifts.data.filter((s) => s.date === date).sort(byStart), [shifts.data, date])

  const edit = (s: Partial<Shift> | null) => {
    setEditing(s)
    setOpen(true)
  }

  if (shifts.loading || volunteers.loading) return <Spinner />

  const chip = (v: Volunteer) => (
    <span
      key={v.id}
      className={cx(
        'rounded-full px-2.5 py-1 text-xs font-medium',
        mine.has(v.id) ? 'bg-accent text-white' : isMatch(v) ? 'bg-amber-200 text-amber-950 ring-2 ring-amber-400' : 'bg-slate-100 text-slate-700',
      )}
    >
      {v.full_name}
      {v.is_lead && ' ★'}
    </span>
  )

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        {dates.length > 0 && (
          <Tabs
            value={date}
            onChange={setDate}
            options={dates.map((d) => ({ value: d, label: <span className="inline-block first-letter:uppercase">{formatDay(d, 'sv', { weekday: 'short', day: 'numeric', month: 'short' })}</span> }))}
          />
        )}
        <Tabs
          value={view}
          onChange={setView}
          options={[
            { value: 'pass', label: 'Per pass' },
            { value: 'person', label: 'Per person' },
          ]}
        />
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök ditt namn …" className="ps-9" />
        </div>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="size-4" /> Skriv ut
        </Button>
        {canEdit && (
          <Button onClick={() => edit({ date })} disabled={!date}>
            <CalendarPlus className="size-4" /> Nytt pass
          </Button>
        )}
      </div>

      <h2 className="mb-3 hidden text-xl font-bold print:block">
        {committee.name} – <span className="inline-block first-letter:uppercase">{date && formatDay(date)}</span>
      </h2>
      {date && <p className="no-print mb-3 text-sm font-medium first-letter:uppercase text-slate-600">{formatDay(date)}</p>}

      {dates.length === 0 ? (
        <Empty>Inga konferensdagar är inlagda ännu (Inställningar).</Empty>
      ) : view === 'pass' ? (
        dayShifts.length === 0 ? (
          <Empty>Inga pass den här dagen.</Empty>
        ) : (
          <div className="space-y-3">
            {dayShifts.map((s) => {
              const people = s.volunteer_ids.map((id) => vById.get(id)).filter((v): v is Volunteer => !!v)
              const state = shiftState(s, at)
              const hasMe = people.some((v) => mine.has(v.id))
              return (
                <Card key={s.id} className={cx('print-break p-4', hasMe && 'border-accent/60 ring-1 ring-accent/30', state === 'done' && 'opacity-60')}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold tabular-nums text-ink">{timeRange(s)}</span>
                        <h3 className="font-semibold text-ink">{s.title}</h3>
                        {state === 'ongoing' && <Badge tone="green">Pågår</Badge>}
                        {hasMe && <Badge tone="accent">Du</Badge>}
                      </div>
                      {s.location && (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-slate-600">
                          <MapPin className="size-3.5" /> {s.location}
                        </p>
                      )}
                      {s.notes && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{s.notes}</p>}
                    </div>
                    {canEdit && (
                      <div className="no-print flex gap-1">
                        <IconBtn label="Redigera" onClick={() => edit(s)} icon={<Pencil className="size-4" />} />
                        <IconBtn label="Duplicera" onClick={() => edit({ ...s, id: undefined })} icon={<Copy className="size-4" />} />
                        <IconBtn
                          label="Ta bort"
                          danger
                          onClick={() => confirm(`Ta bort passet "${s.title}"?`) && api.remove('shifts', s.id)}
                          icon={<Trash2 className="size-4" />}
                        />
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {people.length ? people.map(chip) : <span className="text-sm text-slate-400">Ingen bemanning ännu</span>}
                  </div>
                </Card>
              )
            })}
          </div>
        )
      ) : (
        <Card className="divide-y divide-slate-100">
          {volunteers.data
            .filter((v) => !query || isMatch(v))
            .map((v) => {
              const own = dayShifts.filter((s) => s.volunteer_ids.includes(v.id))
              return (
                <div key={v.id} className={cx('print-break flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3', mine.has(v.id) && 'bg-accent-soft', isMatch(v) && 'bg-amber-50')}>
                  <div className="w-44 shrink-0 font-medium text-ink">
                    {v.full_name}
                    {v.is_lead && <span className="text-slate-400"> ★</span>}
                  </div>
                  <div className="flex-1 space-y-0.5 text-sm">
                    {own.length ? (
                      own.map((s) => (
                        <div key={s.id}>
                          <span className="font-mono tabular-nums text-slate-900">{timeRange(s)}</span> <span className="text-slate-700">{s.title}</span>
                          {s.location && <span className="text-slate-500"> · {s.location}</span>}
                        </div>
                      ))
                    ) : (
                      <span className="text-slate-400">Ledig</span>
                    )}
                  </div>
                </div>
              )
            })}
          {volunteers.data.length === 0 && <p className="p-4 text-sm text-slate-500">Inga volontärer ännu.</p>}
        </Card>
      )}

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

function IconBtn({ label, onClick, icon, danger }: { label: string; onClick: () => void; icon: React.ReactNode; danger?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx('rounded-lg p-2', danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-500 hover:bg-slate-100')}
    >
      {icon}
    </button>
  )
}

// ---------------- Volontärer ----------------

function VolunteersTab({ committee }: { committee: Committee }) {
  const auth = useAuth()
  const canEdit = auth.isLead(committee.id)
  const volunteers = useList('volunteers', { filters: [eq('committee_id', committee.id)], order: [{ col: 'full_name' }] })
  const shifts = useList('shifts', { filters: [eq('committee_id', committee.id)] })
  const [editing, setEditing] = useState<Volunteer | null>(null)
  const [open, setOpen] = useState(false)
  const [bulk, setBulk] = useState(false)

  async function removeVolunteer(v: Volunteer) {
    if (!confirm(`Ta bort ${v.full_name} från ${committee.name}? Personen tas även bort från kommitténs pass.`)) return
    await Promise.all(
      shifts.data
        .filter((s) => s.volunteer_ids.includes(v.id))
        .map((s) => api.update('shifts', s.id, { volunteer_ids: s.volunteer_ids.filter((x) => x !== v.id) })),
    )
    await api.remove('volunteers', v.id)
  }

  if (volunteers.loading) return <Spinner />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {volunteers.data.length} volontärer. Den som finns här med sin e-post kan logga in.
        </p>
        {canEdit && (
          <div className="flex gap-2">
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
      {volunteers.data.length === 0 ? (
        <Empty>Inga volontärer ännu.</Empty>
      ) : (
        <Card className="divide-y divide-slate-100">
          {volunteers.data.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-40 flex-1">
                <div className="flex items-center gap-2 font-medium text-ink">
                  {v.full_name}
                  {v.is_lead && <Badge tone="violet">Ansvarig</Badge>}
                </div>
                {v.notes && <div className="text-xs text-slate-500">{v.notes}</div>}
              </div>
              <div className="flex min-w-0 flex-col text-sm sm:w-72">
                {v.phone && (
                  <a href={`tel:${v.phone.replace(/\s/g, '')}`} className="text-slate-700 hover:underline">
                    {v.phone}
                  </a>
                )}
                {v.email && (
                  <a href={`mailto:${v.email}`} className="truncate text-slate-500 hover:underline">
                    {v.email}
                  </a>
                )}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <IconBtn
                    label="Redigera"
                    onClick={() => {
                      setEditing(v)
                      setOpen(true)
                    }}
                    icon={<Pencil className="size-4" />}
                  />
                  <IconBtn label="Ta bort" danger onClick={() => removeVolunteer(v)} icon={<Trash2 className="size-4" />} />
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      {canEdit && (
        <>
          <VolunteerEditor open={open} onClose={() => setOpen(false)} volunteer={editing} committeeId={committee.id} />
          <BulkAdd open={bulk} onClose={() => setBulk(false)} committeeId={committee.id} existing={volunteers.data} />
        </>
      )}
    </div>
  )
}

const cleanEmail = (e: string) => e.trim().toLowerCase() || null

function VolunteerEditor({ open, onClose, volunteer, committeeId }: { open: boolean; onClose: () => void; volunteer: Volunteer | null; committeeId: string }) {
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
    if (!d.full_name.trim()) return setErr('Skriv ett namn.')
    setBusy(true)
    setErr(null)
    const row = {
      committee_id: committeeId,
      full_name: d.full_name.trim(),
      email: cleanEmail(d.email),
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

  return (
    <Modal open={open} onClose={onClose} title={volunteer ? 'Redigera volontär' : 'Ny volontär'}>
      <div className="space-y-4">
        <Field label="Namn" required>
          <Input value={d.full_name} onChange={(e) => setD({ ...d, full_name: e.target.value })} />
        </Field>
        <Field label="E-post" hint="Behövs för att kunna logga in.">
          <Input type="email" inputMode="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
        </Field>
        <Field label="Telefon">
          <Input type="tel" inputMode="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
        </Field>
        <Field label="Anteckning">
          <Input value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </Field>
        <Checkbox label="Kommittéansvarig (kan redigera schema, volontärer och info)" checked={d.is_lead} onChange={(v) => setD({ ...d, is_lead: v })} />
        <ErrorText>{err}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Avbryt
          </Button>
          <Button onClick={save} loading={busy}>
            Spara
          </Button>
        </div>
      </div>
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
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const rows = useMemo(() => {
    const known = new Set(existing.map((v) => v.email).filter(Boolean))
    return parseLines(text).filter((r) => !r.email || !known.has(r.email))
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
    <Modal open={open} onClose={onClose} title="Lägg till flera volontärer">
      <div className="space-y-4">
        <Field label="En person per rad" hint="Namn, e-post, telefon – separera med komma, semikolon eller tabb (t.ex. inklistrat från Excel).">
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Sara Ali, sara@exempel.se, 070-123 45 67\nOmar Berg, omar@exempel.se'} />
        </Field>
        {rows.length > 0 && (
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <div className="mb-1 font-medium text-slate-700">{rows.length} nya personer:</div>
            <ul className="space-y-0.5 text-slate-600">
              {rows.slice(0, 12).map((r, i) => (
                <li key={i}>
                  {r.full_name}
                  {r.email && <span className="text-slate-400"> · {r.email}</span>}
                  {r.phone && <span className="text-slate-400"> · {r.phone}</span>}
                </li>
              ))}
              {rows.length > 12 && <li>… och {rows.length - 12} till</li>}
            </ul>
          </div>
        )}
        <ErrorText>{err}</ErrorText>
        <div className="flex justify-end gap-2">
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Intern info till volontärerna och extern info som visas på besökarsidan.</p>
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
        <div className="space-y-3">
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
