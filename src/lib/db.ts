// Ett tunt datalager med två implementationer:
//  - Supabase (riktig backend, när VITE_SUPABASE_URL/ANON_KEY finns)
//  - Lokal demo (localStorage + IndexedDB) så att sidan går att prova direkt.
import type { Row, TableName } from './types'

export type Op = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is'
export interface Filter {
  col: string
  op: Op
  value: unknown
}
export interface Query {
  filters?: Filter[]
  order?: { col: string; asc?: boolean }[]
  limit?: number
}

export const where = (col: string, op: Op, value: unknown): Filter => ({ col, op, value })
export const eq = (col: string, value: unknown): Filter => ({ col, op: 'eq', value })

export type Bucket = 'notes' | 'receipts'

export interface DataAdapter {
  mode: 'supabase' | 'demo'
  list<T extends TableName>(table: T, q?: Query): Promise<Row<T>[]>
  get<T extends TableName>(table: T, id: string | number): Promise<Row<T> | null>
  /** returning=false används för anonyma inlägg (t.ex. betyg) som inte får läsas tillbaka. */
  insert<T extends TableName>(table: T, row: Partial<Row<T>>, opts?: { returning?: boolean }): Promise<Row<T>>
  insertMany<T extends TableName>(table: T, rows: Partial<Row<T>>[]): Promise<Row<T>[]>
  update<T extends TableName>(table: T, id: string | number, patch: Partial<Row<T>>): Promise<Row<T>>
  remove(table: TableName, id: string | number): Promise<void>
  rpc<R>(fn: string, args: Record<string, unknown>): Promise<R>
  upload(bucket: Bucket, path: string, file: Blob): Promise<string>
  fileUrl(bucket: Bucket, path: string): Promise<string | null>
  removeFile(bucket: Bucket, path: string): Promise<void>
  /** Transkriberar en uppladdad ljudfil på servern. null om tjänsten saknas. */
  transcribe(bucket: Bucket, path: string, lang?: string): Promise<string | null>
}

// ---------- Ändringshändelser så att listor laddas om efter ändringar ----------
type Listener = () => void
const listeners = new Map<TableName, Set<Listener>>()

export function onTableChange(table: TableName, fn: Listener): () => void {
  if (!listeners.has(table)) listeners.set(table, new Set())
  listeners.get(table)!.add(fn)
  return () => listeners.get(table)?.delete(fn)
}

export function emitChange(table: TableName) {
  listeners.get(table)?.forEach((fn) => fn())
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Gör ett filnamn säkert för lagring. */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : ''
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
  return `${base || 'fil'}${ext}`
}
