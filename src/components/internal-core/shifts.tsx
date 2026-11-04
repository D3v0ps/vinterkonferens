import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { ConferenceDay, Shift, Volunteer } from '../../lib/types'
import { formatDay, zonedToUtc } from '../../lib/time'
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

type Draft = Omit<Shift, 'id' | 'created_at'> & { id?: string }

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
      setD({ ...blank(), ...(initial ?? {}), committee_id: committeeId } as Draft)
      setErr(null)
    }
  }, [open, initial])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const toggle = (id: string) =>
    set('volunteer_ids', d.volunteer_ids.includes(id) ? d.volunteer_ids.filter((x) => x !== id) : [...d.volunteer_ids, id])

  async function save() {
    if (!d.title.trim() || !d.date || !d.start_time || !d.end_time) return setErr('Fyll i dag, tider och uppgift.')
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

  const dayOptions = days.some((x) => x.date === d.date) || !d.date ? days.map((x) => x.date) : [d.date, ...days.map((x) => x.date)]

  return (
    <Modal open={open} onClose={onClose} title={d.id ? 'Redigera pass' : 'Nytt pass'} wide>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Dag" required>
          <Select value={d.date} onChange={(e) => set('date', e.target.value)}>
            {dayOptions.map((date) => (
              <option key={date} value={date}>
                {formatDay(date)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start" required>
          <Input type="time" value={d.start_time} onChange={(e) => set('start_time', e.target.value)} />
        </Field>
        <Field label="Slut" required>
          <Input type="time" value={d.end_time} onChange={(e) => set('end_time', e.target.value)} />
        </Field>
        <Field label="Uppgift" required className="sm:col-span-2">
          <Input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="t.ex. Lunchservering" />
        </Field>
        <Field label="Plats">
          <Input value={d.location ?? ''} onChange={(e) => set('location', e.target.value)} placeholder="t.ex. Matsalen" />
        </Field>
        <Field label="Anteckning" className="sm:col-span-3">
          <Textarea rows={2} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">
            Volontärer på passet ({d.volunteer_ids.length})
          </span>
          <div className="flex gap-2 text-xs">
            <button type="button" className="text-ink underline" onClick={() => set('volunteer_ids', volunteers.map((v) => v.id))}>
              Alla
            </button>
            <button type="button" className="text-ink underline" onClick={() => set('volunteer_ids', [])}>
              Inga
            </button>
          </div>
        </div>
        {volunteers.length === 0 ? (
          <p className="text-sm text-slate-500">Lägg först till volontärer under fliken Volontärer.</p>
        ) : (
          <div className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
            {volunteers.map((v) => (
              <Checkbox key={v.id} label={v.full_name} checked={d.volunteer_ids.includes(v.id)} onChange={() => toggle(v.id)} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 space-y-3">
        <ErrorText>{err}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Avbryt
          </Button>
          <Button onClick={save} loading={busy}>
            Spara pass
          </Button>
        </div>
      </div>
    </Modal>
  )
}
