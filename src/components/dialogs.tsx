// Egna dialogrutor och aviseringar. confirm()/prompt()/alert() visas inte i en
// artifact (och ser olika ut i olika webbläsare), så allt går via de här.
import { useEffect, useRef, useState } from 'react'
import { Button, Field, Input, Modal } from './ui'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface PromptOptions extends ConfirmOptions {
  label: string
  defaultValue?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  placeholder?: string
  /** Returnera ett felmeddelande för ogiltigt värde, annars null. */
  validate?: (v: string) => string | null
}

type Request =
  | ({ kind: 'confirm'; resolve: (v: boolean) => void } & ConfirmOptions)
  | ({ kind: 'prompt'; resolve: (v: string | null) => void } & PromptOptions)

let enqueue: ((r: Request) => void) | null = null
const waiting: Request[] = []

function push(r: Request) {
  if (enqueue) enqueue(r)
  else waiting.push(r)
}

/** Fråga om bekräftelse. Ger true om personen bekräftar. */
export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const o = typeof opts === 'string' ? { title: opts } : opts
  return new Promise((resolve) => push({ kind: 'confirm', resolve, ...o }))
}

/** Be om ett värde. Ger null om personen avbryter. */
export function promptDialog(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => push({ kind: 'prompt', resolve, ...opts }))
}

// ---------- Korta aviseringar ----------
type Toast = { id: number; text: string; tone: 'info' | 'error' }
let showToast: ((t: Toast) => void) | null = null
let toastSeq = 0

/** Kort meddelande längst ner på skärmen, t.ex. "Sparat" eller ett fel. */
export function notify(text: string, tone: Toast['tone'] = 'info') {
  showToast?.({ id: ++toastSeq, text, tone })
}

export function DialogHost() {
  const [queue, setQueue] = useState<Request[]>([])
  const [value, setValue] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const current = queue[0]
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    enqueue = (r) => setQueue((q) => [...q, r])
    if (waiting.length) setQueue((q) => [...q, ...waiting.splice(0)])
    showToast = (t) => {
      setToasts((ts) => [...ts, t])
      setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), t.tone === 'error' ? 6000 : 3000)
    }
    return () => {
      enqueue = null
      showToast = null
    }
  }, [])

  useEffect(() => {
    setValue(current?.kind === 'prompt' ? (current.defaultValue ?? '') : '')
    setErr(null)
  }, [current])

  function finish(ok: boolean) {
    if (!current) return
    if (current.kind === 'confirm') current.resolve(ok)
    else {
      if (ok && current.validate) {
        const e = current.validate(value)
        if (e) return setErr(e)
      }
      current.resolve(ok ? value : null)
    }
    setQueue((q) => q.slice(1))
  }

  return (
    <>
      <Modal open={!!current} onClose={() => finish(false)} title={current?.title ?? ''}>
        {current && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              finish(true)
            }}
          >
            {current.message && <p className="text-base text-slate-700">{current.message}</p>}
            {current.kind === 'prompt' && (
              <Field label={current.label}>
                <Input
                  ref={inputRef}
                  autoFocus
                  value={value}
                  inputMode={current.inputMode}
                  placeholder={current.placeholder}
                  onChange={(e) => {
                    setValue(e.target.value)
                    setErr(null)
                  }}
                  aria-invalid={!!err}
                />
                {err && <span className="mt-1 block text-sm text-rose-700">{err}</span>}
              </Field>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => finish(false)}>
                {current.cancelLabel ?? 'Avbryt'}
              </Button>
              <Button type="submit" variant={current.danger ? 'danger-solid' : 'primary'} autoFocus={current.kind === 'confirm'}>
                {current.confirmLabel ?? 'OK'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-base shadow-lg ${t.tone === 'error' ? 'bg-rose-700 text-white' : 'bg-ink text-white'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  )
}
