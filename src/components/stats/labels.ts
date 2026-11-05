import { Coffee, Cookie, CupSoda, Leaf, Users, Utensils, type LucideIcon } from 'lucide-react'
import type { Checkpoint, KitchenCategory } from '../../lib/types'

export const CHECKPOINT_LABEL: Record<Checkpoint, string> = {
  start_plus_5: '5 min efter start',
  midpoint: 'Mittpunkt',
  end_minus_5: '5 min före slut',
  extra: 'Extra räkning',
  queue: 'Kö',
}

export const KITCHEN_CATS: { key: KitchenCategory; label: string; icon: LucideIcon }[] = [
  { key: 'guest', label: 'Gäst', icon: Users },
  { key: 'food', label: 'Mat', icon: Utensils },
  { key: 'coffee', label: 'Kaffe', icon: Coffee },
  { key: 'tea', label: 'Te', icon: Leaf },
  { key: 'drink', label: 'Dryck', icon: CupSoda },
  { key: 'snack', label: 'Fika', icon: Cookie },
]

export const catLabel = (k: KitchenCategory) => KITCHEN_CATS.find((c) => c.key === k)?.label ?? k

/** Minuter efter midnatt (svensk tid) för en tidpunkt. */
export function minuteOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
