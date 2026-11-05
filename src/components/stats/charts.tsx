// Små, beroendefria diagram (HTML/CSS) enligt dataviz-metoden:
// tunna staplar (≤24 px, 4 px rundad topp, rak mot baslinjen), hårfina rutnät,
// text i textfärger – aldrig i seriefärgen – och tooltip på hover/fokus.
// All text är minst 14 px och skrivs med gemener som vanlig text.
// Färgerna är kalla och hämtas från temat: ingen accent (den är reserverad för handlingar och "pågår nu").
import type { ReactNode } from 'react'
import { cx } from '../ui'

/**
 * Ordinal skala för svarsalternativ, bästa svaret först: mörkast = bäst, ljusast = sämst.
 * Texten inuti en del är vit på den mörka och bläck på de två ljusa (kontrast ≥ 4,5:1).
 */
export const ORDINAL = [
  { fill: 'var(--color-ink)', text: '#ffffff' },
  { fill: '#7d8aa3', text: 'var(--color-ink)' },
  { fill: '#c9d2de', text: 'var(--color-ink)' },
] as const
/** Enserie (staplar, mätare). */
const BAR = 'var(--color-ink-soft)'
export const INK = { primary: 'var(--color-ink)', secondary: 'var(--color-muted)', grid: 'var(--color-line)', axis: '#c9d2de' }
const TRACK = 'var(--color-line)'

/** Tooltip som visas när markören eller fokus ligger på föräldern (`group`). Värdet först, etiketten efter. */
export function Tip({ value, label, className }: { value: ReactNode; label: ReactNode; className?: string }) {
  return (
    <span
      role="tooltip"
      className={cx(
        'pointer-events-none absolute bottom-full start-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-white px-3 py-2 text-sm shadow-md group-hover:block group-focus-visible:block rtl:translate-x-1/2',
        className,
      )}
    >
      <b className="block text-base" style={{ color: INK.primary }}>{value}</b>
      <span style={{ color: INK.secondary }}>{label}</span>
    </span>
  )
}

/** Mätare: andel av ett tak (t.ex. publik mot salens kapacitet). */
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className="h-2 w-full overflow-hidden rounded-full"
      style={{ background: TRACK }}
    >
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: BAR }} />
    </div>
  )
}

function step(max: number) {
  const raw = Math.max(1, max / 4)
  const e = 10 ** Math.floor(Math.log10(raw))
  const f = raw / e
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e
}

export interface Column {
  key: string
  x: string // etikett under axeln (tom = ingen)
  tip: string
  value: number
}

/** Stapeldiagram med en serie. Endast högsta stapeln får ett direktvärde. Utan data: en mening i stället för tomma staplar. */
export function ColumnChart({
  data,
  height = 180,
  unit = 'st',
  label,
  empty = 'Inga svar ännu.',
}: {
  data: Column[]
  height?: number
  unit?: string
  label: string
  empty?: ReactNode
}) {
  const max = Math.max(0, ...data.map((d) => d.value))
  if (max === 0) return <p className="py-6 text-base text-muted">{empty}</p>
  const s = step(max)
  const top = Math.max(s, Math.ceil(max / s) * s)
  const ticks = Array.from({ length: Math.round(top / s) + 1 }, (_, i) => i * s)
  const peak = max > 0 ? data.findIndex((d) => d.value === max) : -1
  return (
    <figure aria-label={label}>
      <div className="flex" style={{ height }}>
        <div className="relative w-10 shrink-0 text-sm tabular-nums" style={{ color: INK.secondary }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute end-1.5 translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1 border-b" style={{ borderColor: INK.axis }}>
          {ticks.slice(1).map((t) => (
            <div key={t} className="absolute inset-x-0 border-t" style={{ bottom: `${(t / top) * 100}%`, borderColor: INK.grid }} aria-hidden />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => {
              const h = (d.value / top) * 100
              return (
                <div
                  key={d.key}
                  tabIndex={0}
                  aria-label={`${d.tip}: ${d.value} ${unit}`}
                  className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none focus-visible:bg-slate-100"
                >
                  {d.value > 0 && (
                    <div className="w-full max-w-6 transition group-hover:opacity-80" style={{ height: `${h}%`, background: BAR }} />
                  )}
                  {i === peak && (
                    <span className="absolute start-1/2 -translate-x-1/2 text-sm font-semibold tabular-nums rtl:translate-x-1/2" style={{ bottom: `calc(${h}% + 2px)`, color: INK.secondary }}>
                      {d.value}
                    </span>
                  )}
                  <Tip value={`${d.value} ${unit}`} label={d.tip} />
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="flex ps-10 pt-1.5 text-sm tabular-nums" style={{ color: INK.secondary }} aria-hidden>
        {data.map((d) => (
          <span key={d.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {d.x}
          </span>
        ))}
      </div>
    </figure>
  )
}

export interface Part {
  key: string
  label: string
  value: number
}

/**
 * Hög segmenterad stapel (32 px): en helhet uppdelad i delar, andel skriven inuti när den får plats.
 * Delarna ska komma i ordning från bästa till sämsta svaret – färgen följer platsen.
 * Utan svar visas texten "Inga svar ännu" i stället för en tom stapel.
 */
export function SegmentedBar({ parts, label, empty = 'Inga svar ännu.' }: { parts: Part[]; label: string; empty?: ReactNode }) {
  const total = parts.reduce((a, p) => a + p.value, 0)
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0)
  if (total === 0) return <p className="text-base text-muted">{empty}</p>
  return (
    <div>
      <div
        role="img"
        aria-label={`${label}: ${parts.map((p) => `${p.label} ${pct(p.value)} % (${p.value})`).join(', ')}`}
        className="flex h-8 w-full gap-[2px]"
      >
        {parts.map((p, i) => {
          const c = ORDINAL[Math.min(i, ORDINAL.length - 1)]
          return p.value > 0 ? (
            <div
              key={p.key}
              tabIndex={0}
              className="group relative flex h-full items-center ps-2 text-sm font-semibold outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ink-soft focus-visible:ring-offset-1"
              style={{ flexGrow: p.value, flexBasis: 0, background: c.fill, color: c.text }}
            >
              {p.value / total >= 0.16 && <span aria-hidden>{pct(p.value)} %</span>}
              <Tip value={`${pct(p.value)} % (${p.value})`} label={p.label} />
            </div>
          ) : null
        })}
      </div>
      <Legend items={parts.map((p) => p.label)} />
    </div>
  )
}

export function Legend({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: INK.secondary }}>
      {items.map((it, i) => (
        <li key={it} className="inline-flex items-center gap-1.5">
          <span className="size-3" style={{ background: ORDINAL[Math.min(i, ORDINAL.length - 1)].fill }} aria-hidden />
          {it}
        </li>
      ))}
    </ul>
  )
}

export interface Figure {
  label: string
  value: ReactNode
  sub?: ReactNode
}

/** Nyckeltal utan ramar: stora siffror på rad, avgränsade med hårfina linjer. */
export function KeyFigures({ items, className }: { items: Figure[]; className?: string }) {
  return (
    <dl className={cx('grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5', items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4', className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-base text-muted">{it.label}</dt>
          <dd className="mt-1 text-3xl font-semibold tabular-nums text-ink">{it.value}</dd>
          {it.sub && <dd className="mt-0.5 text-sm text-muted">{it.sub}</dd>}
        </div>
      ))}
    </dl>
  )
}
