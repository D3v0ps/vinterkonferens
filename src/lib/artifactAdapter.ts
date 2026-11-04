// Datalager för Claude-artifacten: artifactens delade databas (db) och fillagring (assets).
// Alla som öppnar artifacten ser samma data, och ändringar syns live hos alla.
//
//  - Varje tabell är en samling (`sessions/<id>`); en prenumeration per tabell håller en
//    kopia i minnet som list() filtrerar, så sidorna fungerar precis som mot Supabase.
//  - Köksräknarens tryck samlas i ett dokument per enhet och tiominutersperiod, eftersom
//    databasen har ett tak på 25 000 dokument.
//  - Filer: bilder, PDF, video och text går till artifactens fillagring. Övriga typer
//    (ljud, Word …) och allt när fillagringen inte är tillgänglig delas upp i databasen.
//  - Fritidsnumren delas ut under ett kort lås så att två anmälningar aldrig får samma nummer.
import type { Bucket, DataAdapter, Query } from './db'
import { applyQuery, emitChange, uuid } from './db'
import type { KidsRegistration, TableName } from './types'

// ---------- Minimala typer för plattformens API (se artifact-capabilities) ----------
interface DbError {
  code: string
  message: string
}
interface DocSnap {
  id: string
  exists: boolean
  data(): Record<string, unknown> | undefined
}
interface QuerySnap {
  docs: DocSnap[]
  metadata: { fromCache: boolean }
}
interface DocRef {
  get(): Promise<DocSnap>
  set(data: Record<string, unknown>): Promise<void>
  update(data: Record<string, unknown>): Promise<void>
  delete(): Promise<void>
  acquire(o: { holder: string; ttlMs?: number }): Promise<{ acquired: boolean; expiresAt?: string }>
  collection(path: string): CollRef
}
interface CollRef {
  doc(id?: string): DocRef
  get(): Promise<QuerySnap>
  onSnapshot(next: (s: QuerySnap) => void, error?: (e: DbError) => void): () => void
}
export interface ArtifactDb {
  doc(path: string): DocRef
  collection(path: string): CollRef
}
export interface ArtifactAssets {
  upload(blob: Blob, options?: { type?: string }): Promise<{ id: string; url: string; contentType: string }>
  delete(id: string): Promise<void>
}

type Row = Record<string, unknown>

// Unikt per flik, så att en enhets köksdokument bara skrivs av den fliken.
const TAB_ID = uuid().slice(0, 8)

const ERRORS: Record<string, string> = {
  invalid_argument: 'Du kan bara läsa här. Be ägaren ge dig behörigheten Contributor (eller högre) för att kunna spara.',
  resource_exhausted: 'För många ändringar på kort tid. Vänta en stund och försök igen.',
  quota_exceeded: 'Databasen i förhandsvisningen är full. Ta bort gammal data eller flytta till den riktiga sidan.',
  revoked: 'Din åtkomst till sidan har ändrats. Ladda om sidan.',
  not_granted: 'Sidan har inte fått tillgång till databasen.',
}

function wrap(e: unknown): Error {
  const code = (e as DbError)?.code
  if (code && ERRORS[code]) return new Error(ERRORS[code])
  if (e instanceof Error) return e
  return new Error((e as DbError)?.message || 'Något gick fel. Försök igen.')
}

/** Tar bort undefined (JSON-databasen tar bara ren JSON). */
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null)) as T
}

// Tabeller vars rader samlas i hinkar (ett dokument med många rader)
const BUCKETED: Partial<Record<TableName, (row: Row) => string>> = {
  kitchen_events: (row) => {
    const d = new Date(String(row.occurred_at ?? new Date().toISOString()))
    const slot = Math.floor(d.getTime() / 600_000) // tio minuter
    return `${TAB_ID}-${slot}`
  },
}

// Bilder, PDF, video, typsnitt och text kan läggas i fillagringen
const ASSET_TYPES = /^(image\/(png|jpe?g|gif|webp|avif|svg\+xml)|video\/(mp4|webm|quicktime)|application\/pdf|text\/(plain|csv|markdown)|application\/json)$/
const CHUNK_CHARS = 190_000 // base64-tecken per dokument (gränsen är 256 KiB)
const MAX_DB_FILE = 15 * 1024 * 1024

interface TableState {
  rows: Row[]
  /** Hink-id per rad-id (bara för hinktabeller). */
  bucketOf: Map<string, string>
  ready: Promise<void>
  loaded: boolean
}

export function createArtifactAdapter(db: ArtifactDb, assets: ArtifactAssets | null): DataAdapter {
  const tables = new Map<TableName, TableState>()
  const writeChains = new Map<string, Promise<unknown>>()
  // Hinkar som den här fliken har ändrat: fliken är ensam skribent och dess kopia gäller
  const mine = new Map<string, Row[]>()
  const urlCache = new Map<string, string>()

  /** Kör skrivningar till samma dokument en i taget. */
  function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = writeChains.get(key) ?? Promise.resolve()
    const next = prev.catch(() => undefined).then(fn)
    writeChains.set(key, next)
    return next
  }

  function ensure(table: TableName): TableState {
    const existing = tables.get(table)
    if (existing) return existing
    let resolve!: () => void
    let reject!: (e: Error) => void
    const state: TableState = {
      rows: [],
      bucketOf: new Map(),
      loaded: false,
      ready: new Promise<void>((res, rej) => {
        resolve = res
        reject = rej
      }),
    }
    state.ready.catch(() => undefined)
    tables.set(table, state)
    const bucketed = !!BUCKETED[table]
    const timer = setTimeout(() => {
      if (!state.loaded) reject(new Error('Databasen svarar inte just nu. Kontrollera uppkopplingen och försök igen om en stund.'))
    }, 10_000)
    db.collection(table).onSnapshot(
      (snap) => {
        const rows: Row[] = []
        const bucketOf = new Map<string, string>()
        const seen = new Set<string>()
        for (const d of snap.docs) {
          const body = d.data()
          if (!body) continue
          if (bucketed) {
            seen.add(d.id)
            for (const r of mine.get(`${table}/${d.id}`) ?? (body.rows as Row[] | undefined) ?? []) {
              rows.push(r)
              bucketOf.set(String(r.id), d.id)
            }
          } else rows.push({ ...body, id: body.id ?? d.id })
        }
        if (bucketed) {
          // Egna hinkar som ännu inte syns i databasens svar
          for (const [key, list] of mine) {
            const [t, b] = key.split('/')
            if (t !== table || seen.has(b)) continue
            for (const r of list) {
              rows.push(r)
              bucketOf.set(String(r.id), b)
            }
          }
        }
        state.rows = rows
        state.bucketOf = bucketOf
        if (!state.loaded) {
          state.loaded = true
          clearTimeout(timer)
          resolve()
        }
        emitChange(table)
      },
      (e) => {
        clearTimeout(timer)
        if (!state.loaded) reject(wrap(e))
        else console.warn('Prenumerationen avbröts', table, e)
      },
    )
    return state
  }

  async function rowsOf(table: TableName): Promise<Row[]> {
    const s = ensure(table)
    await s.ready
    return s.rows
  }

  function upsertLocal(table: TableName, row: Row, bucket?: string) {
    const s = ensure(table)
    const i = s.rows.findIndex((r) => r.id === row.id)
    if (i >= 0) s.rows[i] = row
    else s.rows.push(row)
    if (bucket) s.bucketOf.set(String(row.id), bucket)
    emitChange(table)
  }

  function removeLocal(table: TableName, id: unknown) {
    const s = ensure(table)
    s.rows = s.rows.filter((r) => r.id !== id)
    s.bucketOf.delete(String(id))
    emitChange(table)
  }

  /** Hinkens rader som den här fliken äger (hämtas från minnesbilden första gången). */
  function bucketRows(table: TableName, bucket: string): Row[] {
    const key = `${table}/${bucket}`
    let list = mine.get(key)
    if (!list) {
      const s = ensure(table)
      list = s.rows.filter((r) => s.bucketOf.get(String(r.id)) === bucket).map((r) => structuredClone(r))
      mine.set(key, list)
    }
    return list
  }

  /** Skriver hela hinken från flikens kopia. */
  async function writeBucket(table: TableName, bucket: string) {
    const rows = mine.get(`${table}/${bucket}`) ?? []
    const ref = db.doc(`${table}/${bucket}`)
    if (rows.length) await ref.set({ rows: clean(rows) })
    else await ref.delete()
  }

  async function insertRow(table: TableName, input: Row): Promise<Row> {
    await rowsOf(table)
    const row = clean({ id: uuid(), created_at: new Date().toISOString(), ...input }) as Row
    const bucketFn = BUCKETED[table]
    try {
      if (bucketFn) {
        const bucket = bucketFn(row)
        bucketRows(table, bucket).push(row)
        upsertLocal(table, row, bucket)
        await serial(`${table}/${bucket}`, () => writeBucket(table, bucket)).catch((e) => {
          mine.set(`${table}/${bucket}`, bucketRows(table, bucket).filter((r) => r.id !== row.id))
          throw e
        })
      } else {
        upsertLocal(table, row)
        await serial(`${table}/${row.id}`, () => db.doc(`${table}/${String(row.id)}`).set(row))
      }
    } catch (e) {
      removeLocal(table, row.id)
      throw wrap(e)
    }
    return structuredClone(row)
  }

  async function chunkUpload(path: string, file: Blob): Promise<string> {
    if (file.size > MAX_DB_FILE) throw new Error('Filen är för stor för förhandsvisningen (max 15 MB för den här filtypen).')
    const b64 = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result).split(',')[1] ?? '')
      r.onerror = () => rej(new Error('Kunde inte läsa filen.'))
      r.readAsDataURL(file)
    })
    const fid = uuid()
    const n = Math.max(1, Math.ceil(b64.length / CHUNK_CHARS))
    try {
      for (let i = 0; i < n; i++) {
        await db.doc(`filestore/${fid}/chunks/${i}`).set({ d: b64.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS) })
      }
      await db.doc(`filestore/${fid}`).set({ name: path.split('/').pop() ?? 'fil', type: file.type || 'application/octet-stream', size: file.size, chunks: n })
    } catch (e) {
      throw wrap(e)
    }
    return `db:${fid}`
  }

  async function chunkUrl(fid: string): Promise<string | null> {
    const meta = (await db.doc(`filestore/${fid}`).get()).data()
    if (!meta) return null
    const n = Number(meta.chunks) || 0
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => db.doc(`filestore/${fid}/chunks/${i}`).get()))
    const b64 = parts.map((p) => String(p.data()?.d ?? '')).join('')
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return URL.createObjectURL(new Blob([bytes], { type: String(meta.type || 'application/octet-stream') }))
  }

  return {
    mode: 'artifact',

    async list(table, q?: Query) {
      try {
        return applyQuery(await rowsOf(table), q) as never
      } catch (e) {
        throw wrap(e)
      }
    },

    async get(table, id) {
      const rows = await rowsOf(table)
      const r = rows.find((x) => x.id === id)
      return (r ? structuredClone(r) : null) as never
    },

    async insert(table, row) {
      return (await insertRow(table, row as Row)) as never
    },

    async insertMany(table, list) {
      const out: Row[] = []
      for (const r of list) out.push(await insertRow(table, r as Row))
      return out as never
    },

    async update(table, id, patch) {
      const rows = await rowsOf(table)
      const current = rows.find((r) => r.id === id)
      if (!current) throw new Error('Raden finns inte längre. Ladda om sidan.')
      const next = clean({ ...current, ...(patch as Row), id: current.id }) as Row
      if (Object.prototype.hasOwnProperty.call(current, 'updated_at')) next.updated_at = new Date().toISOString()
      const s = ensure(table)
      const bucket = s.bucketOf.get(String(id))
      const before = bucket ? bucketRows(table, bucket).slice() : null
      if (bucket) mine.set(`${table}/${bucket}`, bucketRows(table, bucket).map((r) => (r.id === id ? next : r)))
      upsertLocal(table, next, bucket)
      try {
        if (bucket) await serial(`${table}/${bucket}`, () => writeBucket(table, bucket))
        else await serial(`${table}/${String(id)}`, () => db.doc(`${table}/${String(id)}`).set(next))
      } catch (e) {
        if (bucket && before) mine.set(`${table}/${bucket}`, before)
        upsertLocal(table, current, bucket)
        throw wrap(e)
      }
      return structuredClone(next) as never
    },

    async remove(table, id) {
      const rows = await rowsOf(table)
      const current = rows.find((r) => r.id === id)
      if (!current) throw new Error('Kunde inte ta bort – raden finns inte längre.')
      const s = ensure(table)
      const bucket = s.bucketOf.get(String(id))
      const before = bucket ? bucketRows(table, bucket).slice() : null
      if (bucket) mine.set(`${table}/${bucket}`, bucketRows(table, bucket).filter((r) => r.id !== id))
      removeLocal(table, id)
      try {
        if (bucket) await serial(`${table}/${bucket}`, () => writeBucket(table, bucket))
        else await serial(`${table}/${String(id)}`, () => db.doc(`${table}/${String(id)}`).delete())
      } catch (e) {
        if (bucket && before) mine.set(`${table}/${bucket}`, before)
        upsertLocal(table, current, bucket)
        throw wrap(e)
      }
    },

    async rpc(fn, args) {
      if (fn !== 'register_kids') throw new Error(`Okänd funktion ${fn}`)
      const p = (args.payload ?? {}) as Partial<KidsRegistration>
      const children = (p.children ?? []).filter((c) => c && typeof c.name === 'string' && c.name.trim())
      if (!p.guardian_name?.trim() || !p.guardian_phone?.trim()) throw new Error('Namn och telefon krävs.')
      if (!children.length || children.length > 10) throw new Error('Minst ett barn krävs.')
      const existing = await rowsOf('kids_registrations')
      const counter = db.doc('counters/kids_reg')
      // Kort lås så att två samtidiga anmälningar aldrig får samma nummer
      let locked = false
      for (let i = 0; i < 25 && !locked; i++) {
        const r = await counter.acquire({ holder: TAB_ID, ttlMs: 8000 }).catch((e) => {
          throw wrap(e)
        })
        locked = r.acquired
        if (!locked) await new Promise((res) => setTimeout(res, 250 + Math.random() * 400))
      }
      if (!locked) throw new Error('Många anmälningar just nu. Försök igen om en liten stund.')
      const snap = await counter.get()
      const stored = Number(snap.data()?.next) || 0
      const maxExisting = Math.max(100, ...existing.map((r) => Number(r.reg_number) || 0))
      const number = Math.max(stored, maxExisting + 1, 101)
      try {
        await counter.update({ next: number + 1 })
      } catch {
        await counter.set({ next: number + 1 }).catch((e) => {
          throw wrap(e)
        })
      }
      await insertRow('kids_registrations', {
        reg_number: number,
        guardian_name: p.guardian_name.trim().slice(0, 120),
        guardian_phone: p.guardian_phone.trim().slice(0, 40),
        guardian_email: p.guardian_email?.trim() || null,
        children: children.map((c) => ({ name: c.name.trim().slice(0, 120), age: typeof c.age === 'number' ? c.age : null, allergies: String(c.allergies ?? '').slice(0, 300) })),
        days: [...new Set(p.days ?? [])].sort(),
        pickup_names: p.pickup_names?.trim() || null,
        notes: p.notes?.trim() || null,
        photo_consent: !!p.photo_consent,
        status: 'registered',
        paid: false,
        amount: null,
        paid_at: null,
        checked_in_at: null,
        lang: p.lang ?? 'sv',
      })
      return number as never
    },

    async upload(_bucket: Bucket, path, file) {
      const type = file.type || ''
      if (assets && ASSET_TYPES.test(type)) {
        try {
          const r = await assets.upload(file, { type })
          return `asset:${r.id}`
        } catch (e) {
          const code = (e as DbError)?.code
          if (code !== 'unsupported_type' && code !== 'not_granted') throw new Error('Filen kunde inte laddas upp: ' + ((e as DbError)?.message ?? 'okänt fel'))
        }
      }
      return chunkUpload(path, file)
    },

    async fileUrl(_bucket, path) {
      if (path.startsWith('asset:')) return `/_blob/${path.slice(6)}`
      if (path.startsWith('db:')) {
        const cached = urlCache.get(path)
        if (cached) return cached
        const url = await chunkUrl(path.slice(3)).catch(() => null)
        if (url) urlCache.set(path, url)
        return url
      }
      return null
    },

    async removeFile(_bucket, path) {
      if (path.startsWith('asset:')) {
        await assets?.delete(path.slice(6)).catch(() => undefined)
      } else if (path.startsWith('db:')) {
        const fid = path.slice(3)
        const meta = (await db.doc(`filestore/${fid}`).get().catch(() => null))?.data()
        const n = Number(meta?.chunks) || 0
        for (let i = 0; i < n; i++) await db.doc(`filestore/${fid}/chunks/${i}`).delete().catch(() => undefined)
        await db.doc(`filestore/${fid}`).delete().catch(() => undefined)
      }
    },

    async transcribe() {
      // Ljudtranskribering kräver en tal-till-text-tjänst; den finns i den riktiga versionen.
      return null
    },
  }
}
