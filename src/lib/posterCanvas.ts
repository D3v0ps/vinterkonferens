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
  '800 30px Montserrat',
  '400 30px "Noto Sans Arabic"',
  '500 30px "Noto Sans Arabic"',
  '600 30px "Noto Sans Arabic"',
  '700 84px Amiri',
]

/**
 * Väntar på webbtypsnitten för just den text som ska ritas (Google Fonts delar upp snitten per
 * teckenintervall, så ett kort provord räcker inte för t.ex. arabiska eller ÅÄÖ). Högst fyra sekunder –
 * utan nät ritas affischen med reservsnitt. Returnerar false om tiden tog slut innan allt var laddat.
 */
async function loadFonts(sample: string): Promise<boolean> {
  if (!document.fonts?.load) return true
  let done = false
  const all = Promise.all(FACES.map((f) => document.fonts.load(f, sample).catch(() => []))).then(() => {
    done = true
  })
  await Promise.race([all, new Promise((r) => setTimeout(r, 4000))])
  return done
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

/** Delar ett ord som är bredare än `width` i bitar som får plats. */
function splitWord(ctx: Ctx, word: string, width: number): string[] {
  const parts: string[] = []
  let part = ''
  for (const ch of word) {
    if (part && ctx.measureText(part + ch).width > width) {
      parts.push(part)
      part = ch
    } else part += ch
  }
  if (part) parts.push(part)
  return parts
}

/**
 * Som wrap, men ger alltid ett resultat: för långa ord delas, och blir det fler än `maxLines` rader
 * kortas den sista med "…". Används när texten inte får plats ens med minsta storlek.
 */
function clampLines(ctx: Ctx, text: string, width: number, maxLines: number): string[] {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (ctx.measureText(w).width > width ? splitWord(ctx, w, width) : [w]))
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (!line || ctx.measureText(next).width <= width) line = next
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = `${kept[maxLines - 1]} ${lines[maxLines]}`
  while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1).trimEnd()
  kept[maxLines - 1] = `${last}…`
  return kept
}

interface Fitted {
  lines: string[]
  size: number
  /** Bredaste raden i den valda storleken. */
  width: number
}

/**
 * Väljer storlek och radbrytning: varje steg är [högst antal rader, storlekar att prova i ordning].
 * Får texten inte plats i något steg kortas den i sista stegets minsta storlek.
 */
function fitText(ctx: Ctx, text: string, width: number, steps: [number, number[]][], setFont: (size: number) => void): Fitted {
  const done = (lines: string[], size: number): Fitted => ({ lines, size, width: Math.max(0, ...lines.map((l) => ctx.measureText(l).width)) })
  for (const [maxLines, sizes] of steps) {
    for (const size of sizes) {
      setFont(size)
      const lines = wrap(ctx, text, width, maxLines)
      if (lines) return done(lines, size)
    }
  }
  const [maxLines, sizes] = steps[steps.length - 1]
  const size = sizes[sizes.length - 1]
  setFont(size)
  return done(clampLines(ctx, text, width, maxLines), size)
}

// Första starka bokstaven avgör riktningen, som dir="auto" i webbläsaren.
const STRONG = /[A-Za-z\u00C0-\u024F\u0370-\u04FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
const startsArabic = (text: string) => {
  const m = STRONG.exec(text)
  return !!m && ARABIC.test(m[0])
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
  /** Titeln är arabisk text (högerställs i kolumnen). */
  arabicTitle: boolean
  strong: boolean
  panel: boolean
  /** Talare med porträtt till höger om tabellen (alla utom paneler). */
  portrait: boolean
  photo: HTMLImageElement | null
}

interface Laid {
  row: Row
  cat: Fitted
  title: Fitted
  sub: string[]
  subSize: number
  /** Radens höjd, inklusive plats för porträttet och namnet under det. */
  height: number
  /** Porträttets mittpunkt räknat från radens överkant. */
  avatarY: number
}

/** "Sh. Mohammed Amin Kharraki" → ["SH. MOHAMMED", "AMIN KHARRAKI"] som under porträtten. */
function nameLines(name: string): [string, string] {
  const w = name.trim().toLocaleUpperCase('sv-SE').split(/\s+/)
  if (w.length < 2) return ['', w[0] ?? '']
  const cut = w.length - Math.floor(w.length / 2)
  return [w.slice(0, cut).join(' '), w.slice(cut).join(' ')]
}

/** Porträttets mått i skala k: radie, avstånd till namnraderna och hela namnblockets höjd. */
function portraitMetrics(k: number) {
  const r = Math.round(34 * k)
  const nameSize = Math.max(9, Math.round(11 * k))
  const gap1 = Math.max(nameSize + 3, Math.round(15 * k))
  const gap2 = Math.max(nameSize + 1, Math.round(12 * k))
  return { r, nameSize, gap1, gap2, below: gap1 + gap2 + 4 }
}

function drawAvatar(ctx: Ctx, cx: number, cy: number, k: number, row: Row, lang: Lang) {
  const { r, nameSize, gap1, gap2 } = portraitMetrics(k)
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
  ctx.lineWidth = Math.max(2, 3 * k)
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
  let y = cy + r + gap1
  if (a) {
    fitSize(ctx, a, maxW, nameSize, 8, (s) => font(ctx, 500, s, lang))
    ctx.fillText(a, cx, y)
    y += gap2
  }
  fitSize(ctx, b, maxW, nameSize, 8, (s) => font(ctx, 800, s, lang))
  ctx.fillText(b, cx, y)
  setSpacing(ctx, 0)
}

/** Felet när dagens program inte får plats ens med minsta texten. */
export const POSTER_OVERFLOW = 'Dagens program får inte plats på en bild. Korta några titlar eller dölj programpunkter som inte behöver vara med.'

export interface PosterResult {
  canvas: HTMLCanvasElement
  /** False om webbtypsnitten inte hann laddas; rita då om när document.fonts.ready är klart. */
  fontsLoaded: boolean
}

/** Ritar affischen på en canvas. Kastar ett fel med en svensk förklaring om programmet inte får plats. */
export async function renderPoster(input: PosterInput, target?: HTMLCanvasElement): Promise<PosterResult> {
  const { lang, date } = input
  const rtl = lang === 'ar'

  const sessions = [...input.sessions].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const numbers = lectureNumbers(sessions)
  const heading = capitalize(formatDay(date, lang, { weekday: 'long', day: 'numeric', month: 'long' }).replace(/[,،]/g, ''), lang)
  const base: Omit<Row, 'photo'>[] = sessions.map((s) => {
    const title = tr(s.title, lang)
    return {
      s,
      category: categoryLabel(s, lang, KIND[lang], numbers),
      time: `${localTime(s.starts_at)} - ${localTime(s.ends_at)}`,
      title,
      arabicTitle: startsArabic(title),
      strong: isTalk(s) || !!tr(s.label ?? undefined, lang),
      panel: s.kind === 'panel',
      portrait: s.kind !== 'panel' && !!s.speaker?.trim(),
    }
  })

  // Typsnitten laddas för exakt den text som ritas.
  const sample = [
    heading,
    input.conferenceName.toLocaleUpperCase('sv-SE'),
    date.slice(0, 4),
    (input.venue || '').toLocaleUpperCase('sv-SE'),
    EMPTY[lang],
    ...base.flatMap((r) => [r.category, r.time, r.title, r.s.speaker ?? '', (r.s.speaker ?? '').toLocaleUpperCase('sv-SE')]),
    'ÅÄÖ Aa 0123456789 بسم',
  ].join(' ')
  const [fontsLoaded, bg, logo, photos] = await Promise.all([
    loadFonts(sample),
    loadImage(brandImage('fasad-vinter.webp')),
    loadImage(brandImage('logo-horisontell-vit.png')),
    Promise.all(base.map((r) => (r.portrait ? speakerPhoto(r.s.speaker_photo) : Promise.resolve(null)))),
  ])
  const rows: Row[] = base.map((r, i) => ({ ...r, photo: photos[i] }))

  const canvas = target ?? document.createElement('canvas')
  canvas.width = POSTER_W
  canvas.height = POSTER_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Webbläsaren kan inte rita bilden.')
  ctx.textBaseline = 'alphabetic'

  // Kolumner i vänster-till-höger-koordinater; på arabiska speglas allt.
  const left = 157
  const right = 1100
  const X = (x: number) => (rtl ? POSTER_W - x : x)
  const start = rtl ? 'right' : 'left'
  const top = 474
  const bottom = 1340

  function layout(k: number) {
    const b = Math.round(30 * k)
    const pad = Math.round(14 * k)
    const rowFont = (row: Row, l: Lang = lang) => (size: number) => font(ctx!, row.strong ? 600 : 400, size, l)

    // Typkolumnen: högst ~300 px, långa egna etiketter bryts på två rader och krymper vid behov.
    const catCap = 300 * k
    const cats = rows.map((row) => fitText(ctx!, row.category, catCap, [[1, [b, Math.round(b * 0.9), Math.round(b * 0.8)]], [2, [Math.round(b * 0.8), Math.round(b * 0.7)]]], rowFont(row)))
    const catW = Math.min(catCap, Math.max(0, ...cats.map((c) => c.width)))
    font(ctx!, 600, b, 'sv')
    const timeW = Math.max(0, ...rows.map((r) => ctx!.measureText(r.time).width))
    const timeX = left + Math.max(250 * k, catW + 40 * k)
    const titleX = timeX + timeW + 45 * k
    const titleW = right - titleX
    const subSize = Math.round(17 * k)
    const pm = portraitMetrics(k)

    const laid: Laid[] = rows.map((row, i) => {
      // Titeln: en rad om det går, annars två i mindre storlek, i sista hand tre (och "…").
      const title = fitText(
        ctx!,
        row.title,
        titleW,
        [
          [1, [b, Math.round(b * 0.9), Math.round(b * 0.8)]],
          [2, [Math.round(b * 0.8), Math.round(b * 0.73), Math.round(b * 0.66)]],
          [3, [Math.round(b * 0.66)]],
        ],
        rowFont(row, row.arabicTitle ? 'ar' : lang),
      )
      let sub: string[] = []
      if (row.panel && row.s.speaker?.trim()) {
        font(ctx!, 500, subSize, lang)
        sub = clampLines(ctx!, row.s.speaker.trim(), titleW, 2)
      }
      const catBlock = cats[i].lines.length * cats[i].size * 1.22
      const titleBlock = title.lines.length * title.size * 1.22 + sub.length * subSize * 1.35
      const height = Math.max(62 * k, Math.max(catBlock, titleBlock) + 26 * k)
      // Porträttet centreras på raden men får inte sticka upp över linjen ovanför.
      const avatarY = Math.max(height / 2, pm.r + pad / 4)
      return { row, cat: cats[i], title, sub, subSize, height, avatarY }
    })

    // Porträtt och namn får hänga ner över rader utan eget porträtt (som på affischerna), men aldrig
    // in i nästa porträtt eller under tabellens sista linje: raden görs högre när det behövs.
    laid.forEach((l, i) => {
      if (!l.row.portrait) return
      let band = 0
      for (let j = i; j < laid.length && (j === i || !laid[j].row.portrait); j++) band += laid[j].height
      const need = l.avatarY + pm.r + pm.below + 6 * k
      if (band < need) l.height += need - band
    })
    return { laid, timeX, titleX, base: b, pad, total: laid.reduce((a, l) => a + l.height, 0) }
  }

  // Krymp allt i små steg tills tabellen får plats; går det inte ens i halv storlek blir det ett fel.
  let k = 1
  let L = layout(k)
  while (L.total > bottom - top && k > 0.5) {
    k = Math.max(0.5, Math.round((k - 0.02) * 100) / 100)
    L = layout(k)
  }
  if (L.total > bottom - top) throw new Error(POSTER_OVERFLOW)

  drawBackground(ctx, bg)
  drawLockup(ctx, input.conferenceName || 'Konferensen', date.slice(0, 4))
  drawLogo(ctx, logo)

  // Dagens rubrik
  ctx.fillStyle = WHITE
  ctx.textAlign = 'center'
  ctx.direction = rtl ? 'rtl' : 'ltr'
  fitSize(ctx, heading, 1000, 84, 48, (s) => (ctx.font = `400 ${s}px ${DISPLAY}`))
  ctx.fillText(heading, POSTER_W / 2, 412)

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
    for (const l of L.laid) {
      const { row } = l
      const weight = row.strong ? 600 : 400
      ctx.fillStyle = WHITE

      // Typ (en eller två rader) och tid på samma baslinje som typens första rad
      ctx.textAlign = start
      ctx.direction = rtl ? 'rtl' : 'ltr'
      font(ctx, weight, l.cat.size, lang)
      const catBase = y + L.pad + l.cat.size * 0.95
      l.cat.lines.forEach((t, i) => ctx.fillText(t, X(left), catBase + i * l.cat.size * 1.22))
      ctx.direction = 'ltr'
      ctx.textAlign = start
      font(ctx, weight, L.base, 'sv')
      ctx.fillText(row.time, X(L.timeX), y + L.pad + L.base * 0.95)

      // Titel: arabisk text högerställs i kolumnen, som på affischen
      const first = y + L.pad + l.title.size * 0.95
      ctx.direction = row.arabicTitle ? 'rtl' : 'ltr'
      ctx.textAlign = rtl ? (row.arabicTitle ? 'right' : 'left') : row.arabicTitle ? 'right' : 'left'
      const titleAnchor = rtl ? (row.arabicTitle ? X(L.titleX) : X(right)) : row.arabicTitle ? right : L.titleX
      font(ctx, weight, l.title.size, row.arabicTitle ? 'ar' : lang)
      l.title.lines.forEach((t, i) => ctx.fillText(t, titleAnchor, first + i * l.title.size * 1.22))
      if (l.sub.length) {
        font(ctx, 500, l.subSize, lang)
        const subArabic = startsArabic(l.sub[0])
        ctx.direction = subArabic ? 'rtl' : 'ltr'
        ctx.textAlign = start
        const subTop = first + (l.title.lines.length - 1) * l.title.size * 1.22 + l.subSize * 1.45
        l.sub.forEach((t, i) => ctx.fillText(t, X(L.titleX), subTop + i * l.subSize * 1.35))
      }

      // Porträtt till höger om tabellen (vänster på arabiska), alltid inom radens eget utrymme
      if (row.portrait) drawAvatar(ctx, X(right + 62), y + l.avatarY, k, row, lang)

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
  return { canvas, fontsLoaded }
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bilden kunde inte skapas.'))), 'image/png'),
  )
}
