// Konferensens namnlogotyp som på omslaget 2025: namnet i versaler på rader med exakt samma bredd,
// guldlinjen och årtalet under. Raderna blir lika breda genom att teckenstorleken räknas fram per rad
// (tecknen sträcks aldrig): varje rad mäts i Abril Fatface med canvas, och storleken sätts som
// lockupens bredd delad med radens bredd i em. Bredden uttrycks i containerenheter (cqi), så att
// allt skalar med utrymmet utan att mätas om vid varje storleksändring.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { lockupLines } from '../lib/lockup'
import { cx } from './ui'

const FACE = '"Abril Fatface"'
// Samma reserver som --font-display, så att mätningen stämmer även om webbtypsnittet uteblir
const STACK = `${FACE}, "Almarai", Georgia, "Times New Roman", serif`
// Lockupens radavstånd (line-height), som i spec 4.3
const LEADING = 0.8

/** Mått för en rad i em (vid teckenstorlek 1): bläckets bredd och hur långt bläcket börjar och slutar innanför radens bredd. */
interface Ink {
  width: number
  left: number
  right: number
}

interface Metrics {
  lines: Ink[]
  year: Ink
  /** Avstånd från årtalsradens överkant till siffrornas överkant, i em. Linjen läggs där. */
  digitTop: number
  /** True när mätningen gjorts i Abril Fatface (inte i en reserv). */
  exact: boolean
}

let canvas: HTMLCanvasElement | null = null

/** Uppskattning före mätning: ungefär 0,65 em per versal i Abril. */
function estimate(text: string): Ink {
  return { width: Math.max(1, text.length * 0.65), left: 0, right: 0 }
}

function measure(lines: string[], year: string): Metrics {
  const fallback: Metrics = { lines: lines.map(estimate), year: estimate(year || '2026'), digitTop: 0.0725, exact: false }
  if (typeof document === 'undefined') return fallback
  const exact = !!document.fonts?.check(`400 100px ${FACE}`, lines.join(''))
  canvas ??= document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return fallback
  ctx.font = `400 100px ${STACK}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const ink = (text: string): Ink => {
    const m = ctx.measureText(text)
    // actualBoundingBoxLeft är positiv när bläcket sticker ut till vänster om startpunkten
    const left = -m.actualBoundingBoxLeft
    const right = m.width - m.actualBoundingBoxRight
    const width = m.actualBoundingBoxLeft + m.actualBoundingBoxRight
    return width > 0 ? { width: width / 100, left: left / 100, right: right / 100 } : estimate(text)
  }
  const y = ctx.measureText(year || '2026')
  // Radens innehåll centreras i radhöjden: baslinjen ligger (radhöjd − (ascent + descent)) / 2 + ascent
  // under radens överkant, och siffrorna når actualBoundingBoxAscent över baslinjen.
  const asc = y.fontBoundingBoxAscent / 100
  const desc = y.fontBoundingBoxDescent / 100
  const digitTop = asc > 0 ? (LEADING - (asc + desc)) / 2 + asc - y.actualBoundingBoxAscent / 100 : fallback.digitTop
  return { lines: lines.map(ink), year: ink(year || '2026'), digitTop, exact }
}

/** Mäter raderna och mäter om när Abril Fatface har laddats. `ready` blir sant när måtten gäller rätt typsnitt (eller efter en kort väntan). */
function useLockupMetrics(lines: string[], year: string) {
  const key = `${lines.join('\n')}|${year}`
  const [state, setState] = useState(() => ({ key, m: measure(lines, year) }))
  const [waited, setWaited] = useState(false)
  const m = state.key === key ? state.m : measure(lines, year)

  useEffect(() => {
    let alive = true
    const update = () => alive && setState({ key, m: measure(lines, year) })
    update()
    const fonts = document.fonts
    if (fonts) {
      fonts.load(`400 100px ${FACE}`, lines.join('') + year).then(update, () => {})
      fonts.addEventListener?.('loadingdone', update)
    }
    // Uteblir typsnittet visas lockupen ändå, i reserven och med reservens mått
    const timer = window.setTimeout(() => alive && setWaited(true), 1500)
    return () => {
      alive = false
      window.clearTimeout(timer)
      fonts?.removeEventListener?.('loadingdone', update)
    }
    // key täcker både raderna och årtalet
  }, [key])

  return { m, ready: m.exact || waited }
}

/**
 * Konferensens namn som namnlogotyp, i en `h1` med namnet och årtalet som vanlig text för skärmläsare.
 * Allt i `children` (temarader, datumruta, platsrad) hamnar i samma behållare och kan använda
 * `var(--f2)`: teckenstorleken på lockupens sista rad, som avstånden i heron räknas i.
 * `compact` (konferensdagar): smalare lockup, så att "Nu & nästa" hamnar högt på telefonen.
 */
export function ConferenceLockup({ name, year, compact, children }: { name: string; year: string; compact?: boolean; children?: ReactNode }) {
  const lines = useMemo(() => lockupLines(name), [name])
  const { m, ready } = useLockupMetrics(lines, year)
  if (!lines.length) return null

  // Lockupens bredd. cqi avser behållaren nedan (hela heronas innerbredd).
  const width = compact ? 'min(70cqi, 20rem)' : 'min(100cqi, 30rem)'
  const size = (ink: Ink) => `calc(var(--lw) / ${ink.width.toFixed(4)})`
  // Årtalet och linjen sätts i sista radens storlek. Står namnet på en rad blir de hälften så stora,
  // ungefär som ÅRLIGA mot KONFERENSEN på omslaget.
  const last = m.lines[m.lines.length - 1]
  const f2 = lines.length > 1 ? size(last) : `calc(var(--lw) / ${(last.width * 1.93).toFixed(4)})`
  const plain = name.trim().replace(/\s+\d{4}$/, '')

  return (
    <div className="[container-type:inline-size]" style={{ '--lw': width, '--f2': f2 } as CSSProperties}>
      <h1>
        <span className="sr-only" lang="sv">{year ? `${plain} ${year}` : plain}</span>
        {/* Versalerna kommer från lockupLines och står bara i den dolda, visuella delen */}
        <span
          aria-hidden
          lang="sv"
          dir="ltr"
          className={cx(
            'mx-auto block w-(--lw) text-start font-display font-normal whitespace-nowrap text-white transition-opacity duration-300',
            ready ? 'opacity-100' : 'opacity-0',
          )}
          style={{ lineHeight: LEADING }}
        >
          {lines.map((l, i) => (
            <span
              key={i}
              className="block"
              // Bläcket börjar exakt vid lockupens vänsterkant och slutar vid dess högerkant
              style={{ fontSize: size(m.lines[i]), marginTop: i ? '0.1em' : 0, marginInlineStart: `${(-m.lines[i].left).toFixed(4)}em` }}
            >
              {l}
            </span>
          ))}
          <span className="mt-[0.07em] flex items-start gap-[0.16em]" style={{ fontSize: 'var(--f2)' }}>
            {/* Guldlinjen, 2 px, med överkanten i höjd med siffrornas överkant */}
            <span className="h-0.5 flex-1 bg-accent" style={{ marginTop: `${m.digitTop.toFixed(4)}em` }} />
            {year && <span style={{ marginInlineStart: `${(-m.year.left).toFixed(4)}em`, marginInlineEnd: `${(-m.year.right).toFixed(4)}em` }}>{year}</span>}
          </span>
        </span>
      </h1>
      {children}
    </div>
  )
}
