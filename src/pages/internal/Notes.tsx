import { useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, Download, FileText, ImageIcon, Paperclip, Search, Trash2, Upload, Video, X } from 'lucide-react'
import VoiceRecorder, { type Recording } from '../../components/VoiceRecorder'
import { Badge, Button, Card, Empty, ErrorText, Field, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth, useAuthorFields } from '../../lib/auth'
import { safeFileName, uuid } from '../../lib/db'
import { fileSize } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { formatDateTime } from '../../lib/time'
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

export default function Notes() {
  const auth = useAuth()
  const notes = useList('notes', { order: [{ col: 'created_at', asc: false }] })
  const [q, setQ] = useState('')
  const [committee, setCommittee] = useState('')
  const [kind, setKind] = useState('')

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return notes.data.filter(
      (n) =>
        (!committee || n.committee_id === committee) &&
        (!kind || n.kind === kind) &&
        (!s || [n.title, n.body, n.transcript, n.author_name, n.file_name].some((x) => x?.toLowerCase().includes(s))),
    )
  }, [notes.data, q, committee, kind])

  return (
    <div>
      <PageHeader title="Anteckningar" subtitle="Ladda upp skärmdumpar, bilder, dokument och röstinspelningar – direkt från mobilen." />
      <NoteForm />

      <div className="mt-8 mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök i titel, text, transkribering, namn …" className="ps-9" />
        </div>
        <Select value={committee} onChange={(e) => setCommittee(e.target.value)} aria-label="Kommitté">
          <option value="">Alla kommittéer</option>
          {auth.committees.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Typ">
          <option value="">Alla typer</option>
          {(Object.keys(KIND_LABEL) as NoteKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </Select>
      </div>

      {notes.loading ? (
        <Spinner />
      ) : notes.error ? (
        <ErrorText>{notes.error}</ErrorText>
      ) : shown.length === 0 ? (
        <Empty icon={<FileText className="size-8 text-slate-400" />}>{notes.data.length ? 'Inga anteckningar matchar filtret.' : 'Inga anteckningar ännu.'}</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </div>
      )}
    </div>
  )
}

function NoteForm() {
  const auth = useAuth()
  const author = useAuthorFields()
  const fileRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [committeeId, setCommitteeId] = useState(auth.memberships[0]?.committee_id ?? '')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [recording, setRecording] = useState<Recording | null>(null)
  const [audioLang, setAudioLang] = useState('sv')
  const [status, setStatus] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const hasAudioFile = files.some((f) => kindOf(f.name, f.type) === 'audio')
  const recUrl = useMemo(() => (recording ? URL.createObjectURL(recording.blob) : null), [recording])
  useEffect(() => () => void (recUrl && URL.revokeObjectURL(recUrl)), [recUrl])
  const busy = !!status

  function addFiles(list: FileList | null) {
    if (!list) return
    setErr(null)
    const big = Array.from(list).filter((f) => f.size > MAX_BYTES)
    if (big.length) setErr(`För stor fil (max 50 MB): ${big.map((f) => f.name).join(', ')}`)
    setFiles((prev) => [...prev, ...Array.from(list).filter((f) => f.size <= MAX_BYTES)])
    if (fileRef.current) fileRef.current.value = ''
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setOk(null)
    if (!title.trim()) return setErr('Skriv en titel.')
    if (!files.length && !recording && !body.trim()) return setErr('Skriv en text, välj en fil eller spela in.')
    if (recording && recording.blob.size > MAX_BYTES) return setErr('Inspelningen är för lång (max 50 MB).')

    const uploads: { blob: Blob; name: string; transcript: string | null; lang: string }[] = [
      ...files.map((f) => ({ blob: f as Blob, name: f.name, transcript: null, lang: audioLang })),
      ...(recording ? [{ blob: recording.blob, name: recording.fileName, transcript: recording.transcript || null, lang: recording.lang }] : []),
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
        setStatus(uploads.length > 1 ? `Laddar upp ${i + 1}/${uploads.length} …` : 'Laddar upp …')
        const path = `${uuid()}/${safeFileName(u.name)}`
        await api.upload('notes', path, u.blob)
        const k = kindOf(u.name, u.blob.type)
        const note = await api.insert('notes', {
          ...base,
          title: uploads.length > 1 ? `${title.trim()} (${i + 1}/${uploads.length})` : title.trim(),
          body: i === 0 ? body.trim() || null : null,
          transcript: u.transcript,
          file_path: path,
          file_name: u.name,
          file_type: u.blob.type || null,
          file_size: u.blob.size,
          kind: k,
        })
        if (k === 'audio' && !u.transcript && api.mode === 'supabase') {
          setStatus('Transkriberar …')
          try {
            const text = await api.transcribe('notes', path, u.lang)
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
      setOk(failed.length ? `Sparat. Transkriberingen misslyckades för ${failed.join(', ')} – försök igen med knappen på kortet.` : 'Sparat!')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setStatus(null)
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
          <Field label="Titel" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="T.ex. Möte med köket fredag" />
          </Field>
          <Field label="Kommitté">
            <Select value={committeeId} onChange={(e) => setCommitteeId(e.target.value)}>
              <option value="">Ingen / allmänt</option>
              {auth.committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Text">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Skriv eller klistra in dina anteckningar …" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Filer</span>
            <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <Button type="button" variant="secondary" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Paperclip className="size-4" /> Välj bilder, dokument eller ljud
            </Button>
            <p className="mt-1 text-xs text-slate-500">Skärmdumpar, foton, Word/PDF, röstmemon … max 50 MB per fil.</p>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm">
                    <span className="truncate">
                      {f.name} <span className="text-xs text-slate-500">{fileSize(f.size)}</span>
                    </span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-slate-500 hover:text-rose-600" aria-label="Ta bort fil">
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hasAudioFile && api.mode === 'supabase' && (
              <Field label="Språk i ljudfilen" className="mt-2">
                <Select value={audioLang} onChange={(e) => setAudioLang(e.target.value)}>
                  {TRANSCRIBE_LANGS.map((l) => (
                    <option key={l.v} value={l.v}>
                      {l.l}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Röstinspelning</span>
            {recording ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <audio controls src={recUrl ?? undefined} className="w-full" />
                {recording.transcript ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm" dir={recording.lang === 'ar' ? 'rtl' : 'ltr'}>
                    {recording.transcript}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    {api.mode === 'supabase' ? 'Ingen live-text – ljudet transkriberas när du sparar.' : 'Ingen live-text (transkribering på servern finns inte i demoläget).'}
                  </p>
                )}
                <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => setRecording(null)}>
                  <Trash2 className="size-4" /> Släng inspelningen
                </Button>
              </div>
            ) : (
              <VoiceRecorder onDone={setRecording} disabled={busy} />
            )}
          </div>
        </div>

        <ErrorText>{err}</ErrorText>
        {ok && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p>}
        <Button type="submit" loading={busy} className="w-full sm:w-auto">
          <Upload className="size-4" /> {status ?? 'Spara anteckning'}
        </Button>
      </form>
    </Card>
  )
}

/** Hämtar en (signerad) fil-URL först när kortet syns på skärmen. */
function useLazyFileUrl(path: string | null) {
  const ref = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!path || !ref.current) return
    let created: string | null = null
    let cancelled = false
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        obs.disconnect()
        api.fileUrl('notes', path).then((u) => {
          created = u
          if (!cancelled) setUrl(u)
        })
      },
      { rootMargin: '200px' },
    )
    obs.observe(ref.current)
    return () => {
      cancelled = true
      obs.disconnect()
      if (created?.startsWith('blob:')) URL.revokeObjectURL(created)
    }
  }, [path])
  return { ref, url }
}

function NoteCard({ note }: { note: Note }) {
  const auth = useAuth()
  const { ref, url } = useLazyFileUrl(note.file_path)
  const [imgFailed, setImgFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lang, setLang] = useState('sv')
  const committee = auth.committees.find((c) => c.id === note.committee_id)
  const canDelete =
    auth.isAdmin || (!!note.created_by && note.created_by === auth.userId) || (!!note.author_name && note.author_name === auth.displayName)
  const Icon = { text: FileText, image: ImageIcon, audio: AudioLines, video: Video, document: FileText, other: Paperclip }[note.kind]

  async function remove() {
    if (!confirm(`Ta bort "${note.title}"?`)) return
    setBusy(true)
    try {
      await api.remove('notes', note.id)
      if (note.file_path) await api.removeFile('notes', note.file_path).catch(() => undefined)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  async function transcribe() {
    if (!note.file_path) return
    setBusy(true)
    setErr(null)
    try {
      const text = await api.transcribe('notes', note.file_path, lang)
      if (text) await api.update('notes', note.id, { transcript: text })
      else setErr('Ingen text kunde tas fram ur ljudet.')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div ref={ref} className="flex h-full flex-col">
        {note.kind === 'image' && note.file_path && (
          <div className="flex aspect-video items-center justify-center bg-slate-100">
            {url && !imgFailed ? (
              <a href={url} target="_blank" rel="noreferrer" className="block size-full">
                <img src={url} alt={note.title} loading="lazy" onError={() => setImgFailed(true)} className="size-full object-cover" />
              </a>
            ) : (
              <ImageIcon className="size-8 text-slate-400" />
            )}
          </div>
        )}
        {note.kind === 'video' && url && <video controls preload="metadata" src={url} className="aspect-video w-full bg-black" />}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="flex items-center gap-1.5 font-semibold text-ink">
            <Icon className="size-4 shrink-0 text-slate-400" /> {note.title}
          </h3>
          {committee && (
            <Badge className="shrink-0" tone="slate">
              {committee.name}
            </Badge>
          )}
        </div>
        {note.body && <p className="whitespace-pre-wrap text-sm text-slate-700">{note.body}</p>}
        {note.kind === 'audio' && url && <audio controls preload="metadata" src={url} className="w-full" />}
        {note.file_path && (note.kind === 'document' || note.kind === 'other' || imgFailed) && (
          <a
            href={url ?? undefined}
            download={note.file_name ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm text-ink hover:bg-slate-200"
          >
            <Download className="size-4" /> {note.file_name} <span className="text-xs text-slate-500">{fileSize(note.file_size)}</span>
          </a>
        )}
        {note.transcript && (
          <details className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">Transkribering</summary>
            <p className="mt-1 whitespace-pre-wrap text-slate-700" dir="auto">
              {note.transcript}
            </p>
          </details>
        )}
        {note.kind === 'audio' && !note.transcript && api.mode === 'supabase' && (
          <div className="flex items-center gap-2">
            <Select value={lang} onChange={(e) => setLang(e.target.value)} className="w-auto py-1.5" aria-label="Språk">
              {TRANSCRIBE_LANGS.map((l) => (
                <option key={l.v} value={l.v}>
                  {l.l}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="secondary" onClick={transcribe} loading={busy}>
              {busy ? 'Transkriberar …' : 'Transkribera'}
            </Button>
          </div>
        )}
        <ErrorText>{err}</ErrorText>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-slate-500">
          <span>
            {note.author_name ?? 'Okänd'} · {formatDateTime(note.created_at)}
          </span>
          {canDelete && (
            <button onClick={remove} disabled={busy} className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Ta bort">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>
      </div>
    </Card>
  )
}
