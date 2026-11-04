// Tidshjälpare. All visning sker i svensk tid (Europe/Stockholm) oavsett enhetens zon.
import type { Lang, Session } from './types'

export const TZ = 'Europe/Stockholm'

// ---------- "Tidsmaskin": förhandsgranska sidan som om det vore en annan tid ----------
// Sätts med ?tid=2026-11-06T10:40 i adressen (eller via demobannern). ?tid=nu nollställer.
const OFFSET_KEY = 'vk-time-offset'

function readOffset(): number {
  try {
    return Number(sessionStorage.getItem(OFFSET_KEY) || 0) || 0
  } catch {
    return 0
  }
}

let offsetMs = readOffset()

export function setSimulatedTime(local: string | null) {
  if (!local || local === 'nu') {
    offsetMs = 0
  } else {
    const [d, t] = local.split('T')
    const target = zonedToUtc(d, (t || '12:00').slice(0, 5)).getTime()
    offsetMs = target - Date.now()
  }
  try {
    if (offsetMs) sessionStorage.setItem(OFFSET_KEY, String(offsetMs))
    else sessionStorage.removeItem(OFFSET_KEY)
  } catch {
    /* privat läge */
  }
  window.dispatchEvent(new Event('vk-time'))
}

export function isSimulated() {
  return offsetMs !== 0
}

export function initTimeFromUrl() {
  const p = new URLSearchParams(window.location.search).get('tid')
  if (p) setSimulatedTime(p)
}

export function now(): Date {
  return new Date(Date.now() + offsetMs)
}

// ---------- Tidszonsomvandling ----------
function partsInTz(d: Date) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const o: Record<string, string> = {}
  for (const p of f.formatToParts(d)) o[p.type] = p.value
  return o
}

/** Svenskt lokalt datum + klockslag → riktig tidpunkt. */
export function zonedToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const p = partsInTz(new Date(guess))
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  return new Date(guess - (asIfUtc - guess))
}

/** Tidpunkt → 'YYYY-MM-DD' i svensk tid. */
export function localDate(d: Date | string): string {
  const p = partsInTz(typeof d === 'string' ? new Date(d) : d)
  return `${p.year}-${p.month}-${p.day}`
}

/** Tidpunkt → 'HH:MM' i svensk tid. */
export function localTime(d: Date | string): string {
  const p = partsInTz(typeof d === 'string' ? new Date(d) : d)
  return `${p.hour}:${p.minute}`
}

export function todayStr(): string {
  return localDate(now())
}

const LOCALE: Record<Lang, string> = { sv: 'sv-SE', en: 'en-GB', ar: 'ar' }

export function formatDay(date: string, lang: Lang = 'sv', opts?: Intl.DateTimeFormatOptions): string {
  const d = zonedToUtc(date, '12:00')
  return new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...opts,
  }).format(d)
}

export function weekdayShort(date: string, lang: Lang = 'sv'): string {
  return formatDay(date, lang, { weekday: 'short', day: undefined, month: undefined })
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function addMinutes(d: Date | string, min: number): Date {
  return new Date(new Date(d).getTime() + min * 60_000)
}

export function minutesBetween(a: Date | string, b: Date | string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000)
}

/** "om 12 min", "om 1 h 5 min" */
export function relMinutes(min: number, lang: Lang = 'sv'): string {
  const h = Math.floor(Math.abs(min) / 60)
  const m = Math.abs(min) % 60
  const words = {
    sv: { h: 'h', m: 'min', in: 'om', ago: 'sedan', now: 'nu' },
    en: { h: 'h', m: 'min', in: 'in', ago: 'ago', now: 'now' },
    ar: { h: 'س', m: 'د', in: 'بعد', ago: 'منذ', now: 'الآن' },
  }[lang]
  if (min === 0) return words.now
  const body = h ? `${h} ${words.h}${m ? ` ${m} ${words.m}` : ''}` : `${m} ${words.m}`
  if (lang === 'sv') return min > 0 ? `${words.in} ${body}` : `${body} ${words.ago}`
  return min > 0 ? `${words.in} ${body}` : `${words.ago} ${body}`
}

// ---------- Programpunkter ----------
export type SessionStatus = 'upcoming' | 'ongoing' | 'done'

export function sessionStatus(s: Session, at: Date = now()): SessionStatus {
  const t = at.getTime()
  if (t < new Date(s.starts_at).getTime()) return 'upcoming'
  if (t < new Date(s.ends_at).getTime()) return 'ongoing'
  return 'done'
}

export function sessionProgress(s: Session, at: Date = now()): number {
  const a = new Date(s.starts_at).getTime()
  const b = new Date(s.ends_at).getTime()
  return Math.min(1, Math.max(0, (at.getTime() - a) / (b - a)))
}

/** Ordningskommitténs tre räknetillfällen för en föreläsning. */
export function checkpointsFor(s: Session) {
  const start = new Date(s.starts_at)
  const end = new Date(s.ends_at)
  const mid = new Date((start.getTime() + end.getTime()) / 2)
  return [
    { key: 'start_plus_5' as const, at: addMinutes(start, 5) },
    { key: 'midpoint' as const, at: mid },
    { key: 'end_minus_5' as const, at: addMinutes(end, -5) },
  ]
}

/** "HH:MM" + minuter → "HH:MM" */
export function shiftTime(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const t = (((h * 60 + m + min) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
