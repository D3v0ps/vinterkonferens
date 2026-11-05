// Förra årets schema (Årliga konferensen, 26–28 december 2025) som mall för nästa program.
// Upplägget brukar vara detsamma år från år: bönerna är fasta punkter, föreläsningar på 45–60 minuter
// med rast emellan och en panel som avslutar dagen. Titlar och talare är förra årets och byts ut.
import { zonedToUtc } from './time'
import type { Audience, ConferenceDay, Lang, Localized, Session, SessionKind } from './types'

interface Item {
  start: string
  end: string
  kind: SessionKind
  title: Localized
  /** Egen text i schemats första kolumn, t.ex. "Jumuah" eller "Start". */
  label?: Localized
  speaker?: string
  /** Standard: föreläsningar och start för vuxna, böner och mat/fika för alla (syns även på barnsidan). */
  audience?: Audience
}

interface TemplateDay {
  /** Veckodag som i Date.getUTCDay(): 5 = fredag, 6 = lördag, 0 = söndag. */
  weekday: number
  name: string
  lang: Lang
  items: Item[]
}

const L = (sv: string, en: string, ar: string): Localized => ({ sv, en, ar })

const ASR = L('Asr', 'Asr', 'العصر')
const MAGHRIB = L('Maghrib', 'Maghrib', 'المغرب')
const ISHA = L('Isha', 'Isha', 'العشاء')
const PAUSE = L('Rast', 'Break', 'استراحة')
const FOOD = L('Mat/fika', 'Food & coffee', 'طعام وقهوة')
const QA = L('Frågor & svar', 'Questions & answers', 'أسئلة وأجوبة')

const prayer = (start: string, end: string, title: Localized): Item => ({ start, end, kind: 'prayer', title })
// Korta raster mellan föreläsningarna gäller de vuxna; mat/fika gäller alla.
const rest = (start: string, end: string, title = FOOD): Item => ({ start, end, kind: 'break', title, audience: title === PAUSE ? 'adults' : 'all' })
const talk = (start: string, end: string, title: Localized, speaker: string): Item => ({ start, end, kind: 'lecture', title, speaker })
const panel = (start: string, end: string, title: Localized, speaker: string): Item => ({ start, end, kind: 'panel', title, speaker })

const KHEDR = 'Sh. Khedr Abdelmoati'
const JUMA = 'Sh. Mohamed Juma'
const KHARRAKI = 'Sh. Mohammed Amin Kharraki'

export const TEMPLATE_2025: TemplateDay[] = [
  {
    weekday: 5,
    name: 'Fredag 26 december 2025',
    lang: 'ar',
    items: [
      { start: '12:00', end: '12:30', kind: 'prayer', label: L('Jumuah', 'Jumuah', 'الجمعة'), title: L('Fredagspredikan', 'Friday sermon', 'خطبة الجمعة'), speaker: KHEDR, audience: 'adults' },
      prayer('12:50', '13:15', L('Asr + påminnelse (arabiska)', 'Asr + reminder (Arabic)', 'العصر + تذكرة')),
      prayer('15:00', '15:30', MAGHRIB),
      rest('15:30', '15:45', PAUSE),
      talk('15:45', '16:45', L('Sharians syften i äktenskapet: barmhärtighet, kärlek och trygghet', 'The aims of Sharia in marriage: mercy, affection and stability', 'مقاصد الشريعة في تنظيم العلاقة الزوجية: رحمة ومودة واستقرار'), KHEDR),
      rest('16:45', '17:00', PAUSE),
      talk('17:00', '18:00', L('Nycklar till kärlek och trygghet i äktenskapet', 'Keys to love and stability in marriage', 'مفاتيح الحب والاستقرار في الحياة الزوجية: بناء علاقة تدوم بالمودة'), JUMA),
      prayer('18:00', '18:30', ISHA),
      rest('18:30', '19:00', PAUSE),
      talk('19:00', '19:45', L('Att uppfostra barn: ett stort förtroende och ett delat ansvar', 'Raising children: a great trust shared by both parents', 'مسؤولية تربية الأبناء أمانة عظيمة وشراكة بين الوالدين'), KHEDR),
      rest('19:45', '20:00', PAUSE),
      panel('20:00', '21:00', L('Panelsamtal', 'Panel discussion', 'ندوة'), `${KHEDR} & ${JUMA}`),
    ],
  },
  {
    weekday: 6,
    name: 'Lördag 27 december 2025',
    lang: 'sv',
    items: [
      prayer('12:45', '13:15', ASR),
      { start: '13:30', end: '14:00', kind: 'other', label: L('Start', 'Start', 'البداية'), title: L('Invigning', 'Opening', 'الافتتاح') },
      talk('14:00', '14:55', L('Tron är ljus', 'Faith is light', 'الإيمان نور'), 'Niclas Olsson'),
      prayer('15:00', '15:30', MAGHRIB),
      rest('15:30', '16:00'),
      talk('16:00', '16:45', L('Tron väcker hoppet', 'Faith awakens hope', 'الإيمان يوقظ الأمل'), KHARRAKI),
      rest('16:45', '17:00'),
      talk('17:00', '18:00', L('Utmaningar i dagens samhälle', "Challenges in today's society", 'تحديات في مجتمع اليوم'), 'Rashid Musa'),
      prayer('18:00', '18:30', ISHA),
      rest('18:30', '19:00'),
      talk('19:00', '19:45', L('Familjens roll i att skapa medvetenhet och hopp', "The family's role in building awareness and hope", 'دور الأسرة في بناء الوعي والأمل'), 'Suheer Sherif'),
      panel('20:00', '21:00', QA, 'N. Olsson, M. Amin Kharraki, R. Musa, S. Sherif'),
    ],
  },
  {
    weekday: 0,
    name: 'Söndag 28 december 2025',
    lang: 'sv',
    items: [
      prayer('15:00', '15:30', MAGHRIB),
      rest('15:30', '15:45'),
      talk('15:45', '16:45', L('Utmaningarnas påverkan på vår psykologi', 'How challenges affect our minds', 'أثر التحديات على نفسيتنا'), 'Hussein Hamad'),
      rest('16:45', '17:00'),
      talk('17:00', '18:00', L('Att hantera utmaningarna som individ och grupp', 'Facing the challenges as individuals and as a community', 'مواجهة التحديات فرداً وجماعة'), 'Kitimbwa Sabuni'),
      prayer('18:00', '18:30', ISHA),
      rest('18:30', '19:00'),
      talk('19:00', '19:45', L('Styrka i enighet', 'Strength in unity', 'القوة في الوحدة'), KHARRAKI),
      rest('19:45', '20:00'),
      panel('20:00', '21:00', QA, 'H. Hamad, M. Amin Kharraki, F. Doubakil'),
    ],
  },
]

const weekday = (date: string) => zonedToUtc(date, '12:00').getUTCDay()

/** Mallens dag för en konferensdag: samma veckodag i första hand, annars samma ordning. */
export function templateFor(day: ConferenceDay, index: number): TemplateDay {
  return TEMPLATE_2025.find((t) => t.weekday === weekday(day.date)) ?? TEMPLATE_2025[Math.min(index, TEMPLATE_2025.length - 1)]
}

/** Mallen som programpunkter på konferensdagarna. Föreläsningarna hålls på dagens språk. */
export function templateRows(days: ConferenceDay[], published = false): Partial<Session>[] {
  return days.flatMap((d, i) =>
    templateFor(d, i).items.map((x) => {
      const talk = x.kind === 'lecture' || x.kind === 'panel'
      return {
        starts_at: zonedToUtc(d.date, x.start).toISOString(),
        ends_at: zonedToUtc(d.date, x.end).toISOString(),
        kind: x.kind,
        audience: x.audience ?? (talk || x.kind === 'other' ? 'adults' : 'all'),
        title: x.title,
        label: x.label ?? {},
        description: {},
        speaker: x.speaker ?? null,
        speaker_photo: null,
        room: null,
        language: talk || x.label ? d.default_lang : null,
        capacity: null,
        published,
        feedback_enabled: talk,
      }
    }),
  )
}
