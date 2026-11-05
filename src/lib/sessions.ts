// Hjälpare för programpunkter: vad som räknas som föreläsning och vad som står i schemats första kolumn.
import { tr } from './format'
import { localDate } from './time'
import type { Lang, Session, SessionKind } from './types'

/** Föreläsningar och paneler: de som publiken räknas på och som går att betygsätta. */
export const isTalk = (s: Pick<Session, 'kind'>) => s.kind === 'lecture' || s.kind === 'panel'

export const KIND_KEY: Record<SessionKind, string> = {
  lecture: 'kind_lecture',
  panel: 'kind_panel',
  prayer: 'kind_prayer',
  break: 'kind_break',
  meal: 'kind_meal',
  preshow: 'kind_preshow',
  activity: 'kind_activity',
  other: 'kind_other',
}

/**
 * Föreläsningarnas nummer per dag (Föreläsning 1, 2, 3 …), som i det tryckta schemat.
 * En föreläsning med egen etikett (t.ex. "Huvudföreläsning") räknas inte, så att numreringen inte får luckor.
 */
export function lectureNumbers(sessions: Session[]): Map<string, number> {
  const byDay = new Map<string, Session[]>()
  for (const s of [...sessions].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    if (s.kind !== 'lecture' || Object.values(s.label ?? {}).some((v) => v?.trim())) continue
    const d = localDate(s.starts_at)
    byDay.set(d, [...(byDay.get(d) ?? []), s])
  }
  const out = new Map<string, number>()
  for (const list of byDay.values()) list.forEach((s, i) => out.set(s.id, i + 1))
  return out
}

/** Texten i schemats första kolumn: egen etikett, annars typen ("Föreläsning 2", "Bön", "Rast" …). */
export function categoryLabel(s: Session, lang: Lang, t: Record<string, unknown>, numbers?: Map<string, number>): string {
  const own = tr(s.label ?? undefined, lang)
  if (own) return own
  const base = String(t[KIND_KEY[s.kind]] ?? '')
  const n = numbers?.get(s.id)
  return s.kind === 'lecture' && n ? `${base} ${n}` : base
}
