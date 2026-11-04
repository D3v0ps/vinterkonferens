// Röstinspelning med MediaRecorder + (om webbläsaren stöder det) live-transkribering via Web Speech API.
import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { Button, Select, cx } from './ui'

export interface Recording {
  blob: Blob
  fileName: string
  transcript: string
  /** 'sv' | 'ar' | 'en' */
  lang: string
}

// Minimal typning av Web Speech API (finns inte i TS standardbibliotek)
interface SpeechAlt {
  transcript: string
}
interface SpeechResult {
  readonly length: number
  readonly isFinal: boolean
  [i: number]: SpeechAlt
}
interface SpeechEvent {
  resultIndex: number
  results: { readonly length: number; [i: number]: SpeechResult }
}
interface SpeechRec {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SpeechCtor = new () => SpeechRec

function speechCtor(): SpeechCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus']

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

function extFor(mime: string): string {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('aac')) return 'aac'
  if (mime.includes('ogg')) return 'ogg'
  return 'audio'
}

const LANGS = [
  { code: 'sv-SE', label: 'Svenska' },
  { code: 'ar-SA', label: 'العربية' },
  { code: 'en-US', label: 'English' },
]

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function VoiceRecorder({ onDone, disabled }: { onDone: (r: Recording) => void; disabled?: boolean }) {
  const [lang, setLang] = useState('sv-SE')
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [finalText, setFinalText] = useState('')
  const [interim, setInterim] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const speechRef = useRef<SpeechRec | null>(null)
  const keepAlive = useRef(false)
  const textRef = useRef({ final: '', interim: '' })
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const startingRef = useRef(false)
  const unmounted = useRef(false)

  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const hasSpeech = typeof window !== 'undefined' && !!speechCtor()

  function cleanup() {
    keepAlive.current = false
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    try {
      speechRef.current?.abort()
    } catch {
      /* ignorera */
    }
    speechRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
      if (recRef.current?.state === 'recording') recRef.current.stop()
      cleanup()
    }
  }, [])

  function startSpeech() {
    const Ctor = speechCtor()
    if (!Ctor) return
    try {
      const sr = new Ctor()
      sr.lang = lang
      sr.continuous = true
      sr.interimResults = true
      sr.onresult = (e) => {
        let fin = ''
        let tmp = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) fin += r[0].transcript + ' '
          else tmp += r[0].transcript
        }
        if (fin) textRef.current.final += fin
        textRef.current.interim = tmp
        setFinalText(textRef.current.final)
        setInterim(tmp)
      }
      sr.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return
        // T.ex. iOS som inte tillåter mikrofon till båda samtidigt – inspelningen fortsätter.
        keepAlive.current = false
        setMsg('Live-transkribering är inte tillgänglig just nu – inspelningen fortsätter.')
      }
      sr.onend = () => {
        // Chrome stänger av efter tystnad – starta om så länge vi spelar in
        if (keepAlive.current) {
          if (textRef.current.interim) {
            textRef.current.final += textRef.current.interim + ' '
            textRef.current.interim = ''
            setFinalText(textRef.current.final)
            setInterim('')
          }
          try {
            sr.start()
          } catch {
            keepAlive.current = false
          }
        }
      }
      keepAlive.current = true
      sr.start()
      speechRef.current = sr
    } catch {
      setMsg('Live-transkribering kunde inte startas – inspelningen fortsätter.')
    }
  }

  async function start() {
    // Ett andra klick medan mikrofonen frågas efter skulle annars starta en inspelning som ingen kan stoppa
    if (startingRef.current || recRef.current?.state === 'recording') return
    startingRef.current = true
    setStarting(true)
    setMsg(null)
    textRef.current = { final: '', interim: '' }
    setFinalText('')
    setInterim('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (unmounted.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      const mime = pickMime()
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      rec.onstop = () => {
        const type = rec.mimeType || mime || 'audio/webm'
        const blob = new Blob(chunks, { type })
        const transcript = (textRef.current.final + textRef.current.interim).trim()
        const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
        cleanup()
        setRecording(false)
        if (blob.size) onDone({ blob, fileName: `rostinspelning-${stamp}.${extFor(type)}`, transcript, lang: lang.slice(0, 2) })
      }
      rec.start(1000)
      recRef.current = rec
      setSeconds(0)
      if (timer.current) clearInterval(timer.current)
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000)
      setRecording(true)
      if (hasSpeech) startSpeech()
      else setMsg('Den här webbläsaren kan inte transkribera live. Ljudet sparas och kan transkriberas efteråt.')
    } catch (e) {
      cleanup()
      const name = (e as Error).name
      setMsg(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Mikrofonen är blockerad. Tillåt mikrofon för den här sidan i webbläsarens inställningar.'
          : 'Kunde inte starta inspelningen: ' + (e as Error).message,
      )
    } finally {
      startingRef.current = false
      if (!unmounted.current) setStarting(false)
    }
  }

  function stop() {
    keepAlive.current = false
    try {
      speechRef.current?.stop()
    } catch {
      /* ignorera */
    }
    if (recRef.current?.state === 'recording') recRef.current.stop()
  }

  if (!supported)
    return <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600">Inspelning stöds inte i den här webbläsaren. Spela in med telefonens röstmemo-app och ladda upp filen i stället.</p>

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={lang} onChange={(e) => setLang(e.target.value)} disabled={recording} className="w-auto" aria-label="Språk">
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </Select>
        {!recording ? (
          <Button type="button" variant="accent" onClick={start} disabled={disabled || starting}>
            <Mic className="size-4" /> Spela in
          </Button>
        ) : (
          <Button type="button" variant="danger" onClick={stop}>
            <Square className="size-4 fill-current" /> Stoppa
          </Button>
        )}
        {recording && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-700 tabular-nums">
            <span className="size-2.5 animate-pulse rounded-full bg-rose-600" /> {mmss(seconds)}
          </span>
        )}
      </div>
      {(recording || finalText) && (hasSpeech || finalText) && (
        <p dir={lang.startsWith('ar') ? 'rtl' : 'ltr'} className={cx('mt-2 min-h-6 whitespace-pre-wrap text-sm', !finalText && !interim && 'text-slate-400')}>
          {finalText || interim ? (
            <>
              {finalText}
              <span className="text-slate-400">{interim}</span>
            </>
          ) : (
            'Lyssnar …'
          )}
        </p>
      )}
      {msg && <p className="mt-2 text-xs text-amber-800">{msg}</p>}
    </div>
  )
}
