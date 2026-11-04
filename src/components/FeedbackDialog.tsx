import { useState } from 'react'
import { Star } from 'lucide-react'
import { api } from '../lib/api'
import { uuid } from '../lib/db'
import { tr } from '../lib/format'
import { deviceId, useLocalStorage } from '../lib/hooks'
import { useI18n } from '../lib/i18n'
import type { FeedbackAnswers, Session } from '../lib/types'
import { Button, ErrorText, Modal, Textarea, cx } from './ui'

export function useRated() {
  const [rated, setRated] = useLocalStorage<string[]>('vk-rated', [])
  return { rated, isRated: (id: string) => rated.includes(id), markRated: (id: string) => setRated([...new Set([...rated, id])]) }
}

type Q = { key: keyof FeedbackAnswers; options: string[] }
// Tre snabba kryssfrågor. "arrival" hjälper oss förstå om publiken hinner in till starten.
const QUESTIONS: Q[] = [
  { key: 'relevance', options: ['yes', 'partly', 'no'] },
  { key: 'length', options: ['short', 'good', 'long'] },
  { key: 'arrival', options: ['early', 'ontime', 'late'] },
]

export default function FeedbackDialog({ session, onClose, onDone }: { session: Session | null; onClose: () => void; onDone: (id: string) => void }) {
  const { t, lang } = useI18n()
  const [rating, setRating] = useState(0)
  const [answers, setAnswers] = useState<FeedbackAnswers>({})
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function reset() {
    setRating(0)
    setAnswers({})
    setComment('')
    setErr(null)
    setSent(false)
    onClose()
  }

  async function submit() {
    if (!session) return
    if (!rating) return setErr(t.chooseStars)
    setBusy(true)
    setErr(null)
    try {
      await api.insert(
        'feedback',
        { id: uuid(), session_id: session.id, rating, answers, comment: comment.trim() || null, device_id: deviceId(), lang },
        { returning: false },
      )
      setSent(true)
      onDone(session.id)
    } catch (e) {
      // Redan betygsatt från den här enheten räknas som klart
      if (/duplicate|unique/i.test((e as Error).message)) {
        setSent(true)
        onDone(session.id)
      } else setErr(t.error)
    } finally {
      setBusy(false)
    }
  }

  const label = (key: string) => (t as unknown as Record<string, string>)[key]

  return (
    <Modal open={!!session} onClose={reset} title={sent ? t.rated : t.rateTitle}>
      {session &&
        (sent ? (
          <div className="py-4 text-center">
            <div className="text-5xl">🙏</div>
            <p className="mt-3 font-medium text-ink">{t.rated}</p>
            <Button className="mt-5" onClick={reset}>
              {t.close}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="font-semibold text-slate-800">{tr(session.title, lang)}</p>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">{t.stars}</legend>
              <div className="flex justify-center gap-1.5" dir="ltr">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setRating(n)} aria-label={t.starN(n)} aria-pressed={rating === n} className="rounded-lg p-1">
                    <Star className={cx('size-11 transition', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
                  </button>
                ))}
              </div>
            </fieldset>
            {QUESTIONS.map((q) => (
              <fieldset key={q.key}>
                <legend className="mb-2 text-sm font-medium text-slate-700">{label(`q_${q.key}`)}</legend>
                <div className="grid grid-cols-3 gap-2">
                  {q.options.map((o) => {
                    const on = answers[q.key] === o
                    return (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setAnswers({ ...answers, [q.key]: on ? undefined : o })}
                        className={cx('rounded-xl border px-2 py-3 text-sm font-medium', on ? 'border-ink bg-ink text-white' : 'border-slate-300 bg-white text-slate-700')}
                      >
                        {on ? '✓ ' : ''}
                        {label(`a_${o}`)}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ))}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{t.comment}</span>
              <Textarea maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t.commentPh} />
            </label>
            <ErrorText>{err}</ErrorText>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={reset}>
                {t.cancel}
              </Button>
              <Button variant="accent" className="flex-1" loading={busy} onClick={submit}>
                {busy ? t.sending : t.send}
              </Button>
            </div>
          </div>
        ))}
    </Modal>
  )
}
