import { useMemo, useState } from 'react'
import { AlertTriangle, Banknote, Download, LogIn, LogOut, Phone, Plus, Search, Trash2, UserPlus, XCircle } from 'lucide-react'
import { confirmDialog, notify, promptDialog } from '../../components/dialogs'
import { KeyFigures } from '../../components/stats/charts'
import { Badge, Button, Card, Checkbox, Empty, ErrorText, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, cx } from '../../components/ui'
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
/** Lägen som får en egen etikett på kortet. Anmäld/Betald syns redan i betalningsetiketten. */
const SHOWN_STATUS: RegistrationStatus[] = ['checked_in', 'checked_out', 'cancelled']

const digits = (s: string) => s.replace(/\D/g, '')

/** Anmälan kan komma via det publika RPC:t – läs barnen defensivt så en trasig rad inte kraschar sidan. */
function safeChildren(raw: unknown): Child[] {
  if (!Array.isArray(raw)) return []
  return raw.map((c) => {
    const o = c && typeof c === 'object' ? (c as Record<string, unknown>) : {}
    return {
      name: typeof o.name === 'string' ? o.name : '',
      age: typeof o.age === 'number' && Number.isFinite(o.age) ? o.age : null,
      allergies: typeof o.allergies === 'string' ? o.allergies : '',
    }
  })
}

/** "1 500", "150 kr", "150:-", "25,50 kr" → tal. null = tomt, undefined = ogiltigt. */
function parseAmount(v: string): number | null | undefined {
  const t = v.replace(/\s|kr|:-/gi, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export default function KidsAdmin() {
  const auth = useAuth()
  const canEdit = auth.isAdmin || auth.isMemberOf('fritids') || auth.isMemberOf('gastbemotare')
  const { days } = useConference()
  const { data, loading } = useList('kids_registrations', { order: [{ col: 'reg_number' }] }, { pollMs: 20_000 })
  const regs = useMemo(() => data.map((r) => ({ ...r, children: safeChildren(r.children), days: Array.isArray(r.days) ? r.days : [] })), [data])
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
    const v = await promptDialog({
      title: `Markera #${r.reg_number} som betald`,
      message: 'Skriv vad som betalades. Lämna tomt om du inte vet beloppet.',
      label: 'Belopp (kr)',
      defaultValue: r.amount != null ? String(r.amount).replace('.', ',') : '',
      inputMode: 'decimal',
      placeholder: 't.ex. 150',
      confirmLabel: 'Markera betald',
      validate: (x) => (parseAmount(x) === undefined ? 'Skriv beloppet i kronor, t.ex. 150, 1 500 eller 25,50.' : null),
    })
    if (v === null) return
    const amount = parseAmount(v)
    if (amount === undefined) return
    try {
      await api.update('kids_registrations', r.id, {
        paid: true,
        amount,
        paid_at: now().toISOString(),
        status: r.status === 'registered' ? 'paid' : r.status,
      })
      notify(`#${r.reg_number} är betald`)
    } catch (e) {
      notify((e as Error).message, 'error')
    }
  }

  async function setStatusOf(r: KidsRegistration, s: RegistrationStatus) {
    if (s === 'cancelled') {
      const ok = await confirmDialog({
        title: `Avboka #${r.reg_number}?`,
        message: `Anmälan för ${r.guardian_name} markeras som avbokad. Den finns kvar i listan och i CSV-filen.`,
        confirmLabel: 'Avboka',
        cancelLabel: 'Behåll anmälan',
        danger: true,
      })
      if (!ok) return
    }
    try {
      await api.update('kids_registrations', r.id, { status: s, ...(s === 'checked_in' ? { checked_in_at: now().toISOString() } : {}) })
    } catch (e) {
      notify((e as Error).message, 'error')
    }
  }

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
        <p className="text-base text-muted">Sidan används av Fritids, Gästbemötare och styrgruppen.</p>
      </div>
    )

  return (
    <div>
      <PageHeader
        title="Fritids & expresskassa"
        subtitle="Sök på nummer, namn eller telefon. Nya anmälningar från besökarsidan dyker upp automatiskt."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!regs.length}>
              <Download className="size-4" aria-hidden /> Ladda ner CSV
            </Button>
            <Button onClick={() => setNewOpen(true)}>
              <UserPlus className="size-4" aria-hidden /> Ny anmälan på plats
            </Button>
          </>
        }
      />

      <KeyFigures
        className="mb-6"
        items={[
          { label: 'Anmälningar', value: totals.regs },
          { label: 'Barn totalt', value: totals.kids },
          { label: 'Betalda', value: totals.paid, sub: `av ${totals.regs}` },
          { label: 'Incheckade nu', value: totals.in },
        ]}
      />

      <div className="mb-6 space-y-2">
        <label htmlFor="kids-search" className="block text-base font-medium text-slate-800">
          Sök anmälan
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            id="kids-search"
            autoFocus
            type="search"
            placeholder="#nummer, namn eller telefon"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-h-13 ps-11 text-lg"
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
  // En huvudhandling per kort: först betalning, sedan incheckning
  const payFirst = !r.paid && r.status !== 'checked_in'
  return (
    <Card className={cx('p-4 sm:p-5', cancelled && 'opacity-60')}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="text-4xl font-bold tabular-nums text-ink">#{r.reg_number}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold text-ink">{r.guardian_name}</span>
            {SHOWN_STATUS.includes(r.status) && <Badge tone={st.tone}>{st.label}</Badge>}
            {(r.paid || !cancelled) && <Badge tone={r.paid ? 'green' : 'amber'}>{r.paid ? `Betald${r.amount != null ? ` ${kr(r.amount)}` : ''}` : 'Ej betald'}</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-base text-muted">
            <span className="select-all tabular-nums text-ink">{r.guardian_phone}</span>
            <a href={`tel:${r.guardian_phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-11 items-center gap-1.5 text-ink underline underline-offset-4 hover:text-ink-soft">
              <Phone className="size-4" aria-hidden /> Ring
            </a>
            {r.guardian_email && <span className="select-all break-all">{r.guardian_email}</span>}
          </div>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {r.children.map((c, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
            <span className="font-medium text-ink">{c.name}</span>
            {c.age != null && <span className="text-muted">{c.age} år</span>}
            {c.allergies?.trim() && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2 py-0.5 font-semibold text-rose-800">
                <AlertTriangle className="size-4" aria-hidden /> {c.allergies}
              </span>
            )}
          </li>
        ))}
      </ul>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-base sm:grid-cols-2">
        <div>
          <dt className="inline text-muted">Dagar: </dt>
          <dd className="inline">{r.days.map((d) => weekdayShort(d)).join(', ') || '–'}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Får hämta: </dt>
          <dd className="inline">{r.pickup_names || '–'}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Bilder: </dt>
          <dd className={cx('inline', !r.photo_consent && 'font-semibold text-rose-700')}>{r.photo_consent ? 'OK att fotografera' : 'Får inte synas på bild'}</dd>
        </div>
        {r.checked_in_at && (
          <div>
            <dt className="inline text-muted">Incheckad: </dt>
            <dd className="inline">{formatDateTime(r.checked_in_at)}</dd>
          </div>
        )}
        {r.notes && (
          <div className="sm:col-span-2">
            <dt className="inline text-muted">Övrigt: </dt>
            <dd className="inline">{r.notes}</dd>
          </div>
        )}
      </dl>

      {!cancelled && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {!r.paid && (
            <Button variant={payFirst ? 'primary' : 'secondary'} onClick={onPaid}>
              <Banknote className="size-4" aria-hidden /> Markera betald
            </Button>
          )}
          {r.status !== 'checked_in' ? (
            <Button variant={payFirst ? 'secondary' : 'primary'} onClick={() => onStatus('checked_in')}>
              <LogIn className="size-4" aria-hidden /> Checka in
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => onStatus('checked_out')}>
              <LogOut className="size-4" aria-hidden /> Checka ut
            </Button>
          )}
          <Button variant="ghost" className="ms-auto text-rose-700" onClick={() => onStatus('cancelled')}>
            <XCircle className="size-4" aria-hidden /> Avboka
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
    const missing = [
      !guardian.trim() && 'vårdnadshavarens namn',
      !phone.trim() && 'mobilnummer',
      !kids.length && 'minst ett barns namn',
      !chosenDays.length && 'minst en dag',
    ].filter(Boolean)
    if (missing.length) return setErr(`Fyll i ${missing.join(', ').replace(/, ([^,]*)$/, ' och $1')}.`)
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
          <p className="text-base text-muted">Anmälan är klar. Nummer:</p>
          <p className="my-3 text-6xl font-bold tabular-nums text-ink">#{number}</p>
          <p className="mb-5 text-base text-muted">Säg numret till vårdnadshavaren – det används vid betalning och hämtning.</p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={reset}>
              <Plus className="size-4" aria-hidden /> Ny anmälan till
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vårdnadshavare" required>
              <Input autoComplete="off" value={guardian} onChange={(e) => setGuardian(e.target.value)} />
            </Field>
            <Field label="Mobilnummer" required>
              <Input type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </div>
          <div className="space-y-4">
            {children.map((c, i) => (
              <fieldset key={i} className="min-w-0 space-y-3 border-t border-line pt-4">
                <legend className="sr-only">{children.length > 1 ? `Barn ${i + 1}` : 'Barn'}</legend>
                <div className="flex min-h-11 items-center justify-between gap-2">
                  <span className="text-base font-semibold text-ink" aria-hidden>
                    {children.length > 1 ? `Barn ${i + 1}` : 'Barn'}
                    {i === 0 && <span className="text-rose-700"> *</span>}
                  </span>
                  {children.length > 1 && (
                    <Button type="button" variant="ghost" className="text-rose-700" onClick={() => setChildren((cs) => cs.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" aria-hidden /> Ta bort barn {i + 1}
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-[1fr_6rem] gap-3">
                  <Field label="Namn">
                    <Input autoComplete="off" value={c.name} onChange={(e) => setChild(i, { name: e.target.value })} />
                  </Field>
                  <Field label="Ålder">
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={c.age ?? ''}
                      onChange={(e) => setChild(i, { age: e.target.value ? Number(e.target.value) : null })}
                    />
                  </Field>
                </div>
                <Field label="Allergier eller specialkost" hint="Lämna tomt om det inte finns några.">
                  <Input value={c.allergies} onChange={(e) => setChild(i, { allergies: e.target.value })} />
                </Field>
              </fieldset>
            ))}
            <Button type="button" variant="secondary" onClick={() => setChildren((cs) => [...cs, emptyChild()])}>
              <Plus className="size-4" aria-hidden /> Lägg till barn
            </Button>
          </div>
          <fieldset className="min-w-0">
            <legend className="mb-1 block w-full border-t border-line pt-4 text-base font-semibold text-ink">
              Dagar<span className="text-rose-700"> *</span>
            </legend>
            <div className="flex flex-wrap gap-x-6">
              {days.map((d) => (
                <Checkbox
                  key={d.id}
                  label={`${weekdayShort(d.date)} ${d.date.slice(5)}`}
                  checked={chosenDays.includes(d.date)}
                  onChange={(on) => setSel(on ? [...new Set([...chosenDays, d.date])] : chosenDays.filter((x) => x !== d.date))}
                />
              ))}
            </div>
          </fieldset>
          <Field label="Får hämta barnet" hint="Namn på andra vuxna som får hämta.">
            <Input value={pickup} onChange={(e) => setPickup(e.target.value)} />
          </Field>
          <Field label="Övrigt">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Checkbox label="OK att barnet syns på bild" checked={photo} onChange={setPhoto} />
          <ErrorText>{err}</ErrorText>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
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
