// Supabase Edge Function: transkriberar en uppladdad ljudfil (röstanteckning).
// Använder ett OpenAI-kompatibelt /audio/transcriptions-API (t.ex. OpenAI Whisper).
// Sätt hemligheter:  supabase secrets set TRANSCRIBE_API_KEY=... [TRANSCRIBE_API_URL=...] [TRANSCRIBE_MODEL=...]
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const API_URL = Deno.env.get('TRANSCRIBE_API_URL') ?? 'https://api.openai.com/v1/audio/transcriptions'
const MODEL = Deno.env.get('TRANSCRIBE_MODEL') ?? 'whisper-1'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const key = Deno.env.get('TRANSCRIBE_API_KEY')
  if (!key) return json({ error: 'Transkribering är inte konfigurerad (TRANSCRIBE_API_KEY saknas).' }, 501)

  // Kör som den inloggade användaren så att lagringsreglerna (bara volontärer) gäller
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { bucket, path, lang } = (await req.json().catch(() => ({}))) as { bucket?: string; path?: string; lang?: string }
  if (bucket !== 'notes' || !path) return json({ error: 'bucket/path saknas' }, 400)

  const { data: file, error } = await sb.storage.from(bucket).download(path)
  if (error || !file) return json({ error: 'Kunde inte läsa filen' }, 403)
  if (file.size > 25 * 1024 * 1024) return json({ error: 'Filen är för stor för transkribering (max 25 MB).' }, 413)

  const form = new FormData()
  form.append('file', file, path.split('/').pop() ?? 'audio.webm')
  form.append('model', MODEL)
  if (lang && ['sv', 'ar', 'en'].includes(lang)) form.append('language', lang)

  const res = await fetch(API_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form })
  if (!res.ok) return json({ error: `Transkriberingstjänsten svarade ${res.status}` }, 502)
  const out = (await res.json()) as { text?: string }
  return json({ text: out.text ?? '' })
})
