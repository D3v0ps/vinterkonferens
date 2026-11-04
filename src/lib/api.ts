import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createArtifactAdapter, type ArtifactAssets, type ArtifactDb } from './artifactAdapter'
import type { DataAdapter } from './db'
import { createLocalAdapter } from './localAdapter'
import { claudeUse, isArtifact } from './platform'
import { createSupabaseAdapter } from './supabaseAdapter'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Supabase-klienten, eller null i demoläge och i artifacten. */
export const supabase: SupabaseClient | null =
  !isArtifact && url && key ? createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true } }) : null

let impl: DataAdapter = supabase ? createSupabaseAdapter(supabase) : createLocalAdapter()

/** true när data bara sparas i den här webbläsaren. */
export let isDemo = impl.mode === 'demo'

/**
 * Klart när datalagret är valt. I artifacten väntar vi på artifactens databas; finns den
 * inte (t.ex. utloggad besökare) faller appen tillbaka på demoläget i webbläsaren.
 */
export const apiReady: Promise<void> = (async () => {
  if (!isArtifact) return
  const [db, assets] = await Promise.all([claudeUse<ArtifactDb>('db'), claudeUse<ArtifactAssets>('assets')])
  if (db) impl = createArtifactAdapter(db, assets)
  isDemo = impl.mode === 'demo'
})()

/** Datalagret. Använd först efter att apiReady är klart (main.tsx väntar in det). */
export const api: DataAdapter = {
  get mode() {
    return impl.mode
  },
  list: (t, q) => impl.list(t, q),
  get: (t, id) => impl.get(t, id),
  insert: (t, row, opts) => impl.insert(t, row, opts),
  insertMany: (t, rows) => impl.insertMany(t, rows),
  update: (t, id, patch) => impl.update(t, id, patch),
  remove: (t, id) => impl.remove(t, id),
  rpc: (fn, args) => impl.rpc(fn, args),
  upload: (b, p, f) => impl.upload(b, p, f),
  fileUrl: (b, p) => impl.fileUrl(b, p),
  removeFile: (b, p) => impl.removeFile(b, p),
  transcribe: (b, p, l) => impl.transcribe(b, p, l),
}
