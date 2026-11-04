import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Pencil, Plus, Timer, Undo2 } from 'lucide-react'
import { Badge, Button, Card, Empty, ErrorText, Input, PageHeader, Spinner, Tabs, cx } from '../../components/ui'
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
      <PageHeader title="Flödesräkning" subtitle="Ordning räknar publiken i salen – köket räknar gäster och beställningar." />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
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

  return (
    <div className="space-y-4">
      <div className="sticky top-[60px] z-10 lg:top-0">
        {next ? (
          <div
            className={cx(
              'flex items-center gap-2 rounded-2xl px-4 py-3 text-sm shadow-sm',
              cpState(next.at, t, false) === 'now' ? 'bg-accent text-white' : 'bg-ink text-white',
            )}
          >
            <Timer className="size-5 shrink-0" />
            <span>
              <b>{cpState(next.at, t, false) === 'now' ? 'RÄKNA NU: ' : 'Nästa räkning: '}</b>
              {tr(next.s.title, 'sv')} – {CHECKPOINT_LABEL[next.key].toLowerCase()} kl {localTime(next.at)}
              {cpState(next.at, t, false) === 'upcoming' && ` (${relMinutes(Math.round(since(t, next.at)))})`}
            </span>
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">Inga fler räkningar idag.</div>
        )}
      </div>

      {days.length > 1 && (
        <Tabs value={selected} onChange={setDay} options={days.map((d) => ({ value: d.date, label: `${weekdayShort(d.date)} ${d.date.slice(5)}` }))} />
      )}

      {list.length === 0 ? (
        <Empty>Inga föreläsningar i programmet den här dagen.</Empty>
      ) : (
        list.map((s) => <LectureCard key={s.id} s={s} t={t} rows={counts.data.filter((c) => c.session_id === s.id)} />)
      )}
    </div>
  )
}

function LectureCard({ s, t, rows }: { s: Session; t: Date; rows: FlowCount[] }) {
  const extras = rows.filter((r) => r.checkpoint === 'extra')
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-500 tabular-nums">
            {localTime(s.starts_at)}–{localTime(s.ends_at)}
            {s.room && ` · ${s.room}`}
          </div>
          <h2 className="text-lg font-semibold text-ink">{tr(s.title, 'sv')}</h2>
        </div>
        {s.capacity ? <Badge>Kapacitet {s.capacity}</Badge> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {checkpointsFor(s).map((cp) => (
          <CheckpointBox key={cp.key} s={s} cp={cp.key} at={cp.at} t={t} row={rows.filter((r) => r.checkpoint === cp.key).at(-1)} />
        ))}
      </div>
      <Extra s={s} extras={extras} />
    </Card>
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
    upcoming: <Badge>{relMinutes(Math.round(-since(at, t)))}</Badge>,
    now: <Badge tone="accent">RÄKNA NU</Badge>,
    done: (
      <Badge tone="green">
        <Check className="size-3" /> Klar
      </Badge>
    ),
    missed: <Badge tone="red">Missad – fyll i ändå</Badge>,
  }[state]

  return (
    <div className={cx('rounded-xl border p-3', state === 'now' ? 'border-accent bg-accent-soft ring-2 ring-accent/40' : 'border-slate-200 bg-frost')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">{CHECKPOINT_LABEL[cp]}</span>
        {badge}
      </div>
      <div className="text-xs text-slate-500 tabular-nums">kl {localTime(at)}</div>
      {row && !edit ? (
        <div className="mt-2 flex items-end justify-between gap-2">
          <div>
            <span className="text-3xl font-bold text-ink">{row.count}</span>
            <span className="ms-1 text-sm text-slate-500">st</span>
            {s.capacity ? <div className="text-xs text-slate-500">{Math.round((row.count / s.capacity) * 100)} % av salen</div> : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setV(String(row.count))
              setEdit(true)
            }}
          >
            <Pencil className="size-3.5" /> Ändra
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-2 flex gap-2">
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Antal"
            aria-label={`Antal personer – ${CHECKPOINT_LABEL[cp]}`}
            value={v}
            onChange={(e) => setV(e.target.value)}
            className="!py-3 text-center text-xl font-semibold"
          />
          <Button type="submit" loading={busy} variant={state === 'now' ? 'accent' : 'primary'}>
            Spara
          </Button>
        </form>
      )}
      <ErrorText>{err}</ErrorText>
    </div>
  )
}

function Extra({ s, extras }: { s: Session; extras: FlowCount[] }) {
  const save = useSaveCount()
  const [open, setOpen] = useState(false)
  const [v, setV] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
      {extras.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {extras.map((x) => (
            <li key={x.id}>
              <Badge tone="blue">
                Extra kl {localTime(x.counted_at)}: {x.count} st
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <form
          className="flex gap-2"
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
          <Input inputMode="numeric" placeholder="Antal just nu" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
          <Button type="submit" variant="secondary">
            Spara
          </Button>
        </form>
      ) : (
        <button className="inline-flex items-center gap-1 text-slate-600 hover:text-ink" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Extra räkning
        </button>
      )}
      <ErrorText>{err}</ErrorText>
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
    navigator.vibrate?.(12)
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
    <div className="space-y-5">
      <p className="text-sm text-slate-600">Ett tryck per gäst som kommer fram, och ett per sak som beställs.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {KITCHEN_CATS.map((c) => (
          <button
            key={c.key}
            onClick={() => tap(c.key)}
            className={cx(
              'relative flex min-h-28 flex-col items-center justify-center gap-1 rounded-2xl border bg-white p-3 shadow-sm transition select-none active:scale-[0.97] active:bg-ice',
              flash?.cat === c.key ? 'border-accent ring-2 ring-accent/40' : 'border-slate-200',
            )}
          >
            <c.icon className="size-7 text-ink" aria-hidden />
            <span className="text-base font-semibold text-ink">{c.label}</span>
            <span className="text-2xl font-bold text-ink">{sum(c.key)}</span>
            <span className="text-xs text-slate-500">senaste 15 min: {sum(c.key, cutoff)}</span>
            {flash?.cat === c.key && (
              <span className="absolute end-2 top-2 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white" aria-live="polite">
                +1
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={undo} disabled={!mine.length}>
          <Undo2 className="size-4" /> Ångra senaste
        </Button>
        <span className="text-xs text-slate-500">{mine.length ? `${mine.length} tryck från den här enheten` : ''}</span>
      </div>
      <ErrorText>{err}</ErrorText>

      <Card className="p-4">
        <h2 className="font-semibold text-ink">Kö just nu</h2>
        <form onSubmit={saveQueue} className="mt-2 flex gap-2">
          <Input inputMode="numeric" placeholder="Antal i kö" value={q} onChange={(e) => setQ(e.target.value)} className="text-center text-lg" />
          <Button type="submit">Spara</Button>
        </form>
        {queue.data.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            {queue.data.slice(0, 5).map((r) => (
              <li key={r.id} className="tabular-nums">
                kl {localTime(r.counted_at)} – <b className="text-ink">{r.count}</b> i kö
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
