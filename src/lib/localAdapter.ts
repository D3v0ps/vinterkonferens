// Demoläge: all data i webbläsarens localStorage, filer i IndexedDB.
import { del, get, set } from 'idb-keyval'
import type { DataAdapter, Query } from './db'
import { applyQuery, emitChange, uuid } from './db'
import { createDemoData, type DemoDb } from './demoData'
import { safeStorage } from './platform'
import type { KidsRegistration, TableName } from './types'

const KEY = 'vk-demo-db-v1'

let db: DemoDb | null = null

function load(): DemoDb {
  if (db) return db
  try {
    const raw = safeStorage.get(KEY)
    if (raw) db = JSON.parse(raw) as DemoDb
  } catch {
    /* ignorera */
  }
  if (!db) {
    db = createDemoData()
    save()
  }
  return db
}

function save() {
  safeStorage.set(KEY, JSON.stringify(db))
}

export function resetDemoData() {
  db = createDemoData()
  save()
  window.location.reload()
}

function rows(table: TableName): Record<string, unknown>[] {
  const d = load() as unknown as Record<string, Record<string, unknown>[]>
  if (!d[table]) d[table] = []
  return d[table]
}

function query(table: TableName, q?: Query) {
  return applyQuery(rows(table), q)
}

const delay = () => new Promise((r) => setTimeout(r, 60))

export function createLocalAdapter(): DataAdapter {
  return {
    mode: 'demo',

    async list(table, q) {
      await delay()
      return query(table, q) as never
    },

    async get(table, id) {
      return (query(table, { filters: [{ col: 'id', op: 'eq', value: id }] })[0] ?? null) as never
    },

    async insert(table, row) {
      await delay()
      const full = { id: uuid(), created_at: new Date().toISOString(), ...row } as Record<string, unknown>
      rows(table).push(full)
      save()
      emitChange(table)
      return structuredClone(full) as never
    },

    async insertMany(table, list) {
      const out = list.map((row) => ({ id: uuid(), created_at: new Date().toISOString(), ...row }))
      rows(table).push(...out)
      save()
      emitChange(table)
      return structuredClone(out) as never
    },

    async update(table, id, patch) {
      await delay()
      const r = rows(table).find((x) => x.id === id)
      if (!r) throw new Error('Hittade inte raden')
      Object.assign(r, patch, 'updated_at' in r ? { updated_at: new Date().toISOString() } : {})
      save()
      emitChange(table)
      return structuredClone(r) as never
    },

    async remove(table, id) {
      const list = rows(table)
      const i = list.findIndex((x) => x.id === id)
      if (i >= 0) list.splice(i, 1)
      save()
      emitChange(table)
    },

    async rpc(fn, args) {
      await delay()
      if (fn === 'register_kids') {
        const p = args.payload as Partial<KidsRegistration>
        const list = rows('kids_registrations') as unknown as KidsRegistration[]
        const reg_number = Math.max(100, ...list.map((r) => r.reg_number)) + 1
        list.push({
          id: uuid(),
          reg_number,
          guardian_name: p.guardian_name ?? '',
          guardian_phone: p.guardian_phone ?? '',
          guardian_email: p.guardian_email ?? null,
          children: p.children ?? [],
          days: p.days ?? [],
          pickup_names: p.pickup_names ?? null,
          notes: p.notes ?? null,
          photo_consent: !!p.photo_consent,
          status: 'registered',
          paid: false,
          amount: null,
          paid_at: null,
          checked_in_at: null,
          lang: p.lang ?? 'sv',
          created_at: new Date().toISOString(),
        })
        save()
        emitChange('kids_registrations')
        return reg_number as never
      }
      throw new Error(`Okänd funktion ${fn}`)
    },

    async upload(bucket, path, file) {
      await set(`file:${bucket}/${path}`, file)
      return path
    },

    async fileUrl(bucket, path) {
      const blob = (await get(`file:${bucket}/${path}`)) as Blob | undefined
      return blob ? URL.createObjectURL(blob) : null
    },

    async removeFile(bucket, path) {
      await del(`file:${bucket}/${path}`)
    },

    async transcribe() {
      return null
    },
  }
}
