import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Pencil, Plus, Timer, Undo2 } from 'lucide-react'
import { Badge, Button, Empty, ErrorText, Input, PageHeader, Spinner, Tabs, cx } from '../../components/ui'
import { CHECKPOINT_LABEL, KITCHEN_CATS } from '../../components/stats/labels'
import { api } from '../../lib/api'
import { useAuth, useAuthorFields } from '../../lib/auth'
import { useConference } from '../../lib/conference'
import { eq, uuid, where } from '../../lib/db'
import { tr } from '../../lib/format'
import { useList, useNow } from '../../lib/hooks'
import { checkpointsFor, localDate, localTime, now, relMinutes, weekdayShort, zonedToUtc } from '../../lib/time'
import type { Checkpoint, FlowCount, KitchenCategory, KitchenEvent, Session } from '../../lib/types'

export default function Counting() {
  const a = useAuth()
  const [tab, setTab] = useState<'hall' | 'kitchen'>(a.isMemberOf('koket') && !a.isMemberOf('ordning') && !a.isAdmin ? 'kitchen' : 'hall')
  return (
    <>
      <PageHeader title="Flödesräkning" subtitle="Ordning räknar publiken i salen. Köket räknar gäster och beställningar." />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-6"
        options={[
          { value: 'hall', label: 'Föreläsningssal' },
          { value: 'kitchen', label: 'Köket' },
        ]}
      />
      {tab === 'hall' ? <HallCounting /> : <KitchenCounting />}
    </>
  )
}

// ---------------------------------------------------------------- Salen

type CpState = 'upcoming' | 'now' | 'done' | 'missed'

/** Stora sifferfält (minst 56 px höga) som är lätta att träffa med tummen. */
const BIG_INPUT = 'min-h-14 text-center text-2xl font-semibold tabular-nums'

/** Minuter sedan räknetillfället (negativt = i framtiden). */
const since = (at: Date, t: Date) => (t.getTime() - at.getTime()) / 60_000

function cpState(at: Date, t: Date, done: boolean): CpState {
  if (done) return 'done'
  const d = since(at, t)
  if (d < -2) return 'upcoming'
  if (d <= 10) return 'now'
  return 'missed'
}

function HallCounting() {
  const t = useNow(15_000)
  const { days, currentDay } = useConference()
  const [day, setDay] = useState<string | null>(null)
  const selected = day ?? currentDay?.date ?? localDate(t)
  const sessions = useList('sessions', { order: [{ col: 'starts_at' }] })
  const counts = useList('flow_counts', { filters: [eq('area', 'hall')], order: [{ col: 'counted_at' }] }, { pollMs: 30_000 })

  const lectures = (date: string) => sessions.data.filter((s) => s.kind === 'lecture' && localDate(s.starts_at) === date)
  const find = (sid: string, cp: Checkpoint) => counts.data.filter((c) => c.session_id === sid && c.checkpoint === cp).at(-1)

  // Nästa räkning bland dagens föreläsningar (även om en annan dag visas)
  const next = useMemo(
    () =>
      lectures(localDate(t))
        .flatMap((s) => checkpointsFor(s).map((c) => ({ s, ...c })))
        .filter((c) => !find(c.s.id, c.key) && since(c.at, t) <= 10)
        .sort((x, y) => x.at.getTime() - y.at.getTime())[0],
    [sessions.data, counts.data, t],
  )

  if (sessions.loading) return <Spinner />
  const list = lectures(selected)

  const nowState = next ? cpState(next.at, t, false) : null

  return (
    <div className="space-y-6">
      <div className="sticky top-[60px] z-10 lg:top-0">
        {next ? (
          <div className={cx('flex items-start gap-3 rounded-2xl px-4 py-3 text-base', nowState === 'now' ? 'bg-accent text-white' : 'bg-ink text-white')}>
            <Timer className="mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              <b className="font-semibold">{nowState === 'now' ? 'Räkna nu: ' : 'Nästa räkning: '}</b>
              {tr(next.s.title, 'sv')} – {CHECKPOINT_LABEL[next.key].toLowerCase()} kl {localTime(next.at)}
              {nowState === 'upcoming' && ` (${relMinutes(Math.round(since(t, next.at)))})`}
            </span>
          </div>
        ) : (
          <div className="rounded-2xl bg-frost px-4 py-3 text-base text-muted ring-1 ring-line">Inga fler räkningar idag.</div>
        )}
      </div>

      {days.length > 1 && (
        <Tabs value={selected} onChange={setDay} options={days.map((d) => ({ value: d.date, label: `${weekdayShort(d.date)} ${d.date.slice(5)}` }))} />
      )}

      {list.length === 0 ? (
        <Empty>Inga föreläsningar i programmet den här dagen.</Empty>
      ) : (
        <div className="divide-y divide-line border-y border-line">
          {list.map((s) => (
            <LectureCard key={s.id} s={s} t={t} rows={counts.data.filter((c) => c.session_id === s.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function LectureCard({ s, t, rows }: { s: Session; t: Date; rows: FlowCount[] }) {
  const extras = rows.filter((r) => r.checkpoint === 'extra')
  return (
    <section className="py-6">
      <div className="mb-4">
        <p className="text-sm text-muted tabular-nums">
          {localTime(s.starts_at)}–{localTime(s.ends_at)}
          {s.room && ` · ${s.room}`}
          {s.capacity ? ` · ${s.capacity} platser` : ''}
        </p>
        <h2 className="text-xl font-semibold text-ink">{tr(s.title, 'sv')}</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {checkpointsFor(s).map((cp) => (
          <CheckpointBox key={cp.key} s={s} cp={cp.key} at={cp.at} t={t} row={rows.filter((r) => r.checkpoint === cp.key).at(-1)} />
        ))}
      </div>
      <Extra s={s} extras={extras} />
    </section>
  )
}

function useSaveCount() {
  const author = useAuthorFields()
  return async (row: FlowCount | undefined, base: Pick<FlowCount, 'session_id' | 'area' | 'checkpoint'>, count: number) => {
    if (row) return api.update('flow_counts', row.id, { count })
    return api.insert('flow_counts', { ...base, count, counted_at: now().toISOString(), note: null, ...author() })
  }
}

function parseCount(v: string): number | null {
  const s = v.replace(/\s/g, '')
  return /^\d+$/.test(s) ? Number(s) : null
}

function CheckpointBox({ s, cp, at, t, row }: { s: Session; cp: Checkpoint; at: Date; t: Date; row?: FlowCount }) {
  const save = useSaveCount()
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const state = cpState(at, t, !!row)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseCount(v)
    if (n == null) return setErr('Skriv ett heltal.')
    setBusy(true)
    setErr(null)
    try {
      await save(row, { session_id: s.id, area: 'hall', checkpoint: cp }, n)
      setEdit(false)
      setV('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const badge = {
    upcoming: <span className="text-sm text-muted">{relMinutes(Math.round(-since(at, t)))}</span>,
    now: <Badge tone="accent">Räkna nu</Badge>,
    done: (
      <Badge tone="green">
        <Check className="size-3.5" aria-hidden /> Klar
      </Badge>
    ),
    missed: <Badge tone="amber">Missad</Badge>,
  }[state]

  return (
    <div className={cx('rounded-xl border p-4', state === 'now' ? 'border-accent bg-accent-soft ring-2 ring-accent/30' : 'border-line bg-white')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-medium text-ink">{CHECKPOINT_LABEL[cp]}</span>
        {badge}
      </div>
      <p className="text-sm text-muted tabular-nums">
        kl {localTime(at)}
        {state === 'missed' && !row && ' · fyll i ändå om du räknade'}
      </p>
      {row && !edit ? (
        <div className="mt-2 flex items-end justify-between gap-2">
          <div>
            <span className="text-3xl font-semibold tabular-nums text-ink">{row.count}</span>
            <span className="ms-1 text-base text-muted">st</span>
            {s.capacity ? <p className="text-sm text-muted">{Math.round((row.count / s.capacity) * 100)} % av salen</p> : null}
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setV(String(row.count))
              setEdit(true)
            }}
          >
            <Pencil className="size-4" aria-hidden /> Ändra
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 flex gap-2">
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Antal"
            aria-label={`Antal personer – ${CHECKPOINT_LABEL[cp]}`}
            aria-invalid={!!err}
            value={v}
            onChange={(e) => {
              setV(e.target.value)
              setErr(null)
            }}
            className={cx(BIG_INPUT, 'min-w-0')}
          />
          <Button type="submit" loading={busy} variant={state === 'now' ? 'accent' : 'primary'} className="min-h-14 shrink-0 px-5">
            Spara
          </Button>
        </form>
      )}
      {row && edit && (
        <button type="button" className="mt-1 min-h-11 text-base text-muted underline underline-offset-4 hover:text-ink" onClick={() => setEdit(false)}>
          Avbryt ändring
        </button>
      )}
      {err && <p className="mt-2 text-base text-rose-700" role="alert">{err}</p>}
    </div>
  )
}

function Extra({ s, extras }: { s: Session; extras: FlowCount[] }) {
  const save = useSaveCount()
  const [open, setOpen] = useState(false)
  const [v, setV] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="mt-4 text-base">
      {extras.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-muted">
          {extras.map((x) => (
            <li key={x.id} className="tabular-nums">
              Extra kl {localTime(x.counted_at)}: <b className="font-semibold text-ink">{x.count} st</b>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <form
          className="flex max-w-md gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const n = parseCount(v)
            if (n == null) return setErr('Skriv ett heltal.')
            try {
              await save(undefined, { session_id: s.id, area: 'hall', checkpoint: 'extra' }, n)
              setV('')
              setOpen(false)
              setErr(null)
            } catch (e) {
              setErr((e as Error).message)
            }
          }}
        >
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Antal just nu"
            aria-label={`Extra räkning – ${tr(s.title, 'sv')}`}
            aria-invalid={!!err}
            value={v}
            onChange={(e) => setV(e.target.value)}
            autoFocus
            className={cx(BIG_INPUT, 'min-w-0')}
          />
          <Button type="submit" variant="secondary" className="min-h-14 shrink-0 px-5">
            Spara
          </Button>
          <Button type="button" variant="ghost" className="min-h-14 shrink-0" onClick={() => { setOpen(false); setV(''); setErr(null) }}>
            Avbryt
          </Button>
        </form>
      ) : (
        <button type="button" className="inline-flex min-h-11 items-center gap-1.5 text-muted hover:text-ink" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden /> Extra räkning
        </button>
      )}
      {err && <p className="mt-2 text-base text-rose-700" role="alert">{err}</p>}
    </div>
  )
}

// ---------------------------------------------------------------- Köket

function KitchenCounting() {
  const t = useNow(15_000)
  const today = localDate(t)
  const dayStart = zonedToUtc(today, '00:00').toISOString()
  const author = useAuthorFields()
  const events = useList('kitchen_events', { filters: [where('occurred_at', 'gte', dayStart)] }, { pollMs: 30_000 })
  const queue = useList(
    'flow_counts',
    { filters: [eq('area', 'kitchen'), where('counted_at', 'gte', dayStart)], order: [{ col: 'counted_at', asc: false }] },
    { pollMs: 60_000 },
  )
  const [pending, setPending] = useState<KitchenEvent[]>([])
  const [mine, setMine] = useState<string[]>([])
  // Pågående inserts per tryck: true = sparad, false = misslyckades
  const inflight = useRef(new Map<string, Promise<boolean>>())
  const [flash, setFlash] = useState<{ cat: KitchenCategory; at: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')

  // Ny dag (t.ex. surfplattan stod på över natten): gårdagens tryck ska inte räknas eller kunna ångras
  useEffect(() => {
    setPending((p) => (p.length ? [] : p))
    setMine((m) => (m.length ? [] : m))
  }, [today])

  const ids = new Set(events.data.map((e) => e.id))
  const all = [...events.data, ...pending.filter((p) => !ids.has(p.id) && p.occurred_at >= dayStart)]
  const cutoff = t.getTime() - 15 * 60_000
  const sum = (cat: KitchenCategory, from = 0) =>
    all.filter((e) => e.category === cat && new Date(e.occurred_at).getTime() >= from).reduce((a, e) => a + e.quantity, 0)

  function tap(cat: KitchenCategory) {
    const ev = { id: uuid(), category: cat, quantity: 1, occurred_at: now().toISOString(), ...author() } as KitchenEvent
    setPending((p) => [...p, ev])
    setMine((m) => [...m, ev.id])
    const stamp = Date.now()
    setFlash({ cat, at: stamp })
    setTimeout(() => setFlash((f) => (f?.at === stamp ? null : f)), 700)
    try {
      // Saknas på iOS och kan vara blockerad i en inbäddad vy
      if (typeof navigator.vibrate === 'function') navigator.vibrate(12)
    } catch {
      /* ingen vibration */
    }
    const p = api.insert('kitchen_events', ev).then(
      () => true,
      (e: Error) => {
        setPending((p) => p.filter((x) => x.id !== ev.id))
        setMine((m) => m.filter((x) => x !== ev.id))
        setErr('Kunde inte spara: ' + e.message)
        return false
      },
    )
    inflight.current.set(ev.id, p)
    void p.finally(() => inflight.current.delete(ev.id))
  }

  async function undo() {
    const id = mine.at(-1)
    if (!id) return
    setMine((m) => m.slice(0, -1))
    setPending((p) => p.filter((x) => x.id !== id))
    try {
      if ((await inflight.current.get(id)) === false) return
      await api.remove('kitchen_events', id)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function saveQueue(e: React.FormEvent) {
    e.preventDefault()
    const n = parseCount(q)
    if (n == null) return setErr('Skriv ett heltal för kön.')
    try {
      await api.insert('flow_counts', { session_id: null, area: 'kitchen', checkpoint: 'queue', count: n, counted_at: now().toISOString(), note: null, ...author() })
      setQ('')
      setErr(null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-base text-muted">Ett tryck per gäst som kommer fram, och ett per sak som beställs.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {KITCHEN_CATS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => tap(c.key)}
            aria-label={`${c.label}: ${sum(c.key)} idag. Tryck för att lägga till en.`}
            className={cx(
              'relative flex min-h-32 flex-col items-center justify-center gap-1 rounded-2xl border bg-white p-3 transition select-none active:scale-[0.97] active:bg-ice',
              flash?.cat === c.key ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-slate-400',
            )}
          >
            <c.icon className="size-7 text-ink" aria-hidden />
            <span className="text-base font-semibold text-ink">{c.label}</span>
            <span className="text-3xl font-semibold tabular-nums text-ink">{sum(c.key)}</span>
            <span className="text-sm text-muted tabular-nums">15 min: {sum(c.key, cutoff)}</span>
            {flash?.cat === c.key && (
              <span className="absolute end-2 top-2 rounded-full bg-accent px-2.5 py-0.5 text-sm font-semibold text-white" aria-hidden>
                +1
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={undo} disabled={!mine.length}>
          <Undo2 className="size-4" aria-hidden /> Ångra senaste
        </Button>
        {mine.length > 0 && <span className="text-sm text-muted">{mine.length} tryck från den här enheten</span>}
      </div>
      <ErrorText>{err}</ErrorText>

      <section className="border-t border-line pt-6">
        <h2 className="text-xl font-semibold text-ink">Kö just nu</h2>
        <p className="text-base text-muted">Räkna hur många som står i kö och spara.</p>
        <form onSubmit={saveQueue} className="mt-3 flex max-w-md gap-2">
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Antal i kö"
            aria-label="Antal i kö"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={cx(BIG_INPUT, 'min-w-0')}
          />
          <Button type="submit" className="min-h-14 shrink-0 px-5">
            Spara
          </Button>
        </form>
        {queue.data.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-y border-line text-base">
            {queue.data.slice(0, 5).map((r) => (
              <li key={r.id} className="flex justify-between py-2 tabular-nums">
                <span className="text-muted">kl {localTime(r.counted_at)}</span>
                <span>
                  <b className="font-semibold text-ink">{r.count}</b> i kö
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
