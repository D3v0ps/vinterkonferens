// Minimal exempeldata för demoläget. Konferensen läggs på närmaste fredag–söndag.
import type { Lang, Localized, Session, TableMap } from './types'
import { localDate, zonedToUtc } from './time'
import { uuid } from './db'
import { templateRows } from './template2025'

export type DemoDb = { [K in keyof TableMap]: TableMap[K][] }

export const DEMO_PERSONAS = [
  { email: 'admin@demo.se', label: 'Styrgruppen (admin)' },
  { email: 'kok@demo.se', label: 'Köket – ansvarig' },
  { email: 'fritids@demo.se', label: 'Fritids – ansvarig' },
  { email: 'ordning@demo.se', label: 'Ordning – volontär' },
]

export const COMMITTEES: [slug: string, name: string, color: string][] = [
  ['styrgruppen', 'Styrgruppen', '#1a237e'],
  ['konferencierer', 'Konferencierer', '#7c3aed'],
  ['koket', 'Köket', '#0f766e'],
  ['fritids', 'Fritids', '#15803d'],
  ['forelasningar', 'Föreläsningar', '#1d4ed8'],
  ['ordning', 'Ordning', '#475569'],
  ['all-around', 'All around', '#0e7490'],
  ['gastbemotare', 'Gästbemötare', '#a16207'],
]

const L = (sv: string, en: string, ar: string): Localized => ({ sv, en, ar })

function nextFriday(): string {
  const d = zonedToUtc(localDate(new Date()), '12:00')
  const dow = d.getUTCDay()
  const back = dow === 6 ? -1 : dow === 0 ? -2 : (5 - dow + 7) % 7
  return localDate(new Date(d.getTime() + back * 86_400_000))
}
const addDays = (date: string, n: number) => localDate(new Date(zonedToUtc(date, '12:00').getTime() + n * 86_400_000))

export function createDemoData(): DemoDb {
  const fri = nextFriday()
  const days = [fri, addDays(fri, 1), addDays(fri, 2)]
  const now = new Date().toISOString()

  const committees = COMMITTEES.map(([slug, name, color], sort) => ({ id: uuid(), slug, name, description: '', color, sort }))
  const cid = (slug: string) => committees.find((c) => c.slug === slug)!.id
  const person = (slug: string, full_name: string, email: string, is_lead: boolean) => ({
    id: uuid(), committee_id: cid(slug), full_name, email, phone: null, is_lead, notes: null, created_at: now,
  })

  const conference_days = days.map((date, i) => ({
    id: uuid(), date, default_lang: (i === 0 ? 'ar' : 'sv') as Lang,
    label: L(`Dag ${i + 1}`, `Day ${i + 1}`, `اليوم ${i + 1}`),
  }))
  // Vuxenprogrammet är förra årets schema (samma mall som under Program i den interna delen), plus fritids.
  const kids = (date: string, s: string, e: string, title: Localized): Session => ({
    id: uuid(), starts_at: zonedToUtc(date, s).toISOString(), ends_at: zonedToUtc(date, e).toISOString(),
    kind: 'activity', audience: 'kids', title, description: {}, speaker: null, room: 'Fritids', language: null,
    capacity: null, published: true, feedback_enabled: false, created_at: now,
  })
  const sessions: Session[] = [
    ...templateRows(conference_days, true).map((r) => ({ ...r, id: uuid(), created_at: now }) as Session),
    ...days.flatMap((date) => [
      kids(date, '13:30', '17:00', L('Pyssel och lek', 'Crafts and games', 'أشغال يدوية وألعاب')),
      kids(date, '17:00', '20:00', L('Film och fika', 'Film and snacks', 'فيلم ومرطبات')),
    ]),
  ]

  const menu = (category: 'food' | 'coffee' | 'snacks', name: Localized, price: number, sort: number) => ({
    id: uuid(), name, description: {}, category, price, available: true, tags: [], sort, created_at: now,
  })

  return {
    settings: [{
      id: 1,
      conference_name: 'Vinterkonferensen',
      tagline: L('Tre dagar av gemenskap och kunskap', 'Three days of community and knowledge', 'ثلاثة أيام من الأخوّة والمعرفة'),
      venue: 'Stockholms moské, Medborgarplatsen',
      contact: 'Info-disken vid entrén',
      kitchen_info: L('Öppet 09–19', 'Open 09–19', 'مفتوح 09–19'),
      fritids_info: L('Anmäl i förväg – gå sedan direkt till expresskassan.', 'Register in advance – then go straight to the express desk.', 'سجّل مسبقاً ثم توجّه مباشرة إلى الصندوق السريع.'),
      fritids_price: L('Betalning sker på plats.', 'Payment on site.', 'الدفع في المكان.'),
      updated_at: now,
    }],
    conference_days,
    committees,
    volunteers: [
      person('styrgruppen', 'Demo Admin', 'admin@demo.se', true),
      person('koket', 'Demo Kök', 'kok@demo.se', true),
      person('fritids', 'Demo Fritids', 'fritids@demo.se', true),
      person('ordning', 'Demo Ordning', 'ordning@demo.se', false),
    ],
    posts: [],
    shifts: [],
    sessions,
    feedback: [],
    menu_items: [
      menu('food', L('Dagens lunch', "Today's lunch", 'غداء اليوم'), 80, 0),
      menu('coffee', L('Kaffe', 'Coffee', 'قهوة'), 15, 1),
      menu('snacks', L('Kanelbulle', 'Cinnamon bun', 'كعكة القرفة'), 15, 2),
    ],
    notes: [],
    purchases: [],
    purchase_items: [],
    flow_counts: [],
    kitchen_events: [],
    kids_registrations: [],
  }
}
