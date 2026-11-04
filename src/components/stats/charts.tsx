// Små, beroendefria diagram (HTML/CSS) enligt dataviz-metoden:
// tunna staplar (≤24 px, 4 px rundad topp, rak mot baslinjen), hårfina rutnät,
// text i textfärger – aldrig i seriefärgen – och tooltip på hover/fokus.
import type { ReactNode } from 'react'
import { cx } from '../ui'

/** Kategoriska platser 1–3 (validerade mot vit yta, alla par: CVD ΔE ≥ 9,2). */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'] as const
export const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7' }
const TRACK = '#cde2fb' // ljusare steg av samma blå ramp

/** Tooltip som visas när markören eller fokus ligger på föräldern (`group`). Värdet först, etiketten efter. */
export function Tip({ value, label, className }: { value: ReactNode; label: ReactNode; className?: string }) {
  return (
    <span
      role="tooltip"
      className={cx(
        'pointer-events-none absolute bottom-full start-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md group-hover:block group-focus-visible:block rtl:translate-x-1/2',
        className,
      )}
    >
      <b className="block text-sm" style={{ color: INK.primary }}>{value}</b>
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
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SERIES[0] }} />
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

/** Stapeldiagram med en serie. Endast högsta stapeln får ett direktvärde. */
export function ColumnChart({ data, height = 180, unit = 'st', label }: { data: Column[]; height?: number; unit?: string; label: string }) {
  const max = Math.max(0, ...data.map((d) => d.value))
  const s = step(max)
  const top = Math.max(s, Math.ceil(max / s) * s)
  const ticks = Array.from({ length: Math.round(top / s) + 1 }, (_, i) => i * s)
  const peak = max > 0 ? data.findIndex((d) => d.value === max) : -1
  return (
    <figure aria-label={label}>
      <div className="flex" style={{ height }}>
        <div className="relative w-8 shrink-0 text-[10px] tabular-nums" style={{ color: INK.muted }} aria-hidden>
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
                    <div className="w-full max-w-6 rounded-t-[4px] transition group-hover:brightness-110" style={{ height: `${h}%`, background: SERIES[0] }} />
                  )}
                  {i === peak && (
                    <span className="absolute start-1/2 -translate-x-1/2 text-[11px] font-semibold tabular-nums rtl:translate-x-1/2" style={{ bottom: `calc(${h}% + 2px)`, color: INK.secondary }}>
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
      <div className="flex ps-8 pt-1 text-[10px] tabular-nums" style={{ color: INK.muted }} aria-hidden>
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

/** Hög segmenterad stapel (28 px): en helhet uppdelad i delar, andel skriven inuti när den får plats. */
export function SegmentedBar({ parts, label }: { parts: Part[]; label: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0)
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0)
  return (
    <div>
      <div
        role="img"
        aria-label={`${label}: ${parts.map((p) => `${p.label} ${pct(p.value)} % (${p.value})`).join(', ')}`}
        className="flex h-7 w-full gap-[2px]"
      >
        {total === 0 ? (
          <div className="h-full w-full rounded-[4px] bg-slate-100" />
        ) : (
          parts.map((p, i) =>
            p.value > 0 ? (
              <div
                key={p.key}
                tabIndex={0}
                className="group relative flex h-full items-center rounded-[4px] ps-2 text-xs font-semibold text-white outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-slate-400"
                style={{ flexGrow: p.value, flexBasis: 0, background: SERIES[i % SERIES.length] }}
              >
                {p.value / total >= 0.14 && <span aria-hidden>{pct(p.value)} %</span>}
                <Tip value={`${pct(p.value)} % (${p.value})`} label={p.label} />
              </div>
            ) : null,
          )
        )}
      </div>
      <Legend items={parts.map((p) => p.label)} />
    </div>
  )
}

export function Legend({ items }: { items: string[] }) {
  return (
    <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: INK.secondary }}>
      {items.map((it, i) => (
        <li key={it} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: SERIES[i % SERIES.length] }} aria-hidden />
          {it}
        </li>
      ))}
    </ul>
  )
}
