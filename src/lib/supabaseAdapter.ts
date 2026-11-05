import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import type { Bucket, DataAdapter, Query } from './db'
import { emitChange } from './db'
import type { TableName } from './types'

function fail(error: { message: string } | null): never | void {
  if (error) throw new Error(error.message)
}

export function createSupabaseAdapter(sb: SupabaseClient): DataAdapter {
  return {
    mode: 'supabase',

    async list(table, q?: Query) {
      const build = () => {
        let b = sb.from(table).select('*')
        for (const f of q?.filters ?? []) {
          switch (f.op) {
            case 'in':
              b = b.in(f.col, f.value as unknown[])
              break
            case 'is':
              b = b.is(f.col, f.value as null)
              break
            default:
              b = b.filter(f.col, f.op, f.value as string)
          }
        }
        for (const o of q?.order ?? []) b = b.order(o.col, { ascending: o.asc !== false })
        return b.order('id')
      }
      if (q?.limit) {
        const { data, error } = await build().limit(q.limit)
        fail(error)
        return (data ?? []) as never
      }
      // Supabase ger max 1000 rader per anrop – hämta sida för sida (t.ex. köksräkningen)
      const PAGE = 1000
      const all: unknown[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await build().range(from, from + PAGE - 1)
        fail(error)
        all.push(...(data ?? []))
        if (!data || data.length < PAGE) break
      }
      return all as never
    },

    async get(table, id) {
      const { data, error } = await sb.from(table).select('*').eq('id', id).maybeSingle()
      fail(error)
      return data as never
    },

    async insert(table, row, opts) {
      if (opts?.returning === false) {
        const { error } = await sb.from(table).insert(row as never)
        fail(error)
        emitChange(table)
        return row as never
      }
      const { data, error } = await sb.from(table).insert(row as never).select().single()
      fail(error)
      emitChange(table)
      return data as never
    },

    async insertMany(table, rows) {
      if (!rows.length) return []
      const { data, error } = await sb.from(table).insert(rows as never).select()
      fail(error)
      emitChange(table)
      return (data ?? []) as never
    },

    async update(table, id, patch) {
      const { data, error } = await sb.from(table).update(patch as never).eq('id', id).select().single()
      fail(error)
      emitChange(table)
      return data as never
    },

    async remove(table: TableName, id) {
      const { data, error } = await sb.from(table).delete().eq('id', id).select('id')
      fail(error)
      if (!data?.length) throw new Error('Kunde inte ta bort – raden finns inte längre eller så saknar du behörighet.')
      emitChange(table)
    },

    async rpc(fn, args) {
      const { data, error } = await sb.rpc(fn, args)
      fail(error)
      return data as never
    },

    async upload(bucket: Bucket, path, file) {
      const { error } = await sb.storage.from(bucket).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
      fail(error)
      return path
    },

    async fileUrl(bucket, path) {
      // Talarfoton ligger i en publik hink: en fast länk som går att cacha och inte slutar gälla.
      if (bucket === 'speakers') return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 60 * 60)
      if (error) return null
      return data.signedUrl
    },

    async removeFile(bucket, path) {
      await sb.storage.from(bucket).remove([path])
    },

    async transcribe(bucket, path, lang) {
      const { data, error } = await sb.functions.invoke('transcribe', { body: { bucket, path, lang } })
      if (error) {
        let msg = error.message
        // Funktionens eget felmeddelande ligger i svarskroppen
        if (error instanceof FunctionsHttpError && error.context instanceof Response) {
          const body = (await error.context.json().catch(() => null)) as { error?: string } | null
          if (body?.error) msg = body.error
        }
        throw new Error('Transkriberingen misslyckades: ' + msg)
      }
      return (data as { text?: string } | null)?.text ?? null
    },
  }
}
