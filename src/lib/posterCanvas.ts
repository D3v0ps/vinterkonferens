// Ritar en dags schema som affisch (1300 × 1500 px), i samma stil som konferensens schemaaffischer:
// fasaden under en blå ton, konferensens namn i Abril Fatface, dagen som rubrik och en tabell i
// Montserrat med guldlinjer och talarnas porträtt till höger.
import { brandImage } from '../components/Brand'
import { cachedFileUrl, initials } from '../components/SpeakerAvatar'
import { tr } from './format'
import { categoryLabel, isTalk, lectureNumbers } from './sessions'
import { formatDay, localTime } from './time'
import type { Lang, Session } from './types'

export const POSTER_W = 1300
export const POSTER_H = 1500

export interface PosterInput {
  conferenceName: string
  venue: string
  /** YYYY-MM-DD */
  date: string
  lang: Lang
  /** Dagens programpunkter (vuxna och alla), i tidsordning. */
  sessions: Session[]
}

// Typernas namn i schemats första kolumn, på affischens språk (samma ord som på besökarsidan).
const KIND: Record<Lang, Record<string, string>> = {
  sv: { kind_lecture: 'Föreläsning', kind_panel: 'Panel', kind_prayer: 'Bön', kind_break: 'Rast', kind_meal: 'Mat', kind_preshow: 'Förprogram', kind_activity: 'Aktivitet', kind_other: 'Program' },
  en: { kind_lecture: 'Lecture', kind_panel: 'Panel', kind_prayer: 'Prayer', kind_break: 'Break', kind_meal: 'Meal', kind_preshow: 'Pre-show', kind_activity: 'Activity', kind_other: 'Programme' },
  ar: { kind_lecture: 'محاضرة', kind_panel: 'ندوة', kind_prayer: 'صلاة', kind_break: 'استراحة', kind_meal: 'وجبة', kind_preshow: 'برنامج تمهيدي', kind_activity: 'نشاط', kind_other: 'برنامج' },
}
const EMPTY: Record<Lang, string> = { sv: 'Inget program för dagen ännu.', en: 'No programme for this day yet.', ar: 'لا يوجد برنامج لهذا اليوم بعد.' }

const GOLD = '#c5b358'
const WHITE = '#ffffff'
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
const DISPLAY = '"Abril Fatface", Amiri, Georgia, serif'

// ---------------------------------------------------------------- Laddning

const FACES = [
  '400 84px "Abril Fatface"',
  '400 30px Montserrat',
  '500 30px Montserrat',
  '600 30px Montserrat',
  '700 30px Montserrat',
  '400 30px "Noto Sans Arabic"',
  '600 30px "Noto Sans Arabic"',
  '700 84px Amiri',
]

/** Väntar på webbtypsnitten (högst några sekunder – utan nät ritas affischen med reservsnitt). */
async function loadFonts(): Promise<void> {
  if (!document.fonts?.load) return
  const all = Promise.all(FACES.map((f) => document.fonts.load(f, f.includes('Arabic') || f.includes('Amiri') ? 'بسم' : 'ÅÄÖ Aa 09').catch(() => [])))
  await Promise.race([all, new Promise((r) => setTimeout(r, 4000))])
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    // Bilder från en annan domän (Supabase) måste hämtas med CORS, annars går affischen inte att spara.
    if (/^https?:/i.test(src) && new URL(src, location.href).origin !== location.origin) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function speakerPhoto(path: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!path) return null
  const url = await cachedFileUrl('speakers', path)
  return url ? loadImage(url) : null
}

// ---------------------------------------------------------------- Hjälpare

type Ctx = CanvasRenderingContext2D

function font(ctx: Ctx, weight: number, size: number, lang: Lang, family?: string) {
  const fam = family ?? (lang === 'ar' ? '"Noto Sans Arabic", Montserrat, sans-serif' : 'Montserrat, "Noto Sans Arabic", sans-serif')
  ctx.font = `${weight} ${size}px ${fam}`
}

function setSpacing(ctx: Ctx, px: number) {
  const c = ctx as Ctx & { letterSpacing?: string }
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`
}

/** Delar en text i rader som får plats i `width`. Null om det inte går på `maxLines` rader. */
function wrap(ctx: Ctx, text: string, width: number, maxLines: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width <= width || !line) line = next
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines || lines.some((l) => ctx.measureText(l).width > width)) return null
  return lines
}

/** Krymper typsnittet tills texten får plats på en rad. Returnerar storleken. */
function fitSize(ctx: Ctx, text: string, width: number, size: number, min: number, set: (s: number) => void): number {
  let s = size
  set(s)
  while (s > min && ctx.measureText(text).width > width) {
    s -= 1
    set(s)
  }
  return s
}

function capitalize(s: string, lang: Lang) {
  return s.charAt(0).toLocaleUpperCase(lang === 'sv' ? 'sv-SE' : lang) + s.slice(1)
}

// ---------------------------------------------------------------- Bakgrund, namn och logga

function drawBackground(ctx: Ctx, photo: HTMLImageElement | null) {
  ctx.fillStyle = '#2f3c86'
  ctx.fillRect(0, 0, POSTER_W, POSTER_H)
  if (photo) {
    const scale = Math.max(POSTER_W / photo.naturalWidth, POSTER_H / photo.naturalHeight) * 1.04
    const w = photo.naturalWidth * scale
    const h = photo.naturalHeight * scale
    ctx.save()
    // Mjukt foto, som på affischerna: det ska ge stämning, inte konkurrera med texten.
    ctx.filter = 'blur(3px)'
    ctx.drawImage(photo, (POSTER_W - w) / 2, (POSTER_H - h) / 2, w, h)
    ctx.restore()
  }
  // Blå ton: ljusare blå upptill, dragning mot lila nertill (provtaget från 2025 års affischer).
  const g = ctx.createLinearGradient(0, 0, 0, POSTER_H)
  g.addColorStop(0, 'rgba(44, 58, 130, 0.84)')
  g.addColorStop(0.55, 'rgba(42, 54, 128, 0.84)')
  g.addColorStop(1, 'rgba(58, 54, 126, 0.84)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, POSTER_W, POSTER_H)
}

// Ett sammansatt namn delas som "ÅRLIGA / KONFERENSEN" på affischen: "VINTER / KONFERENSEN".
const SPLIT = /^(.{3,}?)(KONFERENSEN|KONFERENS|CONFERENCE|DAGARNA|DAGEN|HELGEN)$/

/** Konferensens namn som på affischen: första ordet stort, resten under, guldlinje och årtal. */
function drawLockup(ctx: Ctx, name: string, year: string) {
  let words = name.trim().toLocaleUpperCase('sv-SE').split(/\s+/).filter(Boolean)
  if (!words.length) return
  const m = words.length === 1 ? SPLIT.exec(words[0]) : null
  if (m) words = [m[1], m[2]]
  const x = 68
  const target = words.length > 1 ? 420 : 470
  ctx.fillStyle = WHITE
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.direction = 'ltr'
  setSpacing(ctx, 0)

  const first = words[0]
  const s1 = Math.min(118, fitSize(ctx, first, target, 140, 30, (s) => (ctx.font = `400 ${s}px ${DISPLAY}`)))
  ctx.font = `400 ${s1}px ${DISPLAY}`
  const w1 = ctx.measureText(first).width
  let y = 70 + s1 * 0.74
  ctx.fillText(first, x, y)
  let width = w1
  let size = s1

  if (words.length > 1) {
    const rest = words.slice(1).join(' ')
    const s2 = Math.min(s1 * 0.6, fitSize(ctx, rest, Math.max(w1, 300), 120, 24, (s) => (ctx.font = `400 ${s}px ${DISPLAY}`)))
    ctx.font = `400 ${s2}px ${DISPLAY}`
    y += s2 * 0.88
    ctx.fillText(rest, x, y)
    width = Math.max(w1, ctx.measureText(rest).width)
    size = s2
  }

  // Årtalet högerställt under namnet, guldlinjen fram till det.
  const ys = Math.max(40, Math.min(56, size))
  ctx.font = `400 ${ys}px ${DISPLAY}`
  const yw = ctx.measureText(year).width
  const lineY = y + 10
  ctx.fillStyle = GOLD
  ctx.fillRect(x, lineY, Math.max(80, width - yw - 14), 3)
  ctx.fillStyle = WHITE
  ctx.fillText(year, x + width - yw, lineY + ys * 0.72)
}

function drawLogo(ctx: Ctx, logo: HTMLImageElement | null) {
  if (!logo) return
  const w = 240
  const h = (logo.naturalHeight / logo.naturalWidth) * w
  ctx.drawImage(logo, POSTER_W - 50 - w, 62, w, h)
}

// ---------------------------------------------------------------- Tabellen

interface Row {
  s: Session
  category: string
  time: string
  title: string
  strong: boolean
  panel: boolean
  photo: HTMLImageElement | null
}

interface Laid {
  row: Row
  titleLines: string[]
  titleSize: number
  sub: string[]
  subSize: number
  height: number
}

/** "Sh. Mohammed Amin Kharraki" → ["SH. MOHAMMED", "AMIN KHARRAKI"] som under porträtten. */
function nameLines(name: string): [string, string] {
  const w = name.trim().toLocaleUpperCase('sv-SE').split(/\s+/)
  if (w.length < 2) return ['', w[0] ?? '']
  const cut = w.length - Math.floor(w.length / 2)
  return [w.slice(0, cut).join(' '), w.slice(cut).join(' ')]
}

function drawAvatar(ctx: Ctx, cx: number, cy: number, r: number, row: Row, lang: Lang) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()
  if (row.photo) {
    ctx.save()
    ctx.clip()
    const img = row.photo
    const scale = Math.max((2 * r) / img.naturalWidth, (2 * r) / img.naturalHeight)
    const w = img.naturalWidth * scale
    const h = img.naturalHeight * scale
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
    ctx.restore()
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
    ctx.fill()
    ctx.fillStyle = WHITE
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.direction = 'ltr'
    font(ctx, 600, Math.round(r * 0.62), 'sv')
    ctx.fillText(initials(row.s.speaker ?? ''), cx, cy + 1)
  }
  ctx.lineWidth = 3
  ctx.strokeStyle = WHITE
  ctx.stroke()
  ctx.restore()

  // Namnet i små versaler under porträttet: förnamn tunt, efternamn fett.
  const [a, b] = nameLines(row.s.speaker ?? '')
  ctx.fillStyle = WHITE
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.direction = 'ltr'
  setSpacing(ctx, 0.3)
  const maxW = 2 * r + 46
  let y = cy + r + 15
  if (a) {
    fitSize(ctx, a, maxW, 11, 8, (s) => font(ctx, 500, s, lang))
    ctx.fillText(a, cx, y)
    y += 12
  }
  fitSize(ctx, b, maxW, 11, 8, (s) => font(ctx, 800, s, lang))
  ctx.fillText(b, cx, y)
  setSpacing(ctx, 0)
}

/** Ritar affischen på en canvas och returnerar den. */
export async function renderPoster(input: PosterInput, target?: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const { lang, date } = input
  const rtl = lang === 'ar'
  const [, bg, logo] = await Promise.all([loadFonts(), loadImage(brandImage('fasad-vinter.webp')), loadImage(brandImage('logo-horisontell-vit.png'))])

  const sessions = [...input.sessions].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const numbers = lectureNumbers(sessions)
  const photos = await Promise.all(sessions.map((s) => (s.kind !== 'panel' && s.speaker ? speakerPhoto(s.speaker_photo) : Promise.resolve(null))))
  const rows: Row[] = sessions.map((s, i) => ({
    s,
    category: categoryLabel(s, lang, KIND[lang], numbers),
    time: `${localTime(s.starts_at)} - ${localTime(s.ends_at)}`,
    title: tr(s.title, lang),
    strong: isTalk(s) || !!tr(s.label ?? undefined, lang),
    panel: s.kind === 'panel',
    photo: photos[i],
  }))

  const canvas = target ?? document.createElement('canvas')
  canvas.width = POSTER_W
  canvas.height = POSTER_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Webbläsaren kan inte rita bilden.')
  ctx.textBaseline = 'alphabetic'

  drawBackground(ctx, bg)
  drawLockup(ctx, input.conferenceName || 'Konferensen', date.slice(0, 4))
  drawLogo(ctx, logo)

  // Dagens rubrik
  ctx.fillStyle = WHITE
  ctx.textAlign = 'center'
  ctx.direction = rtl ? 'rtl' : 'ltr'
  const heading = capitalize(formatDay(date, lang, { weekday: 'long', day: 'numeric', month: 'long' }).replace(/[,،]/g, ''), lang)
  fitSize(ctx, heading, 1000, 84, 48, (s) => (ctx.font = `400 ${s}px ${DISPLAY}`))
  ctx.fillText(heading, POSTER_W / 2, 412)

  // Kolumner i vänster-till-höger-koordinater; på arabiska speglas allt.
  const left = 157
  const right = 1100
  const X = (x: number) => (rtl ? POSTER_W - x : x)
  const start = rtl ? 'right' : 'left'
  const top = 474
  const bottom = 1340

  function layout(k: number) {
    const base = Math.round(30 * k)
    font(ctx!, 600, base, lang)
    const catW = Math.max(...rows.map((r) => ctx!.measureText(r.category).width), 0)
    const timeW = Math.max(...rows.map((r) => ctx!.measureText(r.time).width), 0)
    const timeX = left + Math.max(250 * k, catW + 40 * k)
    const titleX = timeX + timeW + 45 * k
    const titleW = right - titleX
    const laid: Laid[] = rows.map((row) => {
      let size = base
      let lines: string[] | null = null
      for (const s of [base, Math.round(base * 0.9), Math.round(base * 0.8)]) {
        font(ctx!, row.strong ? 600 : 400, s, lang)
        lines = wrap(ctx!, row.title, titleW, 1)
        if (lines) {
          size = s
          break
        }
      }
      if (!lines) {
        for (const s of [Math.round(base * 0.8), Math.round(base * 0.73), Math.round(base * 0.66)]) {
          font(ctx!, row.strong ? 600 : 400, s, lang)
          lines = wrap(ctx!, row.title, titleW, 2)
          size = s
          if (lines) break
        }
      }
      if (!lines) {
        font(ctx!, 600, size, lang)
        lines = wrap(ctx!, row.title, titleW, 3) ?? [row.title]
      }
      const subSize = Math.round(17 * k)
      let sub: string[] = []
      if (row.panel && row.s.speaker) {
        font(ctx!, 500, subSize, lang)
        sub = wrap(ctx!, row.s.speaker, titleW, 2) ?? [row.s.speaker]
      }
      const lineH = size * 1.22
      const content = lines.length * lineH + sub.length * subSize * 1.35
      const height = Math.max(62 * k, content + 26 * k)
      return { row, titleLines: lines, titleSize: size, sub, subSize, height }
    })
    return { laid, timeX, titleX, titleW, base, total: laid.reduce((a, l) => a + l.height, 0) }
  }

  let L = layout(1)
  if (L.total > bottom - top) L = layout(Math.max(0.6, ((bottom - top) / L.total) * 0.98))

  const rule = (y: number) => {
    ctx.globalAlpha = 0.85
    ctx.fillStyle = GOLD
    ctx.fillRect(rtl ? POSTER_W - right : left, y - 1, right - left, 2)
    ctx.globalAlpha = 1
  }

  if (!rows.length) {
    rule(top)
    ctx.fillStyle = WHITE
    ctx.textAlign = 'center'
    font(ctx, 500, 30, lang)
    ctx.fillText(EMPTY[lang], POSTER_W / 2, top + 70)
    rule(top + 110)
  } else {
    rule(top)
    let y = top
    let avatarFloor = 0
    for (const l of L.laid) {
      const { row } = l
      const pad = Math.round(14 * (L.base / 30))
      const first = y + pad + l.titleSize * 0.95
      const catSize = L.base
      ctx.fillStyle = WHITE

      // Typ och tid
      ctx.textAlign = start
      ctx.direction = rtl ? 'rtl' : 'ltr'
      font(ctx, row.strong ? 600 : 400, catSize, lang)
      const catBase = y + pad + catSize * 0.95
      ctx.fillText(row.category, X(left), catBase)
      ctx.direction = 'ltr'
      ctx.textAlign = start
      font(ctx, row.strong ? 600 : 400, catSize, 'sv')
      ctx.fillText(row.time, X(L.timeX), catBase)

      // Titel: arabisk text högerställs i kolumnen, som på affischen
      const arabicTitle = ARABIC.test(row.title)
      ctx.direction = arabicTitle ? 'rtl' : 'ltr'
      const titleAlign = rtl ? (arabicTitle ? 'right' : 'left') : arabicTitle ? 'right' : 'left'
      const titleAnchor = rtl ? (arabicTitle ? X(L.titleX) : X(right)) : arabicTitle ? right : L.titleX
      ctx.textAlign = titleAlign
      font(ctx, row.strong ? 600 : 400, l.titleSize, arabicTitle ? 'ar' : lang)
      l.titleLines.forEach((t, i) => ctx.fillText(t, titleAnchor, first + i * l.titleSize * 1.22))
      if (l.sub.length) {
        font(ctx, 500, l.subSize, lang)
        ctx.direction = rtl ? 'rtl' : 'ltr'
        ctx.textAlign = start
        const subTop = first + (l.titleLines.length - 1) * l.titleSize * 1.22 + l.subSize * 1.45
        l.sub.forEach((t, i) => ctx.fillText(t, X(L.titleX), subTop + i * l.subSize * 1.35))
      }

      // Porträtt till höger om tabellen (vänster på arabiska)
      if (row.s.speaker && !row.panel) {
        const r = 34
        const cy = Math.max(y + l.height / 2, avatarFloor + r + 4)
        drawAvatar(ctx, X(right + 62), cy, r, row, lang)
        avatarFloor = cy + r + 32
      }

      y += l.height
      rule(y)
    }
  }

  // Sidfot: platsen i spärrade versaler
  const venue = (input.venue || '').trim()
  if (venue) {
    ctx.fillStyle = WHITE
    ctx.textAlign = 'center'
    ctx.direction = 'ltr'
    setSpacing(ctx, 1.6)
    const text = venue.toLocaleUpperCase('sv-SE').replace(/\s*[,|]\s*/g, ' | ')
    fitSize(ctx, text, 1100, 19, 13, (s) => font(ctx, 500, s, 'sv'))
    ctx.fillText(text, POSTER_W / 2, 1408)
    setSpacing(ctx, 0)
  }
  return canvas
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bilden kunde inte skapas.'))), 'image/png'),
  )
}
