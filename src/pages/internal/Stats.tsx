import { useMemo, useState } from 'react'
import { Check, Download, Star, TriangleAlert } from 'lucide-react'
import { Button, Empty, PageHeader, Spinner, Tabs } from '../../components/ui'
import { ColumnChart, KeyFigures, Meter, SegmentedBar, type Column } from '../../components/stats/charts'
import { CHECKPOINT_LABEL, KITCHEN_CATS, catLabel, minuteOfDay } from '../../components/stats/labels'
import { useConference } from '../../lib/conference'
import { where } from '../../lib/db'
import { downloadCsv, num, tr } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { formatShortDate, formatShortDay, localDate, localTime, shiftTime, todayStr, zonedToUtc } from '../../lib/time'
import type { Feedback, FlowCount, KitchenCategory, KitchenEvent, Session } from '../../lib/types'

type Tab = 'hall' | 'kitchen' | 'feedback'
const MAIN = ['start_plus_5', 'midpoint', 'end_minus_5'] as const

export default function Stats() {
  const { days, currentDay } = useConference()
  const [tab, setTab] = useState<Tab>('hall')
  const [day, setDay] = useState<string | null>(null)
  const selected = day ?? currentDay?.date ?? todayStr()
  const from = zonedToUtc(selected, '00:00').toISOString()
  const to = zonedToUtc(selected, '23:59').toISOString()

  const sessions = useList('sessions', { order: [{ col: 'starts_at' }] })
  const counts = useList('flow_counts', { order: [{ col: 'counted_at' }] }, { pollMs: 60_000 })
  const feedback = useList('feedback', { order: [{ col: 'created_at', asc: false }] }, { pollMs: 60_000 })
  const events = useList('kitchen_events', { filters: [where('occurred_at', 'gte', from), where('occurred_at', 'lte', to)] }, { pollMs: 60_000 })

  const title = (id: string | null) => tr(sessions.data.find((s) => s.id === id)?.title, 'sv')
  const lectures = sessions.data.filter((s) => s.kind === 'lecture' && localDate(s.starts_at) === selected)

  // Nedladdningar längst ner på sidan, så att sidhuvudet bara har rubriken. Knappar utan data visas inte.
  const hasDownloads = counts.data.length > 0 || events.data.length > 0 || feedback.data.length > 0
  const exports = hasDownloads && (
    <section className="mt-12 border-t border-line pt-6">
      <h2 className="text-xl font-semibold text-ink">Ladda ner</h2>
      <p className="mt-1 text-base text-muted">CSV-filer som öppnas direkt i Excel eller Numbers.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {counts.data.length > 0 && (
          <Button
            variant="secondary"
            onClick={() =>
              downloadCsv(
                'rakningar.csv',
                ['Datum', 'Tid', 'Område', 'Föreläsning', 'Räknepunkt', 'Antal', 'Anteckning', 'Räknad av'],
                counts.data.map((c) => [localDate(c.counted_at), localTime(c.counted_at), c.area === 'hall' ? 'Salen' : 'Köket', title(c.session_id), CHECKPOINT_LABEL[c.checkpoint], c.count, c.note, c.author_name]),
              )
            }
          >
            <Download className="size-4" aria-hidden /> Alla räkningar
          </Button>
        )}
        {events.data.length > 0 && (
          <Button
            variant="secondary"
            onClick={() =>
              downloadCsv(
                `koksflode-${selected}.csv`,
                ['Datum', 'Tid', 'Kategori', 'Antal', 'Registrerad av'],
                events.data.map((e) => [localDate(e.occurred_at), localTime(e.occurred_at), catLabel(e.category), e.quantity, e.author_name]),
              )
            }
          >
            <Download className="size-4" aria-hidden /> Köksflödet {formatShortDay(selected)}
          </Button>
        )}
        {feedback.data.length > 0 && (
          <Button
            variant="secondary"
            onClick={() =>
              downloadCsv(
                'betyg.csv',
                ['Datum', 'Tid', 'Föreläsning', 'Stjärnor', 'Relevant', 'Längd', 'Ankomst', 'Kommentar', 'Språk'],
                feedback.data.map((f) => [
                  localDate(f.created_at), localTime(f.created_at), title(f.session_id), f.rating,
                  answerLabel('relevance', f.answers.relevance), answerLabel('length', f.answers.length), answerLabel('arrival', f.answers.arrival),
                  f.comment, f.lang,
                ]),
              )
            }
          >
            <Download className="size-4" aria-hidden /> Alla betyg
          </Button>
        )}
      </div>
    </section>
  )

  return (
    <>
      <PageHeader
        title="Statistik & betyg"
        subtitle="Publikflöde, köksflöde och besökarnas betyg, dag för dag."
      />
      <div className="mb-8 flex flex-wrap items-center gap-2">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'hall', label: 'Publik' },
            { value: 'kitchen', label: 'Köket' },
            { value: 'feedback', label: 'Betyg' },
          ]}
        />
        {days.length > 0 && (
          <Tabs value={selected} onChange={setDay} options={days.map((d) => ({ value: d.date, label: formatShortDay(d.date) }))} />
        )}
      </div>
      {sessions.loading || counts.loading || feedback.loading ? (
        <Spinner />
      ) : tab === 'hall' ? (
        <Audience lectures={lectures} counts={counts.data} feedback={feedback.data} />
      ) : tab === 'kitchen' ? (
        <KitchenStats events={events.data} queue={counts.data.filter((c) => c.area === 'kitchen' && localDate(c.counted_at) === selected)} />
      ) : (
        <Ratings lectures={lectures} feedback={feedback.data} />
      )}
      {exports}
    </>
  )
}

// ---------------------------------------------------------------- Publik

const pct = (v: number) => `${Math.round(v * 100)} %`

function Audience({ lectures, counts, feedback }: { lectures: Session[]; counts: FlowCount[]; feedback: Feedback[] }) {
  const rows = lectures.map((s) => {
    const c = Object.fromEntries(MAIN.map((k) => [k, counts.filter((x) => x.session_id === s.id && x.checkpoint === k).at(-1)?.count ?? null])) as Record<(typeof MAIN)[number], number | null>
    const ref = s.capacity ?? Math.max(0, ...MAIN.map((k) => c[k] ?? 0))
    const late = c.start_plus_5 != null && c.midpoint ? c.start_plus_5 < 0.85 * c.midpoint : null
    const early = c.end_minus_5 != null && c.midpoint ? c.end_minus_5 < 0.85 * c.midpoint : null
    const arr = feedback.filter((f) => f.session_id === s.id && f.answers.arrival)
    const lateShare = arr.length ? arr.filter((f) => f.answers.arrival === 'late').length / arr.length : null
    return { s, c, ref, late, early, lateShare, nArr: arr.length }
  })
  const counted = rows.filter((r) => MAIN.some((k) => r.c[k] != null))
  if (!lectures.length) return <Empty>Inga föreläsningar den här dagen.</Empty>
  if (!counted.length) return <Empty>Inga räkningar ännu. De dyker upp här när Ordning har räknat under Flödesräkning.</Empty>

  const fill = (k: (typeof MAIN)[number]) => {
    const xs = rows.filter((r) => r.s.capacity && r.c[k] != null).map((r) => r.c[k]! / r.s.capacity!)
    return xs.length ? pct(xs.reduce((a, b) => a + b, 0) / xs.length) : '–'
  }
  const judged = rows.filter((r) => r.late != null)
  const lateN = judged.filter((r) => r.late).length
  const arrivals = rows.reduce((a, r) => a + r.nArr, 0)
  const lateAll = rows.reduce((a, r) => a + (r.lateShare ?? 0) * r.nArr, 0)

  return (
    <div className="space-y-8">
      <KeyFigures
        items={[
          { label: 'Fyllnad 5 min efter start', value: fill('start_plus_5'), sub: 'snitt av salens kapacitet' },
          { label: 'Fyllnad vid mittpunkt', value: fill('midpoint') },
          { label: 'Fyllnad 5 min före slut', value: fill('end_minus_5') },
          { label: 'Publiken kom sent', value: judged.length ? `${lateN} av ${judged.length}` : '–', sub: 'föreläsningar' },
        ]}
      />

      {lateN > 0 && (
        <div className="flex gap-3 rounded-md bg-ice px-4 py-3 text-base text-ink">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden />
          <p>
            <b className="font-semibold">Publiken kommer sent på {lateN} av {judged.length} föreläsningar.</b> Prova ett förprogram, t.ex. poesi, 15
            minuter innan och börja visa in folk tidigare.
            {arrivals > 0 && ` I betygsformuläret svarade ${pct(lateAll / arrivals)} att de kom efter start.`}
          </p>
        </div>
      )}

      <div className="divide-y divide-line border-b border-line">
        {rows.map((r) => (
          <section key={r.s.id} className="py-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-muted tabular-nums">
                  {localTime(r.s.starts_at)}–{localTime(r.s.ends_at)}
                  {r.s.capacity ? ` · ${r.s.capacity} platser` : ''}
                </p>
                <h2 className="text-lg font-semibold text-ink">{tr(r.s.title, 'sv')}</h2>
              </div>
              {r.late ? (
                <p className="inline-flex items-center gap-1.5 text-base text-ink">
                  <TriangleAlert className="size-4 text-ink" aria-hidden /> Publiken kom sent
                </p>
              ) : r.late === false ? (
                <p className="inline-flex items-center gap-1.5 text-base text-muted">
                  <Check className="size-4" aria-hidden /> På plats i tid
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {MAIN.map((k) => (
                <div key={k}>
                  <div className="flex items-baseline justify-between gap-2 text-sm text-muted">
                    <span>{CHECKPOINT_LABEL[k]}</span>
                    {r.c[k] != null && r.s.capacity ? <span className="tabular-nums">{pct(r.c[k]! / r.s.capacity)}</span> : null}
                  </div>
                  <div className="my-1 text-2xl font-semibold tabular-nums text-ink">{r.c[k] ?? '–'}</div>
                  {r.c[k] != null && r.ref > 0 && <Meter value={r.c[k]!} max={r.ref} label={`${CHECKPOINT_LABEL[k]}: ${r.c[k]} av ${r.ref}`} />}
                </div>
              ))}
            </div>
            {(r.late || r.early || r.lateShare != null) && (
              <ul className="mt-4 space-y-1 text-base text-muted">
                {r.late && <li>Publiken kommer sent. Prova ett förprogram, t.ex. poesi, 15 minuter innan och börja visa in folk tidigare.</li>}
                {r.early && <li>Publiken gick innan slutet. Se över längden eller avslutningen.</li>}
                {r.lateShare != null && (
                  <li>
                    {pct(r.lateShare)} av {r.nArr} som svarade kom efter start.
                  </li>
                )}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Köket

const SLOT0 = 9 * 60
const SLOTS = 22 // 09:00–20:00 i halvtimmar

function KitchenStats({ events, queue }: { events: KitchenEvent[]; queue: FlowCount[] }) {
  const [cat, setCat] = useState<KitchenCategory | 'all'>('all')
  const slotOf = (e: KitchenEvent) => Math.floor((minuteOfDay(localTime(e.occurred_at)) - SLOT0) / 30)
  const slotLabel = (i: number) => `${shiftTime('09:00', i * 30)}–${shiftTime('09:00', (i + 1) * 30)}`

  const bins = useMemo(() => {
    const b: Record<string, number[]> = Object.fromEntries(['all', ...KITCHEN_CATS.map((c) => c.key)].map((k) => [k, Array(SLOTS).fill(0)]))
    let outside = 0
    for (const e of events) {
      const i = slotOf(e)
      if (i < 0 || i >= SLOTS) {
        outside += e.quantity
        continue
      }
      b[e.category][i] += e.quantity
      b.all[i] += e.quantity
    }
    return { b, outside }
  }, [events])

  if (!events.length && !queue.length) return <Empty>Inget registrerat i köket den här dagen ännu.</Empty>

  const series = bins.b[cat]
  const data: Column[] = series.map((v, i) => ({ key: String(i), x: i % 2 === 0 ? shiftTime('09:00', i * 30).slice(0, 2) : '', tip: slotLabel(i), value: v }))
  const top3 = series
    .map((v, i) => ({ v, i }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
  const peaks = KITCHEN_CATS.map((c) => {
    const s = bins.b[c.key]
    const total = s.reduce((a, b) => a + b, 0)
    const max = Math.max(...s)
    return { c, total, max, i: s.indexOf(max) }
  })

  return (
    <div className="space-y-10">
      <Tabs value={cat} onChange={setCat} options={[{ value: 'all' as const, label: 'Alla' }, ...KITCHEN_CATS.map((c) => ({ value: c.key, label: c.label }))]} />
      <section>
        <h2 className="text-lg font-semibold text-ink">Per halvtimme – {cat === 'all' ? 'alla registreringar' : catLabel(cat).toLowerCase()}</h2>
        <p className="mb-5 text-base text-muted">
          Totalt {num(series.reduce((a, b) => a + b, 0))} st mellan 09 och 20.
          {bins.outside > 0 && ` ${bins.outside} st registrerades utanför den tiden.`}
        </p>
        <ColumnChart data={data} label={`Köksflöde per halvtimme, ${cat === 'all' ? 'alla' : catLabel(cat)}`} empty="Inget registrerat ännu." />
      </section>

      <div className="grid gap-10 border-t border-line pt-6 sm:grid-cols-2 sm:gap-8">
        <section>
          <h2 className="text-lg font-semibold text-ink">Rusningstider</h2>
          {top3.length ? (
            <ol className="mt-2 divide-y divide-line text-base">
              {top3.map((x, n) => (
                <li key={x.i} className="flex justify-between gap-3 py-2 tabular-nums">
                  <span>
                    {n + 1}. {slotLabel(x.i)}
                  </span>
                  <b className="font-semibold text-ink">{x.v} st</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-base text-muted">Ingen data för valet.</p>
          )}
        </section>
        <section className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">När vill folk äta och fika?</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-base">
              <thead className="text-sm text-muted">
                <tr>
                  <th className="py-2 pe-3 text-start font-medium">Kategori</th>
                  <th className="py-2 pe-3 text-start font-medium">Toppen</th>
                  <th className="py-2 text-end font-medium">Totalt</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {peaks.map((p) => (
                  <tr key={p.c.key} className="border-t border-line">
                    <td className="py-2 pe-3">{p.c.label}</td>
                    <td className="whitespace-nowrap py-2 pe-3">{p.total ? `${slotLabel(p.i)} (${p.max})` : '–'}</td>
                    <td className="py-2 text-end">{p.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {queue.length > 0 && (
        <section className="border-t border-line pt-6">
          <h2 className="text-lg font-semibold text-ink">Kölängd</h2>
          <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-base sm:grid-cols-4">
            {queue.map((q) => (
              <li key={q.id} className="tabular-nums">
                <span className="text-muted">kl {localTime(q.counted_at)}:</span> <b className="font-semibold text-ink">{q.count}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Betyg

// Svarsalternativen står i ordning från bästa till sämsta svaret: diagrammens färger följer ordningen.
const QUESTIONS = [
  { key: 'relevance', label: 'Var innehållet relevant?', opts: [['yes', 'Ja'], ['partly', 'Delvis'], ['no', 'Nej']] },
  { key: 'length', label: 'Hur var längden?', opts: [['good', 'Lagom'], ['short', 'För kort'], ['long', 'För lång']] },
  { key: 'arrival', label: 'När kom de till salen?', opts: [['early', 'Före start'], ['ontime', 'Precis i tid'], ['late', 'Efter start']] },
] as const

function answerLabel(q: (typeof QUESTIONS)[number]['key'], v: string | undefined) {
  if (!v) return ''
  return (QUESTIONS.find((x) => x.key === q)!.opts as readonly (readonly [string, string])[]).find(([k]) => k === v)?.[1] ?? v
}

const avg = (fs: Feedback[]) => (fs.length ? fs.reduce((a, f) => a + f.rating, 0) / fs.length : 0)
const one = (n: number) => new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)

function Ratings({ lectures, feedback }: { lectures: Session[]; feedback: Feedback[] }) {
  const ids = new Set(lectures.map((s) => s.id))
  const day = feedback.filter((f) => ids.has(f.session_id))
  if (!lectures.length) return <Empty>Inga föreläsningar den här dagen.</Empty>
  if (!day.length) return <Empty>Inga betyg ännu. Besökarna kan betygsätta en föreläsning direkt när den är slut.</Empty>
  const rated = lectures.filter((s) => day.some((f) => f.session_id === s.id))

  return (
    <div className="space-y-8">
      <KeyFigures
        items={[
          { label: 'Snittbetyg', value: `${one(avg(day))} av 5` },
          { label: 'Antal svar', value: num(day.length) },
          { label: 'Föreläsningar med svar', value: `${rated.length} av ${lectures.length}` },
        ]}
      />
      <div className="divide-y divide-line border-b border-line">
        {lectures.map((s) => {
          const fs = day.filter((f) => f.session_id === s.id)
          const comments = fs.filter((f) => f.comment?.trim()).slice(0, 5)
          const dist = [5, 4, 3, 2, 1].map((n) => [n, fs.filter((f) => f.rating === n).length] as const)
          return (
            <section key={s.id} className="py-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-muted tabular-nums">
                    {localTime(s.starts_at)}–{localTime(s.ends_at)}
                    {s.speaker && ` · ${s.speaker}`}
                  </p>
                  <h2 className="text-lg font-semibold text-ink">{tr(s.title, 'sv')}</h2>
                </div>
                {fs.length > 0 && (
                  <div className="sm:text-end">
                    <div className="inline-flex items-center gap-1.5 text-2xl font-semibold tabular-nums text-ink">
                      <Star className="size-5 fill-accent text-accent-strong" aria-hidden /> {one(avg(fs))}
                    </div>
                    <div className="text-sm text-muted">{fs.length} svar</div>
                  </div>
                )}
              </div>
              {fs.length === 0 ? (
                <p className="mt-2 text-base text-muted">Inga svar ännu.</p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-muted tabular-nums">{dist.map(([n, c]) => `${n}★ ${c}`).join(' · ')}</p>
                  {!fs.some((f) => QUESTIONS.some((q) => f.answers?.[q.key])) ? (
                    <p className="mt-4 text-base text-muted">Inga svar på frågorna ännu.</p>
                  ) : (
                    <div className="mt-4 grid gap-5 sm:grid-cols-3">
                      {QUESTIONS.map((q) => (
                        <div key={q.key}>
                          <div className="mb-2 text-base font-medium text-ink">{q.label}</div>
                          <SegmentedBar
                            label={q.label}
                            parts={q.opts.map(([k, l]) => ({ key: k, label: l, value: fs.filter((f) => f.answers?.[q.key] === k).length }))}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {comments.length > 0 && (
                    <div className="mt-5">
                      <h3 className="mb-2 text-base font-medium text-ink">Senaste kommentarer</h3>
                      <ul className="space-y-3 text-base">
                        {comments.map((f) => (
                          <li key={f.id} className="border-s-2 border-line ps-3">
                            <q className="text-ink">{f.comment}</q>
                            <span className="block text-sm text-muted">
                              {f.rating}★ · {formatShortDate(f.created_at)} {localTime(f.created_at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
