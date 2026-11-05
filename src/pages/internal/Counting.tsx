import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Plus, RotateCw, Timer, Undo2 } from 'lucide-react'
import { Button, Empty, ErrorText, Input, PageHeader, Spinner, Tabs, cx } from '../../components/ui'
import { CHECKPOINT_LABEL, KITCHEN_CATS } from '../../components/stats/labels'
import { api } from '../../lib/api'
import { useAuth, useAuthorFields } from '../../lib/auth'
import { useConference } from '../../lib/conference'
import { eq, uuid, where } from '../../lib/db'
import { tr } from '../../lib/format'
import { useList, useNow } from '../../lib/hooks'
import { checkpointsFor, formatShortDay, localDate, localTime, now, relMinutes, zonedToUtc } from '../../lib/time'
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
/** Tysta textknappar i raderna (Ändra, Fyll i i efterhand, Avbryt). */
const QUIET = 'inline-flex min-h-11 shrink-0 items-center gap-1.5 text-base text-ink underline underline-offset-4 decoration-line hover:decoration-ink'

/** Minuter sedan räknetillfället (negativt = i framtiden). */
const since = (at: Date, t: Date) => (t.getTime() - at.getTime()) / 60_000

function cpState(at: Date, t: Date, done: boolean): CpState {
  if (done) return 'done'
  const d = since(at, t)
  if (d < -2) return 'upcoming'
  if (d <= 10) return 'now'
  return 'missed'
}

const fieldId = (sid: string, cp: Checkpoint) => `count-${sid}-${cp}`

function HallCounting() {
  const t = useNow(15_000)
  const { days, currentDay } = useConference()
  const today = localDate(t)
  const [day, setDay] = useState<string | null>(null)
  const selected = day ?? currentDay?.date ?? today
  const sessions = useList('sessions', { order: [{ col: 'starts_at' }] })
  const counts = useList('flow_counts', { filters: [eq('area', 'hall')], order: [{ col: 'counted_at' }] }, { pollMs: 30_000 })
  const [jump, setJump] = useState<string | null>(null)

  // Utan program eller räkningar vet vi inte vad som redan är räknat: visa ett fel i stället för tomma fält
  const failed = (!!sessions.error && !sessions.data.length) || (!!counts.error && !counts.data.length)
  const { reload: reloadSessions, error: sessionsError } = sessions
  const { reload: reloadCounts, error: countsError } = counts
  useEffect(() => {
    if (!sessionsError && !countsError) return
    const i = setInterval(() => {
      if (sessionsError) void reloadSessions()
      if (countsError) void reloadCounts()
    }, 8_000)
    return () => clearInterval(i)
  }, [sessionsError, countsError, reloadSessions, reloadCounts])

  const lectures = (date: string) => sessions.data.filter((s) => s.kind === 'lecture' && localDate(s.starts_at) === date)
  const find = (sid: string, cp: Checkpoint) => counts.data.filter((c) => c.session_id === sid && c.checkpoint === cp).at(-1)

  // Nästa räkning bland dagens föreläsningar (även om en annan dag visas)
  const next = useMemo(
    () =>
      lectures(today)
        .flatMap((s) => checkpointsFor(s).map((c) => ({ s, ...c })))
        .filter((c) => !find(c.s.id, c.key) && since(c.at, t) <= 10)
        .sort((x, y) => x.at.getTime() - y.at.getTime())[0],
    [sessions.data, counts.data, t],
  )

  // Bannern "Räkna nu" tar en till fältet: byt till idag och fokusera när raden finns
  useEffect(() => {
    if (!jump) return
    const el = document.getElementById(jump)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.focus({ preventScroll: true })
    setJump(null)
  }, [jump, selected])

  // Vänta också på räkningarna, annars visas sparade räknetillfällen en stund som tomma fält
  if (sessions.loading || counts.loading) return <Spinner />

  if (failed) {
    const noProgram = !!sessions.error && !sessions.data.length
    return (
      <div className="max-w-[65ch] space-y-3">
        <div role="alert">
          <h2 className="text-xl font-semibold text-ink">{noProgram ? 'Programmet gick inte att hämta' : 'Räkningarna gick inte att hämta'}</h2>
          <p className="mt-1 text-base text-ink">
            {noProgram
              ? 'Utan programmet vet sidan inte vilka föreläsningar som ska räknas.'
              : 'Utan dem syns det inte vad som redan är räknat, så fälten visas inte för att ingen ska räkna dubbelt.'}{' '}
            Sidan försöker igen av sig själv. Skriv upp antalet och klockslaget på papper under tiden.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            if (sessions.error) void sessions.reload()
            if (counts.error) void counts.reload()
          }}
        >
          <RotateCw className="size-4" aria-hidden /> Försök igen
        </Button>
      </div>
    )
  }

  const list = lectures(selected)
  const due = next && cpState(next.at, t, false) === 'now'

  return (
    <div className="space-y-6">
      {next ? (
        <div className="sticky top-[60px] z-10 -mb-2 bg-frost pb-2 lg:top-0">
          {due ? (
            <button
              type="button"
              onClick={() => {
                setDay(today)
                setJump(fieldId(next.s.id, next.key))
              }}
              className="flex w-full items-start gap-3 rounded-2xl bg-accent px-4 py-3 text-start text-base text-white shadow-sm hover:bg-accent-strong"
            >
              <Timer className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <b className="font-semibold">Räkna nu, kl {localTime(next.at)}</b>
                <span className="block">
                  {tr(next.s.title, 'sv')} – {CHECKPOINT_LABEL[next.key].toLowerCase()}
                </span>
              </span>
              <ArrowDown className="mt-0.5 size-5 shrink-0" aria-hidden />
            </button>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-base text-white shadow-sm">
              <Timer className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span className="min-w-0">
                <b className="font-semibold tabular-nums">
                  Nästa räkning kl {localTime(next.at)}, {relMinutes(Math.round(-since(next.at, t)))}
                </b>
                <span className="block text-white/85">
                  {tr(next.s.title, 'sv')} – {CHECKPOINT_LABEL[next.key].toLowerCase()}
                </span>
              </span>
            </div>
          )}
        </div>
      ) : (
        lectures(today).length > 0 && <p className="text-base text-muted">Inga fler räkningar idag.</p>
      )}

      {days.length > 1 && <Tabs value={selected} onChange={setDay} options={days.map((d) => ({ value: d.date, label: formatShortDay(d.date) }))} />}

      {(sessions.error || counts.error) && <p className="text-base text-muted">Kunde inte uppdatera just nu. Visar det som senast hämtades.</p>}

      {list.length === 0 ? (
        <Empty>Inga föreläsningar i programmet den här dagen.</Empty>
      ) : (
        <div className="space-y-10">
          {list.map((s) => (
            <Lecture key={s.id} s={s} t={t} today={today} rows={counts.data.filter((c) => c.session_id === s.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function Lecture({ s, t, today, rows }: { s: Session; t: Date; today: string; rows: FlowCount[] }) {
  const extras = rows.filter((r) => r.checkpoint === 'extra')
  const h = `lecture-${s.id}`
  return (
    <section aria-labelledby={h}>
      <p className="text-base text-muted tabular-nums">
        {localTime(s.starts_at)}–{localTime(s.ends_at)}
        {s.room && ` · ${s.room}`}
        {s.capacity ? ` · ${s.capacity} platser` : ''}
      </p>
      <h2 id={h} className="text-xl font-semibold text-ink">
        {tr(s.title, 'sv')}
      </h2>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {[
          ...checkpointsFor(s).map((cp) => ({ key: cp.key as string, cp: cp.key, at: cp.at, row: rows.filter((r) => r.checkpoint === cp.key).at(-1) })),
          ...extras.map((x) => ({ key: x.id, cp: 'extra' as const, at: new Date(x.counted_at), row: x })),
        ]
          // I tidsordning, så att en extra räkning hamnar där den hör hemma
          .sort((a, b) => a.at.getTime() - b.at.getTime())
          .map((c) => (
            <CheckpointRow key={c.key} s={s} cp={c.cp} at={c.at} t={t} today={today} row={c.row} />
          ))}
      </ul>
      <AddExtra s={s} />
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

/** Rubrikrad för ett räknetillfälle: "10:05 · 5 min efter start". Tyst för kommande och missade. */
function CpHead({ at, cp, tone = 'normal' }: { at: Date; cp: Checkpoint; tone?: 'strong' | 'normal' | 'quiet' }) {
  return (
    <p className="text-base">
      <span className={cx('tabular-nums', tone === 'quiet' ? 'font-medium text-muted' : 'font-semibold text-ink')}>{localTime(at)}</span>
      <span className={tone === 'strong' ? 'text-ink' : 'text-muted'}> · {CHECKPOINT_LABEL[cp]}</span>
    </p>
  )
}

function CheckpointRow({ s, cp, at, t, today, row }: { s: Session; cp: Checkpoint; at: Date; t: Date; today: string; row?: FlowCount }) {
  const save = useSaveCount()
  const [open, setOpen] = useState(false)
  const state = cp === 'extra' ? 'done' : cpState(at, t, !!row)
  const id = row && cp === 'extra' ? `count-${row.id}` : fieldId(s.id, cp)
  const store = async (n: number) => {
    await save(row, { session_id: s.id, area: 'hall', checkpoint: cp }, n)
    setOpen(false)
  }

  // Dags att räkna: det enda stora fältet och den enda accentknappen på sidan
  if (state === 'now')
    return (
      <li className="py-4">
        <CpHead at={at} cp={cp} tone="strong" />
        <CountForm id={id} accent onSave={store} />
      </li>
    )

  if (open)
    return (
      <li className="py-4">
        <CpHead at={at} cp={cp} tone="strong" />
        <CountForm
          id={id}
          initial={row ? String(row.count) : ''}
          hint={row ? undefined : `Fyll bara i om någon räknade kl ${localTime(at)}.`}
          onSave={store}
          onCancel={() => setOpen(false)}
        />
      </li>
    )

  if (state === 'done' && row)
    return (
      <li className="flex items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <CpHead at={at} cp={cp} />
          <p className="text-base text-muted tabular-nums">
            <b className="text-lg font-semibold text-ink">{row.count}</b> personer
            {s.capacity ? ` · ${Math.round((row.count / s.capacity) * 100)} % av salen` : ''}
          </p>
        </div>
        <button type="button" className={QUIET} onClick={() => setOpen(true)} aria-label={`Ändra ${CHECKPOINT_LABEL[cp].toLowerCase()} kl ${localTime(at)}`}>
          Ändra
        </button>
      </li>
    )

  if (state === 'missed')
    return (
      <li className="flex flex-wrap items-center justify-between gap-x-3 py-1.5">
        <CpHead at={at} cp={cp} tone="quiet" />
        <button type="button" className={QUIET} onClick={() => setOpen(true)} aria-label={`Fyll i ${CHECKPOINT_LABEL[cp].toLowerCase()} kl ${localTime(at)} i efterhand`}>
          Fyll i i efterhand
        </button>
      </li>
    )

  // Kommande: bara tid och hur länge det är kvar (nedräkningen bara för idag)
  return (
    <li className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 py-1.5">
      <CpHead at={at} cp={cp} tone="quiet" />
      {localDate(at) === today && <span className="text-base text-muted tabular-nums">{relMinutes(Math.round(-since(at, t)))}</span>}
    </li>
  )
}

/** Ett sifferfält med synlig etikett, ledtext och tydligt fel (GOV.UK-mönster). */
function CountForm({
  id,
  label = 'Antal personer i salen',
  hint,
  initial = '',
  accent,
  onSave,
  onCancel,
  autoFocus,
}: {
  id: string
  label?: string
  hint?: string
  initial?: string
  accent?: boolean
  onSave: (n: number) => Promise<void>
  onCancel?: () => void
  autoFocus?: boolean
}) {
  const [v, setV] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const describedBy = [hint && `${id}-hint`, err && `${id}-err`].filter(Boolean).join(' ') || undefined

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!v.trim()) return setErr('Skriv hur många som är i salen.')
    const n = parseCount(v)
    if (n == null) return setErr('Skriv antalet med siffror, till exempel 120.')
    setBusy(true)
    setErr(null)
    try {
      await onSave(n)
      setV('')
    } catch (e) {
      setErr('Det gick inte att spara: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3 max-w-md">
      <label htmlFor={id} className="block text-base font-medium text-ink">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-base text-muted">
          {hint}
        </p>
      )}
      {err && (
        <p id={`${id}-err`} className="mt-1 text-base font-medium text-rose-700" role="alert">
          {err}
        </p>
      )}
      <div className="mt-1.5 flex gap-2">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          autoFocus={autoFocus}
          aria-invalid={!!err}
          aria-describedby={describedBy}
          value={v}
          onChange={(e) => {
            setV(e.target.value)
            setErr(null)
          }}
          className={cx(BIG_INPUT, 'min-w-0 flex-1', err && 'border-rose-700')}
        />
        <Button type="submit" loading={busy} variant={accent ? 'accent' : 'primary'} className="min-h-14 shrink-0 px-6">
          Spara
        </Button>
      </div>
      {onCancel && (
        <button type="button" className={cx(QUIET, 'mt-1 text-muted')} onClick={onCancel}>
          Avbryt
        </button>
      )}
    </form>
  )
}

function AddExtra({ s }: { s: Session }) {
  const save = useSaveCount()
  const [open, setOpen] = useState(false)
  if (open)
    return (
      <div className="border-b border-line pb-4">
        <CountForm
          id={`extra-${s.id}`}
          hint="En räkning utöver de tre, till exempel när många går ut samtidigt."
          autoFocus
          onSave={async (n) => {
            await save(undefined, { session_id: s.id, area: 'hall', checkpoint: 'extra' }, n)
            setOpen(false)
          }}
          onCancel={() => setOpen(false)}
        />
      </div>
    )
  return (
    <button type="button" className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-base text-muted hover:text-ink" onClick={() => setOpen(true)}>
      <Plus className="size-4" aria-hidden /> Extra räkning
    </button>
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
  const [qErr, setQErr] = useState<string | null>(null)

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
  // Dagens tryck är inte hämtade än (eller gick inte att hämta): visa streck, inte 0, så ingen tror att räkningen nollställts
  const unknown = events.loading || (!!events.error && !events.data.length)

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
    if (!q.trim()) return setQErr('Skriv hur många som står i kö.')
    const n = parseCount(q)
    if (n == null) return setQErr('Skriv antalet med siffror, till exempel 8.')
    try {
      await api.insert('flow_counts', { session_id: null, area: 'kitchen', checkpoint: 'queue', count: n, counted_at: now().toISOString(), note: null, ...author() })
      setQ('')
      setQErr(null)
    } catch (e) {
      setQErr('Det gick inte att spara: ' + (e as Error).message)
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
            aria-label={`${c.label}: ${unknown ? 'hämtar dagens antal' : `${sum(c.key)} idag`}. Tryck för att lägga till en.`}
            className={cx(
              'relative flex min-h-32 flex-col items-center justify-center gap-1 rounded-2xl border bg-white p-3 transition select-none active:scale-[0.97] active:bg-ice',
              flash?.cat === c.key ? 'border-ink ring-2 ring-ink/25' : 'border-line hover:border-slate-400',
            )}
          >
            <c.icon className="size-7 text-ink" aria-hidden />
            <span className="text-base font-semibold text-ink">{c.label}</span>
            <span className={cx('text-3xl font-semibold tabular-nums', unknown ? 'text-muted' : 'text-ink')}>{unknown ? '–' : sum(c.key)}</span>
            <span className="text-base text-muted tabular-nums">senaste kvarten: {unknown ? '–' : sum(c.key, cutoff)}</span>
            {flash?.cat === c.key && (
              <span className="absolute end-3 top-2 text-base font-semibold text-ink tabular-nums" aria-hidden>
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
      {events.error && !events.data.length && <ErrorText>Kunde inte hämta dagens antal. Försöker igen om en stund.</ErrorText>}

      <section className="border-t border-line pt-6">
        <h2 className="text-xl font-semibold text-ink">Kö just nu</h2>
        <form onSubmit={saveQueue} noValidate className="mt-3 max-w-md">
          <label htmlFor="kitchen-queue" className="block text-base font-medium text-ink">
            Antal personer i kö
          </label>
          <p id="kitchen-queue-hint" className="text-base text-muted">
            Räkna alla som står i kön just nu.
          </p>
          {qErr && (
            <p id="kitchen-queue-err" className="mt-1 text-base font-medium text-rose-700" role="alert">
              {qErr}
            </p>
          )}
          <div className="mt-1.5 flex gap-2">
            <Input
              id="kitchen-queue"
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={!!qErr}
              aria-describedby={qErr ? 'kitchen-queue-hint kitchen-queue-err' : 'kitchen-queue-hint'}
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setQErr(null)
              }}
              className={cx(BIG_INPUT, 'min-w-0 flex-1', qErr && 'border-rose-700')}
            />
            <Button type="submit" className="min-h-14 shrink-0 px-6">
              Spara
            </Button>
          </div>
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
