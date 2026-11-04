import { useMemo, useState } from 'react'
import { AlertTriangle, Banknote, Download, LogIn, LogOut, Phone, Plus, Search, Trash2, UserPlus, XCircle } from 'lucide-react'
import { Badge, Button, Card, Checkbox, Empty, ErrorText, Field, Input, Modal, PageHeader, Select, Spinner, StatTile, Textarea, cx } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useConference } from '../../lib/conference'
import { downloadCsv, kr } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { formatDateTime, now, weekdayShort } from '../../lib/time'
import type { Child, KidsRegistration, RegistrationStatus } from '../../lib/types'

const STATUS: Record<RegistrationStatus, { label: string; tone: 'slate' | 'green' | 'amber' | 'red' | 'blue' }> = {
  registered: { label: 'Anmäld', tone: 'amber' },
  paid: { label: 'Betald', tone: 'blue' },
  checked_in: { label: 'Incheckad', tone: 'green' },
  checked_out: { label: 'Hämtad', tone: 'slate' },
  cancelled: { label: 'Avbokad', tone: 'red' },
}

const digits = (s: string) => s.replace(/\D/g, '')

export default function KidsAdmin() {
  const auth = useAuth()
  const canEdit = auth.isAdmin || auth.isMemberOf('fritids') || auth.isMemberOf('gastbemotare')
  const { days } = useConference()
  const { data: regs, loading } = useList('kids_registrations', { order: [{ col: 'reg_number' }] }, { pollMs: 20_000 })
  const [q, setQ] = useState('')
  const [day, setDay] = useState('')
  const [status, setStatus] = useState<RegistrationStatus | ''>('')
  const [newOpen, setNewOpen] = useState(false)

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^#/, '')
    const d = digits(term)
    return regs.filter((r) => {
      if (day && !r.days.includes(day)) return false
      if (status && r.status !== status) return false
      if (!term) return true
      if (/^\d+$/.test(term) && String(r.reg_number).startsWith(term)) return true
      if (d.length >= 4 && digits(r.guardian_phone).includes(d)) return true
      return (
        r.guardian_name.toLowerCase().includes(term) ||
        r.children.some((c) => c.name.toLowerCase().includes(term)) ||
        (r.pickup_names ?? '').toLowerCase().includes(term)
      )
    })
  }, [regs, q, day, status])

  const active = regs.filter((r) => r.status !== 'cancelled' && (!day || r.days.includes(day)))
  const totals = {
    regs: active.length,
    kids: active.reduce((n, r) => n + r.children.length, 0),
    paid: active.filter((r) => r.paid).length,
    in: active.filter((r) => r.status === 'checked_in').length,
  }

  async function markPaid(r: KidsRegistration) {
    const v = prompt(`Belopp som betalats för #${r.reg_number} (kr):`, r.amount != null ? String(r.amount) : '')
    if (v === null) return
    const amount = v.trim() ? Number(v.replace(',', '.')) : null
    await api.update('kids_registrations', r.id, {
      paid: true,
      amount: Number.isFinite(amount) ? amount : null,
      paid_at: now().toISOString(),
      status: r.status === 'registered' ? 'paid' : r.status,
    })
  }

  const setStatusOf = (r: KidsRegistration, s: RegistrationStatus) =>
    api.update('kids_registrations', r.id, { status: s, ...(s === 'checked_in' ? { checked_in_at: now().toISOString() } : {}) })

  function exportCsv() {
    downloadCsv(
      'fritids-anmalningar.csv',
      ['Nummer', 'Vårdnadshavare', 'Telefon', 'E-post', 'Barn', 'Åldrar', 'Allergier', 'Dagar', 'Hämtas av', 'Fotosamtycke', 'Status', 'Betald', 'Belopp', 'Övrigt', 'Anmäld'],
      regs.map((r) => [
        r.reg_number,
        r.guardian_name,
        r.guardian_phone,
        r.guardian_email,
        r.children.map((c) => c.name).join(', '),
        r.children.map((c) => c.age ?? '').join(', '),
        r.children.filter((c) => c.allergies).map((c) => `${c.name}: ${c.allergies}`).join('; '),
        r.days.join(', '),
        r.pickup_names,
        r.photo_consent ? 'Ja' : 'Nej',
        STATUS[r.status].label,
        r.paid ? 'Ja' : 'Nej',
        r.amount,
        r.notes,
        formatDateTime(r.created_at),
      ]),
    )
  }

  if (!canEdit)
    return (
      <div>
        <PageHeader title="Fritids & expresskassa" />
        <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">Sidan används av Fritids, Gästbemötare och styrgruppen.</p>
      </div>
    )

  return (
    <div>
      <PageHeader
        title="Fritids & expresskassa"
        subtitle="Sök på nummer, namn eller telefon. Nya anmälningar från besökarsidan dyker upp automatiskt."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv}>
              <Download className="size-4" /> CSV
            </Button>
            <Button onClick={() => setNewOpen(true)}>
              <UserPlus className="size-4" /> Ny anmälan på plats
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Anmälningar" value={totals.regs} />
        <StatTile label="Barn totalt" value={totals.kids} />
        <StatTile label="Betalda" value={totals.paid} sub={`av ${totals.regs}`} />
        <StatTile label="Incheckade nu" value={totals.in} />
      </div>

      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
          <Input
            autoFocus
            type="search"
            placeholder="#nummer, namn eller telefon"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="ps-11 py-3.5 text-lg sm:text-lg"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Dag">
            <option value="">Alla dagar</option>
            {days.map((d) => (
              <option key={d.id} value={d.date}>
                {weekdayShort(d.date)} {d.date}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as RegistrationStatus | '')} aria-label="Status">
            <option value="">Alla statusar</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <Empty>{regs.length ? 'Ingen anmälan matchar sökningen.' : 'Inga anmälningar ännu.'}</Empty>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <RegCard key={r.id} r={r} onPaid={() => markPaid(r)} onStatus={(s) => setStatusOf(r, s)} />
          ))}
        </div>
      )}

      <NewRegistration open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}

function RegCard({ r, onPaid, onStatus }: { r: KidsRegistration; onPaid: () => void; onStatus: (s: RegistrationStatus) => void }) {
  const st = STATUS[r.status]
  const cancelled = r.status === 'cancelled'
  return (
    <Card className={cx('p-4', cancelled && 'opacity-60')}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="text-4xl font-black tabular-nums text-ink">#{r.reg_number}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">{r.guardian_name}</span>
            <Badge tone={st.tone}>{st.label}</Badge>
            <Badge tone={r.paid ? 'green' : 'amber'}>{r.paid ? `Betald${r.amount != null ? ` ${kr(r.amount)}` : ''}` : 'Ej betald'}</Badge>
          </div>
          <a href={`tel:${r.guardian_phone}`} className="mt-0.5 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink">
            <Phone className="size-3.5" /> {r.guardian_phone}
          </a>
          {r.guardian_email && <span className="ms-3 text-sm text-slate-500">{r.guardian_email}</span>}
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {r.children.map((c, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{c.name}</span>
            {c.age != null && <span className="text-slate-500">{c.age} år</span>}
            {c.allergies?.trim() && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">
                <AlertTriangle className="size-3.5" /> {c.allergies}
              </span>
            )}
          </li>
        ))}
      </ul>

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
        <div>
          <dt className="inline font-medium text-slate-700">Dagar: </dt>
          <dd className="inline">{r.days.map((d) => weekdayShort(d)).join(', ') || '–'}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-slate-700">Får hämta: </dt>
          <dd className="inline">{r.pickup_names || '–'}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-slate-700">Bilder: </dt>
          <dd className={cx('inline', !r.photo_consent && 'font-semibold text-rose-700')}>{r.photo_consent ? 'OK att fotografera' : 'Får INTE synas på bild'}</dd>
        </div>
        {r.checked_in_at && (
          <div>
            <dt className="inline font-medium text-slate-700">Incheckad: </dt>
            <dd className="inline">{formatDateTime(r.checked_in_at)}</dd>
          </div>
        )}
        {r.notes && (
          <div className="sm:col-span-2">
            <dt className="inline font-medium text-slate-700">Övrigt: </dt>
            <dd className="inline">{r.notes}</dd>
          </div>
        )}
      </dl>

      {!cancelled && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!r.paid && (
            <Button variant="accent" onClick={onPaid}>
              <Banknote className="size-4" /> Markera betald
            </Button>
          )}
          {r.status !== 'checked_in' ? (
            <Button onClick={() => onStatus('checked_in')}>
              <LogIn className="size-4" /> Checka in
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => onStatus('checked_out')}>
              <LogOut className="size-4" /> Checka ut
            </Button>
          )}
          <Button variant="danger" onClick={() => confirm(`Avboka #${r.reg_number}?`) && onStatus('cancelled')}>
            <XCircle className="size-4" /> Avboka
          </Button>
        </div>
      )}
    </Card>
  )
}

const emptyChild = (): Child => ({ name: '', age: null, allergies: '' })

function NewRegistration({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { days, today } = useConference()
  const [guardian, setGuardian] = useState('')
  const [phone, setPhone] = useState('')
  const [children, setChildren] = useState<Child[]>([emptyChild()])
  const [sel, setSel] = useState<string[] | null>(null)
  const [pickup, setPickup] = useState('')
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [number, setNumber] = useState<number | null>(null)

  const chosenDays = sel ?? (days.some((d) => d.date === today) ? [today] : [])

  function reset() {
    setGuardian('')
    setPhone('')
    setChildren([emptyChild()])
    setSel(null)
    setPickup('')
    setNotes('')
    setPhoto(false)
    setErr(null)
    setNumber(null)
  }

  function close() {
    reset()
    onClose()
  }

  async function submit() {
    const kids = children.filter((c) => c.name.trim())
    if (!guardian.trim() || !phone.trim() || !kids.length || !chosenDays.length) return setErr('Fyll i namn, telefon, minst ett barn och dag.')
    setBusy(true)
    setErr(null)
    try {
      const n = await api.rpc<number>('register_kids', {
        payload: {
          guardian_name: guardian.trim(),
          guardian_phone: phone.trim(),
          guardian_email: null,
          children: kids.map((c) => ({ ...c, name: c.name.trim(), allergies: c.allergies.trim() })),
          days: chosenDays,
          pickup_names: pickup.trim() || null,
          notes: notes.trim() || null,
          photo_consent: photo,
          lang: 'sv',
        },
      })
      setNumber(n)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const setChild = (i: number, patch: Partial<Child>) => setChildren((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  return (
    <Modal open={open} onClose={close} title="Ny anmälan på plats">
      {number != null ? (
        <div className="py-4 text-center">
          <p className="text-sm text-slate-600">Anmälan är klar. Nummer:</p>
          <p className="my-3 text-6xl font-black tabular-nums text-ink">#{number}</p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={reset}>
              <Plus className="size-4" /> Ny till
            </Button>
            <Button onClick={close}>Klar</Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vårdnadshavare" required>
              <Input value={guardian} onChange={(e) => setGuardian(e.target.value)} />
            </Field>
            <Field label="Mobilnummer" required>
              <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </div>
          <div className="space-y-2">
            <span className="block text-sm font-medium text-slate-700">Barn *</span>
            {children.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_4.5rem_auto] gap-2">
                <Input placeholder="Namn" value={c.name} onChange={(e) => setChild(i, { name: e.target.value })} />
                <Input
                  placeholder="Ålder"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={c.age ?? ''}
                  onChange={(e) => setChild(i, { age: e.target.value ? Number(e.target.value) : null })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="Ta bort barn"
                  disabled={children.length === 1}
                  onClick={() => setChildren((cs) => cs.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
                <Input className="col-span-3" placeholder="Allergier / specialkost" value={c.allergies} onChange={(e) => setChild(i, { allergies: e.target.value })} />
              </div>
            ))}
            <Button type="button" size="sm" variant="secondary" onClick={() => setChildren((cs) => [...cs, emptyChild()])}>
              <Plus className="size-4" /> Lägg till barn
            </Button>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Dagar *</span>
            <div className="flex flex-wrap gap-4">
              {days.map((d) => (
                <Checkbox
                  key={d.id}
                  label={`${weekdayShort(d.date)} ${d.date.slice(5)}`}
                  checked={chosenDays.includes(d.date)}
                  onChange={(on) => setSel(on ? [...new Set([...chosenDays, d.date])] : chosenDays.filter((x) => x !== d.date))}
                />
              ))}
            </div>
          </div>
          <Field label="Får hämta barnet">
            <Input value={pickup} onChange={(e) => setPickup(e.target.value)} />
          </Field>
          <Field label="Övrigt">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Checkbox label="OK att barnet syns på bild" checked={photo} onChange={setPhoto} />
          <ErrorText>{err}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>
              Avbryt
            </Button>
            <Button type="submit" loading={busy}>
              Registrera
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
