import { useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import type { ConferenceDay, Shift, Volunteer } from '../../lib/types'
import { formatShortDay, zonedToUtc } from '../../lib/time'
import { confirmDialog } from '../dialogs'
import { Button, Checkbox, ErrorText, Field, Input, Modal, Select, Textarea } from '../ui'

export const shiftStart = (s: Shift) => zonedToUtc(s.date, s.start_time)
export const shiftEnd = (s: Shift) => {
  const end = zonedToUtc(s.date, s.end_time)
  return end > shiftStart(s) ? end : new Date(end.getTime() + 86_400_000)
}

export function shiftState(s: Shift, at: Date): 'upcoming' | 'ongoing' | 'done' {
  if (at < shiftStart(s)) return 'upcoming'
  if (at < shiftEnd(s)) return 'ongoing'
  return 'done'
}

export const byStart = (a: Shift, b: Shift) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)

export const timeRange = (s: Shift) => `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`

export function groupByDate<T extends { date: string }>(list: T[]): [string, T[]][] {
  const m = new Map<string, T[]>()
  for (const x of list) m.set(x.date, [...(m.get(x.date) ?? []), x])
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
}

type Draft = Omit<Shift, 'id' | 'created_at'> & { id?: string; copyOf?: string }

export function ShiftEditor({
  open,
  onClose,
  initial,
  committeeId,
  days,
  volunteers,
  defaultDate,
}: {
  open: boolean
  onClose: () => void
  initial: Partial<Shift> | null
  committeeId: string
  days: ConferenceDay[]
  volunteers: Volunteer[]
  defaultDate?: string
}) {
  const blank = (): Draft => ({
    committee_id: committeeId,
    date: defaultDate ?? days[0]?.date ?? '',
    start_time: '09:00',
    end_time: '12:00',
    title: '',
    location: '',
    notes: '',
    volunteer_ids: [],
  })
  const [d, setD] = useState<Draft>(blank)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setD({ ...blank(), ...(initial ?? {}), committee_id: committeeId, copyOf: undefined } as Draft)
      setErr(null)
    }
  }, [open, initial])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const toggle = (id: string) =>
    set('volunteer_ids', d.volunteer_ids.includes(id) ? d.volunteer_ids.filter((x) => x !== id) : [...d.volunteer_ids, id])

  async function save() {
    if (!d.date) return setErr('Välj vilken dag passet är.')
    if (!d.start_time || !d.end_time) return setErr('Fyll i när passet börjar och slutar.')
    if (d.start_time.slice(0, 5) === d.end_time.slice(0, 5)) return setErr('Passet måste sluta en annan tid än det börjar.')
    if (!d.title.trim()) return setErr('Skriv vad uppgiften är, t.ex. Lunchservering.')
    setBusy(true)
    setErr(null)
    const row = {
      committee_id: committeeId,
      date: d.date,
      start_time: d.start_time.slice(0, 5),
      end_time: d.end_time.slice(0, 5),
      title: d.title.trim(),
      location: d.location?.trim() || null,
      notes: d.notes?.trim() || null,
      volunteer_ids: d.volunteer_ids,
    }
    try {
      if (d.id) await api.update('shifts', d.id, row)
      else await api.insert('shifts', row)
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!d.id) return
    const ok = await confirmDialog({
      title: d.title.trim() ? `Ta bort passet ${d.title.trim()}?` : 'Ta bort passet?',
      message: `${formatShortDay(d.date)} ${d.start_time.slice(0, 5)}–${d.end_time.slice(0, 5)} försvinner ur schemat för alla.`,
      confirmLabel: 'Ta bort passet',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    setErr(null)
    try {
      await api.remove('shifts', d.id)
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function duplicate() {
    setErr(null)
    setD((x) => ({ ...x, id: undefined, copyOf: x.title.trim() || 'passet' }))
  }

  const dayOptions = days.some((x) => x.date === d.date) || !d.date ? days.map((x) => x.date) : [d.date, ...days.map((x) => x.date)]

  return (
    <Modal open={open} onClose={onClose} title={d.id ? 'Redigera pass' : d.copyOf ? 'Kopia av pass' : 'Nytt pass'} wide persistent>
      {d.copyOf && !d.id && (
        <p className="mb-5 rounded-xl bg-ice px-4 py-3 text-base text-ink">
          En kopia av {d.copyOf}. Ändra det som skiljer, till exempel dag eller tid, och spara.
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Dag">
          <Select value={d.date} onChange={(e) => set('date', e.target.value)}>
            {dayOptions.map((date) => (
              <option key={date} value={date}>
                {formatShortDay(date)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start">
          <Input type="time" value={d.start_time} onChange={(e) => set('start_time', e.target.value)} />
        </Field>
        <Field label="Slut" hint="Slutar passet efter midnatt räknas det till nästa dygn.">
          <Input type="time" value={d.end_time} onChange={(e) => set('end_time', e.target.value)} />
        </Field>
        <Field label="Uppgift" className="sm:col-span-2">
          <Input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="t.ex. Lunchservering" />
        </Field>
        <Field label="Plats (valfritt)">
          <Input value={d.location ?? ''} onChange={(e) => set('location', e.target.value)} placeholder="t.ex. Matsalen" />
        </Field>
        <Field label="Anteckning (valfritt)" hint="Syns för alla i kommittén." className="sm:col-span-3">
          <Textarea rows={2} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>

      <div className="mt-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4">
          <span id="shift-volunteers" className="text-base font-medium text-slate-800">
            Volontärer på passet ({d.volunteer_ids.length})
          </span>
          {volunteers.length > 0 && (
            <div className="flex gap-4 text-base">
              <button type="button" className="min-h-11 text-ink underline underline-offset-4" onClick={() => set('volunteer_ids', volunteers.map((v) => v.id))}>
                Välj alla
              </button>
              <button type="button" className="min-h-11 text-ink underline underline-offset-4" onClick={() => set('volunteer_ids', [])}>
                Välj inga
              </button>
            </div>
          )}
        </div>
        {volunteers.length === 0 ? (
          <p className="text-base text-muted">Lägg först till volontärer under fliken Volontärer.</p>
        ) : (
          <div role="group" aria-labelledby="shift-volunteers" className="grid gap-x-4 border-y border-line py-2 sm:grid-cols-2">
            {volunteers.map((v) => (
              <Checkbox key={v.id} label={v.full_name} checked={d.volunteer_ids.includes(v.id)} onChange={() => toggle(v.id)} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <ErrorText>{err}</ErrorText>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {d.id && (
            <>
              <Button type="button" variant="ghost" className="text-rose-700" disabled={busy} onClick={remove}>
                <Trash2 className="size-4" aria-hidden /> Ta bort
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={duplicate}>
                <Copy className="size-4" aria-hidden /> Duplicera
              </Button>
            </>
          )}
          <div className="ms-auto flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Avbryt
            </Button>
            <Button type="button" onClick={save} loading={busy}>
              Spara pass
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
