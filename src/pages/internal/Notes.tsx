import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Download, ExternalLink, FileText, ImageIcon, Loader2, Paperclip, Plus, Search, Trash2, X } from 'lucide-react'
import { confirmDialog, notify } from '../../components/dialogs'
import VoiceRecorder, { type Recording } from '../../components/VoiceRecorder'
import { Button, Empty, ErrorText, Input, Modal, PageHeader, Select, Spinner, Textarea, cx } from '../../components/ui'
import { api, isDemo } from '../../lib/api'
import { useAuth, useAuthorFields } from '../../lib/auth'
import { safeFileName, uuid, type Bucket } from '../../lib/db'
import { fileSize } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { isArtifact, saveFile } from '../../lib/platform'
import { formatShortDate, localTime } from '../../lib/time'
import type { Note, NoteKind } from '../../lib/types'

const MAX_BYTES = 50 * 1024 * 1024
const ACCEPT = 'image/*,audio/*,video/*,.pdf,.doc,.docx,.txt,.rtf,.odt,.pages,.heic,.heif,.m4a'

const KIND_LABEL: Record<NoteKind, string> = {
  text: 'Text',
  image: 'Bild',
  audio: 'Ljud',
  video: 'Video',
  document: 'Dokument',
  other: 'Övrigt',
}

function kindOf(name: string, type: string): NoteKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (type.startsWith('image/') || ['heic', 'heif', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (type.startsWith('audio/') || ['m4a', 'mp3', 'wav', 'aac', 'ogg', 'opus', 'amr', 'caf', '3gp'].includes(ext)) return 'audio'
  if (type.startsWith('video/') || ['mov', 'mp4', 'm4v'].includes(ext)) return 'video'
  if (
    type.startsWith('text/') ||
    /pdf|word|officedocument|opendocument|rtf/.test(type) ||
    ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'pages', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'key', 'numbers'].includes(ext)
  )
    return 'document'
  return 'other'
}

const TRANSCRIBE_LANGS = [
  { v: 'sv', l: 'Svenska' },
  { v: 'ar', l: 'Arabiska' },
  { v: 'en', l: 'Engelska' },
]

// ---------- Delat med Inköp (kvitton) ----------

/** Fråga i GOV.UK-stil: etikett, ledtext under etiketten, felet tydligt ovanför fältet. */
export function Question({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="block text-base font-medium text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-base text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-base font-medium text-rose-700">{error}</span>}
      <span className={cx('mt-2 block', error && '[&_.field]:border-rose-600')}>{children}</span>
    </label>
  )
}

/** Sök och filter visas först när listan är längre än så här – annars står de bara i vägen. */
export const FILTER_MIN = 8

/** Sökfältet ovanför en lång lista. */
export function SearchField({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="ps-9" aria-label={label} />
    </div>
  )
}

/** Filtren hopfällda under "Filtrera", så att innehållet kommer först. */
export function FilterDetails({ active, children }: { active: number; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /> Filtrera
        {active > 0 && <span className="font-normal text-muted">· {active === 1 ? '1 filter valt' : `${active} filter valda`}</span>}
      </summary>
      <div className="grid gap-4 pt-2 pb-2 sm:grid-cols-3">{children}</div>
    </details>
  )
}

/** "Visar 3 av 12" när sökning eller filter är aktiva, med ett sätt att visa allt igen. */
export function FilterCount({ shown, total, onReset }: { shown: number; total: number; onReset: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 text-base text-muted">
      <span>
        Visar {shown} av {total}
      </span>
      <button type="button" onClick={onReset} className={linkCls}>
        Visa alla
      </button>
    </p>
  )
}

/** Filändelser som artifactens nedladdning tar emot. Utanför artifacten går allt att spara. */
const SAVE_EXT = new Set(['gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'mov', 'txt', 'json', 'md', 'docx', 'pptx', 'epub', 'csv', 'ttf', 'html', 'svg', 'pdf', 'xlsx', 'zip', 'fig'])

export function canSaveFile(name: string | null | undefined) {
  if (!name) return false
  if (!isArtifact) return true
  const dot = name.lastIndexOf('.')
  return dot > 0 && SAVE_EXT.has(name.slice(dot + 1).toLowerCase())
}

/** I artifacten går blob:-adresser bara att visa på sidan, inte att öppna i ny flik. /_blob/ och vanliga länkar går. */
export function canOpenUrl(url: string | null | undefined): url is string {
  return !!url && !(isArtifact && url.startsWith('blob:'))
}

/** Hämtar filen och sparar den på enheten (plattformens nedladdning i artifacten). */
export async function saveStoredFile(bucket: Bucket, path: string, url: string, name: string) {
  try {
    // Signerade länkar i Supabase går ut – hämta en ny innan nedladdningen
    const src = api.mode === 'supabase' ? ((await api.fileUrl(bucket, path)) ?? url) : url
    let blob: Blob
    try {
      const res = await fetch(src)
      if (!res.ok) throw new Error(String(res.status))
      blob = await res.blob()
    } catch {
      throw new Error('Filen kunde inte hämtas. Försök igen om en stund.')
    }
    if (await saveFile(name, blob, blob.type || undefined)) notify(`${name} sparad`)
  } catch (e) {
    notify((e as Error).message, 'error')
  }
}

const linkCls = 'inline-flex min-h-11 items-center gap-1.5 text-base font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink'

/** Filnamn med "Öppna" och "Spara" när plattformen tillåter det. */
export function FileLinks({ bucket, path, url, name, size, openLabel = 'Öppna' }: { bucket: Bucket; path: string; url: string | null; name: string; size?: number | null; openLabel?: string }) {
  const [saving, setSaving] = useState(false)
  const open = canOpenUrl(url)
  const save = !!url && canSaveFile(name)
  return (
    <div>
      <p className="flex min-w-0 items-center gap-2 text-base text-ink">
        <FileText className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="truncate">{name}</span>
        {!!size && <span className="shrink-0 text-sm text-muted">{fileSize(size)}</span>}
      </p>
      {url && (open || save) && (
        <div className="flex flex-wrap gap-x-5">
          {open && (
            <a href={url} target="_blank" rel="noopener noreferrer" className={linkCls}>
              <ExternalLink className="size-4" aria-hidden /> {openLabel}
            </a>
          )}
          {save && (
            <button
              type="button"
              className={cx(linkCls, 'disabled:opacity-60')}
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                await saveStoredFile(bucket, path, url, name)
                setSaving(false)
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />} Spara
            </button>
          )}
        </div>
      )}
      {url && !open && !save && <p className="mt-1 text-base text-muted">Den här filtypen kan inte öppnas eller sparas här.</p>}
    </div>
  )
}

// ---------- Sidan ----------

export default function Notes() {
  const auth = useAuth()
  const notes = useList('notes', { order: [{ col: 'created_at', asc: false }] })
  const [creating, setCreating] = useState(false)
  const form = useRef<FormState>({ dirty: false, busy: false })
  const [q, setQ] = useState('')
  const [committee, setCommittee] = useState('')
  const [kind, setKind] = useState('')

  // Sök och filter bara när listan är lång; annars gäller de inte (så att inget göms utan att synas)
  const filtering = notes.data.length > FILTER_MIN
  const active = filtering ? [committee, kind].filter(Boolean).length : 0
  const shown = useMemo(() => {
    if (!filtering) return notes.data
    const s = q.trim().toLowerCase()
    return notes.data.filter(
      (n) =>
        (!committee || n.committee_id === committee) &&
        (!kind || n.kind === kind) &&
        (!s || [n.title, n.body, n.transcript, n.author_name, n.file_name].some((x) => x?.toLowerCase().includes(s))),
    )
  }, [notes.data, filtering, q, committee, kind])
  const narrowed = filtering && (active > 0 || !!q.trim())

  async function closeForm() {
    // Pågår en uppladdning fortsätter den när rutan stängs; annars fråga innan något osparat slängs
    if (form.current.dirty && !form.current.busy) {
      const ok = await confirmDialog({
        title: 'Släng anteckningen?',
        message: 'Det du har skrivit, valt eller spelat in sparas inte.',
        confirmLabel: 'Släng',
        cancelLabel: 'Fortsätt',
        danger: true,
      })
      if (!ok) return
    }
    setCreating(false)
  }

  const resetFilters = () => {
    setQ('')
    setCommittee('')
    setKind('')
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Anteckningar"
        subtitle="Skärmdumpar, foton, dokument och röstinspelningar – samlat på ett ställe, direkt från mobilen."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> Ny anteckning
          </Button>
        }
      />

      <section aria-label="Alla anteckningar">
        {filtering && (
          <div className="mb-4 space-y-1">
            <SearchField value={q} onChange={setQ} label="Sök bland anteckningarna" placeholder="Sök i titel, text, namn …" />
            <FilterDetails active={active}>
              <Question label="Kommitté">
                <Select value={committee} onChange={(e) => setCommittee(e.target.value)}>
                  <option value="">Alla kommittéer</option>
                  {auth.committees.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Question>
              <Question label="Typ">
                <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="">Alla typer</option>
                  {(Object.keys(KIND_LABEL) as NoteKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Question>
            </FilterDetails>
            {narrowed && shown.length > 0 && <FilterCount shown={shown.length} total={notes.data.length} onReset={resetFilters} />}
          </div>
        )}

        {notes.loading ? (
          <Spinner />
        ) : notes.error ? (
          <ErrorText>{notes.error}</ErrorText>
        ) : shown.length === 0 ? (
          <Empty icon={<FileText className="size-8 text-muted" aria-hidden />}>
            {notes.data.length ? (
              <>
                Inga anteckningar matchar sökningen.
                <button type="button" onClick={resetFilters} className={linkCls}>
                  Visa alla
                </button>
              </>
            ) : (
              'Inga anteckningar ännu. Den första du sparar hamnar här.'
            )}
          </Empty>
        ) : (
          <div className="divide-y divide-line border-y border-line">
            {shown.map((n) => (
              <NoteItem key={n.id} note={n} />
            ))}
          </div>
        )}
      </section>

      <Modal open={creating} onClose={closeForm} title="Ny anteckning" persistent>
        <NoteForm state={form} onSaved={() => setCreating(false)} onCancel={closeForm} />
      </Modal>
    </div>
  )
}

/** Formulärets läge, så att sidan kan fråga innan osparat slängs. */
type FormState = { dirty: boolean; busy: boolean }

function NoteForm({ state, onSaved, onCancel }: { state: React.MutableRefObject<FormState>; onSaved: () => void; onCancel: () => void }) {
  const auth = useAuth()
  const author = useAuthorFields()
  const fileRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const filesHintId = useId()
  const [title, setTitle] = useState('')
  const [titleErr, setTitleErr] = useState<string | null>(null)
  const [committeeId, setCommitteeId] = useState(auth.memberships[0]?.committee_id ?? '')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [recording, setRecording] = useState<Recording | null>(null)
  const [audioLang, setAudioLang] = useState('sv')
  const [status, setStatus] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const transcribes = api.mode === 'supabase'
  const hasAudioFile = files.some((f) => kindOf(f.name, f.type) === 'audio')
  const needsLang = transcribes && (hasAudioFile || (!!recording && !recording.transcript))
  const recUrl = useMemo(() => (recording ? URL.createObjectURL(recording.blob) : null), [recording])
  useEffect(() => () => void (recUrl && URL.revokeObjectURL(recUrl)), [recUrl])
  const busy = !!status
  const dirty = !!(title.trim() || body.trim() || files.length || recording)
  useEffect(() => {
    state.current = { dirty, busy }
  }, [state, dirty, busy])
  // Stängs rutan medan något sparas fortsätter sparandet – då visas resultatet som ett meddelande
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  function addFiles(list: FileList | null) {
    // Kopiera listan först: FileList är levande och töms när fältet nollställs, innan React hunnit köra uppdateringen
    const picked = Array.from(list ?? [])
    if (fileRef.current) fileRef.current.value = ''
    if (!picked.length) return
    setErr(null)
    const big = picked.filter((f) => f.size > MAX_BYTES)
    if (big.length) setErr(`${big.map((f) => f.name).join(', ')} är för stor. En fil får vara högst 50 MB.`)
    const ok = picked.filter((f) => f.size <= MAX_BYTES)
    if (ok.length) setFiles((prev) => [...prev, ...ok])
  }

  function onRecorded(r: Recording) {
    setRecording(r)
    setAudioLang(r.lang)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setTitleErr(null)
    if (!title.trim()) {
      setTitleErr('Skriv en titel, till exempel ”Möte med köket fredag”.')
      titleRef.current?.focus()
      return
    }
    if (!files.length && !recording && !body.trim()) return setErr('Skriv en text, välj en fil eller spela in – något av det behövs.')
    if (recording && recording.blob.size > MAX_BYTES) return setErr('Inspelningen är för lång. Den får vara högst 50 MB.')

    const uploads: { src: File | null; blob: Blob; name: string; transcript: string | null; lang: string }[] = [
      ...files.map((f) => ({ src: f, blob: f as Blob, name: f.name, transcript: null, lang: audioLang })),
      ...(recording ? [{ src: null, blob: recording.blob, name: recording.fileName, transcript: recording.transcript || null, lang: recording.transcript ? recording.lang : audioLang }] : []),
    ]
    const base = {
      committee_id: committeeId || null,
      ...author(),
    }
    const failed: string[] = []
    try {
      if (!uploads.length) {
        setStatus('Sparar …')
        await api.insert('notes', { ...base, title: title.trim(), body: body.trim() || null, transcript: null, file_path: null, file_name: null, file_type: null, file_size: null, kind: 'text' })
      }
      for (const [i, u] of uploads.entries()) {
        setStatus(uploads.length > 1 ? `Laddar upp ${i + 1} av ${uploads.length} …` : 'Laddar upp …')
        const path = `${uuid()}/${safeFileName(u.name)}`
        // Adaptern kan lägga filen på en annan sökväg (t.ex. i artifacten) – spara den den ger tillbaka
        const stored = await api.upload('notes', path, u.blob)
        const k = kindOf(u.name, u.blob.type)
        const note = await api
          .insert('notes', {
            ...base,
            title: uploads.length > 1 ? `${title.trim()} (${i + 1}/${uploads.length})` : title.trim(),
            body: i === 0 ? body.trim() || null : null,
            transcript: u.transcript,
            file_path: stored,
            file_name: u.name,
            file_type: u.blob.type || null,
            file_size: u.blob.size,
            kind: k,
          })
          .catch(async (e) => {
            await api.removeFile('notes', stored).catch(() => undefined)
            throw e
          })
        // Ta bort det som sparats ur formuläret direkt, så att ett nytt försök efter ett fel inte skapar dubbletter
        if (u.src) setFiles((prev) => prev.filter((f) => f !== u.src))
        else setRecording(null)
        if (i === 0) setBody('')
        if (k === 'audio' && !u.transcript && transcribes) {
          setStatus('Transkriberar …')
          try {
            const text = await api.transcribe('notes', stored, u.lang)
            if (text) await api.update('notes', note.id, { transcript: text })
          } catch {
            failed.push(u.name)
          }
        }
      }
      setTitle('')
      setBody('')
      setFiles([])
      setRecording(null)
      if (alive.current) onSaved()
      if (failed.length) notify(`Sparat, men transkriberingen misslyckades för ${failed.join(', ')}. Försök igen från anteckningen.`, 'error')
      else notify('Anteckningen är sparad')
    } catch (e) {
      const msg = (e as Error).message
      if (alive.current) setErr(msg)
      else notify(`Anteckningen ”${title.trim()}” kunde inte sparas helt: ${msg}`, 'error')
    } finally {
      setStatus(null)
    }
  }

  return (
    <div>
      <p className="text-base text-muted">Titeln behövs. Skriv en text, lägg till filer eller spela in – det du har.</p>
      <form onSubmit={submit} className="mt-5 space-y-6" noValidate>
        <Question label="Titel" error={titleErr}>
          <Input
            ref={titleRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setTitleErr(null)
            }}
            aria-invalid={!!titleErr}
            autoComplete="off"
          />
        </Question>
        <Question label="Kommitté">
          <Select value={committeeId} onChange={(e) => setCommitteeId(e.target.value)}>
            <option value="">Ingen, gäller alla</option>
            {auth.committees.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Question>
        <Question label="Text">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
        </Question>

        <div>
          <p className="text-base font-medium text-ink">Filer</p>
          <p id={filesHintId} className="mt-0.5 text-base text-muted">
            Skärmdumpar, foton, Word, PDF eller röstmemon. Högst 50 MB per fil.
          </p>
          <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => addFiles(e.target.files)} />
          <Button type="button" variant="secondary" className="mt-2 w-full sm:w-auto" onClick={() => fileRef.current?.click()} disabled={busy} aria-describedby={filesHintId}>
            <Paperclip className="size-4" aria-hidden /> Välj filer
          </Button>
          {files.length > 0 && (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-1">
                  <span className="min-w-0 truncate text-base">
                    {f.name} <span className="text-sm text-muted">{fileSize(f.size)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="grid size-11 shrink-0 place-items-center rounded-md text-muted hover:bg-slate-100 hover:text-ink"
                    aria-label={`Ta bort ${f.name}`}
                    disabled={busy}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-base font-medium text-ink">Röstinspelning</p>
          <div className="mt-2">
            {recording ? (
              <div>
                <audio controls src={recUrl ?? undefined} className="w-full" />
                {recording.transcript && (
                  <p className="mt-2 whitespace-pre-wrap text-base text-slate-700" dir={recording.lang === 'ar' ? 'rtl' : 'ltr'}>
                    {recording.transcript}
                  </p>
                )}
                {!recording.transcript && transcribes && <p className="mt-2 text-base text-muted">Ljudet skrivs ut till text när du sparar.</p>}
                <Button type="button" variant="ghost" className="mt-1 -ms-4" onClick={() => setRecording(null)} disabled={busy}>
                  <Trash2 className="size-4" aria-hidden /> Släng inspelningen
                </Button>
              </div>
            ) : (
              <VoiceRecorder onDone={onRecorded} disabled={busy} />
            )}
          </div>
        </div>

        {needsLang && (
          <Question label="Språk i ljudet" hint="Används när ljudet skrivs ut till text.">
            <Select value={audioLang} onChange={(e) => setAudioLang(e.target.value)} className="sm:w-60">
              {TRANSCRIBE_LANGS.map((l) => (
                <option key={l.v} value={l.v}>
                  {l.l}
                </option>
              ))}
            </Select>
          </Question>
        )}

        <ErrorText>{err}</ErrorText>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {busy ? 'Stäng' : 'Avbryt'}
          </Button>
          <Button type="submit" loading={busy}>
            {status ?? 'Spara anteckning'}
          </Button>
        </div>
      </form>
    </div>
  )
}

/** Signerade länkar gäller en timme (supabaseAdapter.fileUrl) – hämta en ny innan dess. */
const URL_MAX_AGE = 50 * 60 * 1000

/** Demoläget skapar en ny blob:-adress per anrop; artifactens adresser cachas och får inte släppas. */
function releaseUrl(u: string | null) {
  if (u && api.mode === 'demo' && u.startsWith('blob:')) URL.revokeObjectURL(u)
}

/** Hämtar filens adress först när anteckningen syns på skärmen. */
function useLazyFileUrl(path: string | null) {
  const ref = useRef<HTMLElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [nonce, setNonce] = useState(0)
  const signedAt = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!path || !el) return
    let created: string | null = null
    let cancelled = false
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        obs.disconnect()
        api
          .fileUrl('notes', path)
          .catch(() => null)
          .then((u) => {
            if (cancelled) return releaseUrl(u)
            created = u
            signedAt.current = Date.now()
            setUrl(u)
            setMissing(!u)
          })
      },
      { rootMargin: '200px' },
    )
    obs.observe(el)
    return () => {
      cancelled = true
      obs.disconnect()
      releaseUrl(created)
    }
  }, [path, nonce])

  const stale = () => api.mode === 'supabase' && !!url && Date.now() - signedAt.current > URL_MAX_AGE

  // Supabase: förnya länken i tid så att "Öppna" och bilder fortsätter att fungera – men inte mitt i uppspelning
  useEffect(() => {
    if (api.mode !== 'supabase' || !url) return
    const t = setInterval(() => {
      const playing = Array.from(ref.current?.querySelectorAll('audio, video') ?? []).some((m) => !(m as HTMLMediaElement).paused)
      if (!playing && Date.now() - signedAt.current > URL_MAX_AGE) setNonce((n) => n + 1)
    }, 60_000)
    return () => clearInterval(t)
  }, [url])

  return {
    ref,
    url,
    missing,
    /** Laddar om ljud/video med en ny länk om den gamla har gått ut. */
    refreshIfStale: () => void (stale() && setNonce((n) => n + 1)),
  }
}

function NoteItem({ note }: { note: Note }) {
  const auth = useAuth()
  const { ref, url, missing, refreshIfStale } = useLazyFileUrl(note.file_path)
  const [imgFailed, setImgFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lang, setLang] = useState('sv')
  const committee = auth.committees.find((c) => c.id === note.committee_id)
  // Samma regel som RLS för notes (skapare eller admin); namnet räcker bara i demoläget
  const canEdit = auth.isAdmin || (!!note.created_by && note.created_by === auth.userId)
  const canDelete = canEdit || (isDemo && !!note.author_name && note.author_name === auth.displayName)
  const transcribes = api.mode === 'supabase'
  const name = note.file_name ?? 'Fil'
  const meta = [note.author_name ?? 'Okänd', committee?.name, `${formatShortDate(note.created_at)} ${localTime(note.created_at)}`].filter(Boolean).join(' · ')

  async function remove() {
    const ok = await confirmDialog({
      title: 'Ta bort anteckningen?',
      message: note.file_path ? `”${note.title}” och filen tas bort för alla.` : `”${note.title}” tas bort för alla.`,
      confirmLabel: 'Ta bort',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    setErr(null)
    try {
      await api.remove('notes', note.id)
      if (note.file_path) await api.removeFile('notes', note.file_path).catch(() => undefined)
      notify('Anteckningen är borttagen')
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  async function transcribe() {
    if (!note.file_path || !canEdit) return
    setBusy(true)
    setErr(null)
    try {
      const text = await api.transcribe('notes', note.file_path, lang)
      if (text) await api.update('notes', note.id, { transcript: text })
      else setErr('Ingen text kunde tas fram ur ljudet. Prova ett annat språk eller en tydligare inspelning.')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const showImage = note.kind === 'image' && !!note.file_path && !imgFailed && !missing
  const showFile = !!note.file_path && !missing && (note.kind === 'document' || note.kind === 'other' || imgFailed)

  return (
    <article ref={ref} className="py-5">
      <div className="flex items-start gap-3">
        <h2 className="min-w-0 flex-1 pt-2 text-lg font-semibold text-ink break-words">{note.title}</h2>
        {canDelete && (
          <button
            onClick={remove}
            disabled={busy}
            className="no-print -me-2 grid size-11 shrink-0 place-items-center rounded-md text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            aria-label={`Ta bort ${note.title}`}
            title="Ta bort"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {note.body && <p className="mt-1 whitespace-pre-wrap text-base text-slate-700 break-words">{note.body}</p>}

      {showImage &&
        (url ? (
          canOpenUrl(url) ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 block w-fit max-w-full" aria-label={`Öppna bilden ${name}`}>
              <img src={url} alt={note.title} loading="lazy" decoding="async" onError={() => setImgFailed(true)} className="max-h-[28rem] max-w-full rounded-md border border-line object-contain" />
            </a>
          ) : (
            <img src={url} alt={note.title} loading="lazy" decoding="async" onError={() => setImgFailed(true)} className="mt-3 max-h-[28rem] max-w-full rounded-md border border-line object-contain" />
          )
        ) : (
          <div className="mt-3 grid h-40 max-w-sm place-items-center rounded-md bg-ice" aria-hidden>
            <ImageIcon className="size-6 text-muted" />
          </div>
        ))}

      {note.kind === 'video' && url && <video controls playsInline preload="metadata" src={url} onError={refreshIfStale} className="mt-3 aspect-video w-full rounded-md bg-black" />}

      {note.kind === 'audio' && url && <audio controls preload="metadata" src={url} onError={refreshIfStale} className="mt-3 w-full" />}

      {showFile && (
        <div className="mt-3">
          <FileLinks bucket="notes" path={note.file_path!} url={url} name={name} size={note.file_size} />
        </div>
      )}

      {missing && <p className="mt-3 text-base text-muted">Filen {note.file_name ? `”${note.file_name}” ` : ''}hittades inte.</p>}

      {note.transcript && (
        <details className="group mt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /> Utskrift av ljudet
          </summary>
          <p className="whitespace-pre-wrap text-base text-slate-700" dir="auto">
            {note.transcript}
          </p>
        </details>
      )}

      {note.kind === 'audio' && !note.transcript && isDemo && <p className="mt-1.5 text-base text-muted">Utskrift av ljudet finns i den riktiga versionen.</p>}

      {note.kind === 'audio' && !note.transcript && transcribes && canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={lang} onChange={(e) => setLang(e.target.value)} className="w-auto" aria-label="Språk i ljudet">
            {TRANSCRIBE_LANGS.map((l) => (
              <option key={l.v} value={l.v}>
                {l.l}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={transcribe} loading={busy}>
            {busy ? 'Skriver ut …' : 'Skriv ut till text'}
          </Button>
        </div>
      )}

      {err && (
        <div className="mt-3">
          <ErrorText>{err}</ErrorText>
        </div>
      )}

      <p className="mt-3 text-sm text-muted">{meta}</p>
    </article>
  )
}
