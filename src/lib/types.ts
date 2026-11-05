// Datamodell – speglar tabellerna i supabase/migrations/0001_init.sql

export type Lang = 'sv' | 'en' | 'ar'
export const LANGS: Lang[] = ['sv', 'en', 'ar']

/** Text på flera språk. Tomma språk faller tillbaka på svenska. */
export type Localized = Partial<Record<Lang, string>>

export interface Settings {
  id: number
  conference_name: string
  tagline: Localized
  venue: string
  contact: string
  kitchen_info: Localized
  fritids_info: Localized
  fritids_price: Localized
  updated_at?: string
}

export interface ConferenceDay {
  id: string
  date: string // YYYY-MM-DD
  default_lang: Lang
  label: Localized
}

export interface Committee {
  id: string
  slug: string
  name: string
  description: string
  color: string
  sort: number
}

export interface Volunteer {
  id: string
  committee_id: string
  full_name: string
  email: string | null
  phone: string | null
  is_lead: boolean
  notes: string | null
  created_at?: string
}

export type PostAudience = 'internal' | 'external'
export type PostPage = 'home' | 'program' | 'kids' | 'kitchen'

export interface Post {
  id: string
  committee_id: string | null
  audience: PostAudience
  page: PostPage
  title: Localized
  body: Localized
  pinned: boolean
  published: boolean
  author_name: string | null
  created_by?: string | null
  created_at: string
  updated_at?: string
}

export interface Shift {
  id: string
  committee_id: string
  date: string // YYYY-MM-DD
  start_time: string // HH:MM
  end_time: string // HH:MM
  title: string
  location: string | null
  notes: string | null
  volunteer_ids: string[]
  created_at?: string
}

export type SessionKind = 'lecture' | 'panel' | 'preshow' | 'prayer' | 'activity' | 'break' | 'meal' | 'other'
export type Audience = 'adults' | 'kids' | 'all'

export interface Session {
  id: string
  starts_at: string // ISO timestamptz
  ends_at: string
  kind: SessionKind
  audience: Audience
  title: Localized
  description: Localized
  speaker: string | null
  /** Talarens porträtt (filväg i lagringen), visas som rund bild i schemat. */
  speaker_photo?: string | null
  /** Egen etikett i schemats första kolumn, t.ex. "Jumuah" eller "Start". Tom = typens namn. */
  label?: Localized | null
  room: string | null
  language: Lang | null
  capacity: number | null
  published: boolean
  feedback_enabled: boolean
  created_at?: string
}

export interface FeedbackAnswers {
  relevance?: 'yes' | 'partly' | 'no'
  length?: 'short' | 'good' | 'long'
  arrival?: 'early' | 'ontime' | 'late'
}

export interface Feedback {
  id: string
  session_id: string
  rating: number
  answers: FeedbackAnswers
  comment: string | null
  device_id: string
  lang: Lang
  created_at: string
}

export type MenuCategory = 'food' | 'coffee' | 'drinks' | 'snacks' | 'dessert'

export interface MenuItem {
  id: string
  name: Localized
  description: Localized
  category: MenuCategory
  price: number | null
  available: boolean
  tags: string[]
  sort: number
  created_at?: string
}

export type NoteKind = 'text' | 'image' | 'audio' | 'document' | 'video' | 'other'

export interface Note {
  id: string
  committee_id: string | null
  title: string
  body: string | null
  transcript: string | null
  file_path: string | null
  file_name: string | null
  file_type: string | null
  file_size: number | null
  kind: NoteKind
  author_name: string | null
  created_by?: string | null
  created_at: string
}

export interface Purchase {
  id: string
  committee_id: string | null
  store_name: string
  store_address: string | null
  store_url: string | null
  contact_name: string | null
  contact_phone: string | null
  purchased_on: string // YYYY-MM-DD
  discount_total: number
  discount_note: string | null
  paid_by: string | null
  receipt_path: string | null
  receipt_name: string | null
  notes: string | null
  author_name: string | null
  created_by?: string | null
  created_at: string
}

export type ItemStatus = 'in_stock' | 'used' | 'returned' | 'lent'

export interface PurchaseItem {
  id: string
  purchase_id: string
  name: string
  brand: string | null
  quantity: number
  unit: string | null
  unit_price: number
  discount: number
  link: string | null
  category: string | null
  storage_location: string | null
  status: ItemStatus
  created_at?: string
}

export type FlowArea = 'hall' | 'kitchen'
export type Checkpoint = 'start_plus_5' | 'midpoint' | 'end_minus_5' | 'extra' | 'queue'

export interface FlowCount {
  id: string
  session_id: string | null
  area: FlowArea
  checkpoint: Checkpoint
  count: number
  counted_at: string
  note: string | null
  author_name: string | null
  created_by?: string | null
}

export type KitchenCategory = 'guest' | 'food' | 'coffee' | 'tea' | 'drink' | 'snack'

export interface KitchenEvent {
  id: string
  category: KitchenCategory
  quantity: number
  occurred_at: string
  author_name: string | null
  created_by?: string | null
}

export interface Child {
  name: string
  age: number | null
  allergies: string
}

export type RegistrationStatus = 'registered' | 'paid' | 'checked_in' | 'checked_out' | 'cancelled'

export interface KidsRegistration {
  id: string
  reg_number: number
  guardian_name: string
  guardian_phone: string
  guardian_email: string | null
  children: Child[]
  days: string[] // datum YYYY-MM-DD
  pickup_names: string | null
  notes: string | null
  photo_consent: boolean
  status: RegistrationStatus
  paid: boolean
  amount: number | null
  paid_at: string | null
  checked_in_at: string | null
  lang: Lang
  created_at: string
}

export interface TableMap {
  settings: Settings
  conference_days: ConferenceDay
  committees: Committee
  volunteers: Volunteer
  posts: Post
  shifts: Shift
  sessions: Session
  feedback: Feedback
  menu_items: MenuItem
  notes: Note
  purchases: Purchase
  purchase_items: PurchaseItem
  flow_counts: FlowCount
  kitchen_events: KitchenEvent
  kids_registrations: KidsRegistration
}

export type TableName = keyof TableMap
export type Row<T extends TableName> = TableMap[T]
