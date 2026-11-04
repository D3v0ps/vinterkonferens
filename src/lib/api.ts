import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { DataAdapter } from './db'
import { createLocalAdapter } from './localAdapter'
import { createSupabaseAdapter } from './supabaseAdapter'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Supabase-klienten, eller null i demoläge. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true } }) : null

export const api: DataAdapter = supabase ? createSupabaseAdapter(supabase) : createLocalAdapter()

export const isDemo = api.mode === 'demo'
