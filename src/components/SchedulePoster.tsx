// Schemat för en dag som bild (PNG) i samma stil som konferensens affischer, att dela i sociala medier
// eller skriva ut. Bilden ritas i webbläsaren (lib/posterCanvas.ts) och sparas med plattformens nedladdning.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { useConference } from '../lib/conference'
import { useList } from '../lib/hooks'
import { LANG_LABEL } from '../lib/i18n'
import { saveFile } from '../lib/platform'
import { POSTER_H, POSTER_W, canvasToPng, renderPoster } from '../lib/posterCanvas'
import { formatShortDay, localDate } from '../lib/time'
import { LANGS, type Lang } from '../lib/types'
import { notify } from './dialogs'
import { Button, Checkbox, ErrorText, Field, Modal, Select, Spinner } from './ui'

export function SchedulePosterDialog({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  return (
    <Modal open={open} onClose={onClose} title={`Schemabild – ${date ? formatShortDay(date) : ''}`} wide>
      {open && date && <PosterBody date={date} />}
    </Modal>
  )
}

function PosterBody({ date }: { date: string }) {
  const { settings } = useConference()
  const { data, loading } = useList('sessions', { order: [{ col: 'starts_at' }] })
  const [lang, setLang] = useState<Lang>('sv')
  const [withDrafts, setWithDrafts] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)

  const day = useMemo(() => data.filter((s) => localDate(s.starts_at) === date && s.audience !== 'kids'), [data, date])
  const drafts = day.filter((s) => !s.published).length
  const list = useMemo(() => (withDrafts ? day : day.filter((s) => s.published)), [day, withDrafts])

  // Rita bara om när något som syns på bilden har ändrats.
  const signature = JSON.stringify([lang, settings.conference_name, settings.venue, list])

  useEffect(() => {
    if (loading) return
    let live = true
    setBusy(true)
    setErr(null)
    const c = document.createElement('canvas')
    renderPoster({ conferenceName: settings.conference_name, venue: settings.venue, date, lang, sessions: list }, c)
      .then(canvasToPng)
      .then((png) => {
        if (!live) return
        canvas.current = c
        setPreview(URL.createObjectURL(png))
      })
      .catch((e: Error) => live && setErr(e.message || 'Bilden kunde inte skapas.'))
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
    // signature täcker list, lang och inställningarna
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, loading, date])

  // Förra förhandsvisningen släpps när en ny kommer (och när rutan stängs).
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  async function save() {
    if (!canvas.current) return
    setSaving(true)
    try {
      const name = `schema-${date}-${lang}.png`
      const saved = await saveFile(name, await canvasToPng(canvas.current), 'image/png')
      if (saved) notify(`${name} sparad`)
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-base text-muted">Samma stil som affischerna. Talarfoton läggs till under varje programpunkt.</p>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <Field label="Språk" className="w-48">
          <Select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {LANG_LABEL[l]}
              </option>
            ))}
          </Select>
        </Field>
        {drafts > 0 && <Checkbox label={`Ta med utkast (${drafts})`} checked={withDrafts} onChange={setWithDrafts} />}
        {/* Knappen överst, så att den syns utan att man behöver rulla förbi bilden. */}
        <Button className="ms-auto" onClick={save} loading={saving} disabled={busy || !preview}>
          <Download className="size-4" aria-hidden /> Spara bild
        </Button>
      </div>

      <div className="relative grid place-items-center rounded-lg bg-ice p-3" style={{ minHeight: '12rem' }}>
        {preview && (
          <img
            src={preview}
            width={POSTER_W}
            height={POSTER_H}
            alt={`Schemat för ${formatShortDay(date)} som bild`}
            className="h-auto max-h-[60vh] w-auto max-w-full rounded-md shadow-sm"
            style={{ opacity: busy ? 0.6 : 1 }}
          />
        )}
        {busy && (
          <div className={preview ? 'absolute inset-0 grid place-items-center' : ''}>
            <Spinner label="Ritar bilden…" />
          </div>
        )}
      </div>
      {!busy && list.length === 0 && (
        <p className="text-base text-muted">
          {drafts > 0 ? 'Dagens programpunkter är utkast. Kryssa i "Ta med utkast" för att se dem på bilden.' : 'Det finns inget program för dagen ännu.'}
        </p>
      )}
      <ErrorText>{err}</ErrorText>
    </div>
  )
}
