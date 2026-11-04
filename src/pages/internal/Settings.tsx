import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Button, Card, ErrorText, Field, Input, LocalizedInput, PageHeader, Select, Tabs } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { EMPTY_SETTINGS } from '../../lib/conference'
import { uuid } from '../../lib/db'
import { useList } from '../../lib/hooks'
import { formatDay } from '../../lib/time'
import type { Committee, ConferenceDay, Lang, Settings } from '../../lib/types'

type Tab = 'general' | 'days' | 'committees' | 'qr'

export default function SettingsPage() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('general')
  if (!isAdmin) return <PageHeader title="Inställningar" subtitle="Bara styrgruppen kan ändra inställningar." />
  return (
    <>
      <PageHeader title="Inställningar" subtitle="Grundinformation som visas på besökarsidan." />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'general', label: 'Allmänt' },
          { value: 'days', label: 'Konferensdagar' },
          { value: 'committees', label: 'Kommittéer' },
          { value: 'qr', label: 'QR-koder' },
        ]}
      />
      {tab === 'general' && <General />}
      {tab === 'days' && <Days />}
      {tab === 'committees' && <Committees />}
      {tab === 'qr' && <QrCodes />}
    </>
  )
}

function useSaver() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setErr(null)
    setOk(false)
    try {
      await fn()
      setOk(true)
      setTimeout(() => setOk(false), 2000)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, err, ok, run }
}

function General() {
  const { data } = useList('settings')
  const [s, setS] = useState<Settings>(EMPTY_SETTINGS)
  const sv = useSaver()
  useEffect(() => {
    if (data[0]) setS(data[0])
  }, [data])
  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch })
  return (
    <Card className="space-y-4 p-5">
      <Field label="Konferensens namn">
        <Input value={s.conference_name} onChange={(e) => set({ conference_name: e.target.value })} />
      </Field>
      <LocalizedInput label="Undertitel" value={s.tagline} onChange={(tagline) => set({ tagline })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plats / adress">
          <Input value={s.venue} onChange={(e) => set({ venue: e.target.value })} />
        </Field>
        <Field label="Kontakt / info-disk">
          <Input value={s.contact} onChange={(e) => set({ contact: e.target.value })} />
        </Field>
      </div>
      <LocalizedInput label="Köket: öppettider & info" multiline value={s.kitchen_info} onChange={(kitchen_info) => set({ kitchen_info })} />
      <LocalizedInput label="Fritids: information" multiline value={s.fritids_info} onChange={(fritids_info) => set({ fritids_info })} />
      <LocalizedInput label="Fritids: pris" value={s.fritids_price} onChange={(fritids_price) => set({ fritids_price })} />
      <ErrorText>{sv.err}</ErrorText>
      <Button
        loading={sv.busy}
        onClick={() =>
          sv.run(() => {
            const { id, updated_at: _u, ...rest } = s
            return data[0] ? api.update('settings', id, rest) : api.insert('settings', { ...rest, id: 1 })
          })
        }
      >
        <Save className="size-4" /> {sv.ok ? 'Sparat ✓' : 'Spara'}
      </Button>
    </Card>
  )
}

function Days() {
  const { data } = useList('conference_days', { order: [{ col: 'date' }] })
  const [date, setDate] = useState('')
  const [lang, setLang] = useState<Lang>('sv')
  const sv = useSaver()
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Varje dag har ett standardspråk som besökarsidan visas på (t.ex. fredag = arabiska, lördag–söndag = svenska). Besökaren kan alltid byta själv.
      </p>
      {data.map((d) => (
        <DayRow key={d.id} day={d} />
      ))}
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label="Nytt datum">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Standardspråk">
          <Select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="sv">Svenska</option>
            <option value="ar">Arabiska</option>
            <option value="en">Engelska</option>
          </Select>
        </Field>
        <Button
          disabled={!date}
          loading={sv.busy}
          onClick={() =>
            sv.run(async () => {
              await api.insert('conference_days', { date, default_lang: lang, label: { sv: `Dag ${data.length + 1}`, en: `Day ${data.length + 1}`, ar: `اليوم ${data.length + 1}` } })
              setDate('')
            })
          }
        >
          <Plus className="size-4" /> Lägg till dag
        </Button>
        <ErrorText>{sv.err}</ErrorText>
      </Card>
    </div>
  )
}

function DayRow({ day }: { day: ConferenceDay }) {
  const [d, setD] = useState(day)
  const sv = useSaver()
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Datum">
          <Input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
        </Field>
        <Field label="Standardspråk">
          <Select value={d.default_lang} onChange={(e) => setD({ ...d, default_lang: e.target.value as Lang })}>
            <option value="sv">Svenska</option>
            <option value="ar">Arabiska</option>
            <option value="en">Engelska</option>
          </Select>
        </Field>
        <span className="pb-2.5 text-sm first-letter:uppercase text-slate-500">{formatDay(d.date)}</span>
      </div>
      <LocalizedInput label="Etikett" value={d.label} onChange={(label) => setD({ ...d, label })} />
      <div className="flex gap-2">
        <Button size="sm" loading={sv.busy} onClick={() => sv.run(() => api.update('conference_days', d.id, { date: d.date, default_lang: d.default_lang, label: d.label }))}>
          {sv.ok ? 'Sparat ✓' : 'Spara'}
        </Button>
        <Button size="sm" variant="danger" onClick={() => confirm('Ta bort dagen? Programmet för dagen ligger kvar.') && sv.run(() => api.remove('conference_days', d.id))}>
          <Trash2 className="size-4" /> Ta bort
        </Button>
      </div>
      <ErrorText>{sv.err}</ErrorText>
    </Card>
  )
}

function Committees() {
  const { data } = useList('committees', { order: [{ col: 'sort' }] })
  const [name, setName] = useState('')
  const sv = useSaver()
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Medlemmar i <b>Styrgruppen</b> är administratörer. Kommittéansvariga och volontärer läggs till under respektive kommitté.
      </p>
      {data.map((c) => (
        <CommitteeRow key={c.id} c={c} />
      ))}
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label="Ny kommitté" className="flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button
          disabled={!name.trim()}
          loading={sv.busy}
          onClick={() =>
            sv.run(async () => {
              // Köket → koket, Gästbemötare → gastbemotare (måste matcha slugs i RLS och behörighetskontroller)
              const base =
                name.trim().toLowerCase().normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') ||
                `k-${uuid().slice(0, 8)}`
              let slug = base
              for (let i = 2; data.some((c) => c.slug === slug); i++) slug = `${base}-${i}`
              await api.insert('committees', { name: name.trim(), slug, description: '', color: '#334155', sort: data.length })
              setName('')
            })
          }
        >
          <Plus className="size-4" /> Lägg till
        </Button>
      </Card>
      <ErrorText>{sv.err}</ErrorText>
    </div>
  )
}

function CommitteeRow({ c }: { c: Committee }) {
  const [v, setV] = useState(c)
  const sv = useSaver()
  return (
    <Card className="flex flex-wrap items-end gap-3 p-4">
      <input type="color" aria-label="Färg" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className="h-10 w-12 rounded-lg border border-slate-300" />
      <Field label="Namn" className="min-w-40 flex-1">
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label="Beskrivning" className="min-w-48 flex-[2]">
        <Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      <Field label="Ordning" className="w-20">
        <Input type="number" value={v.sort} onChange={(e) => setV({ ...v, sort: Number(e.target.value) })} />
      </Field>
      <Button size="sm" loading={sv.busy} onClick={() => sv.run(() => api.update('committees', c.id, { name: v.name, description: v.description, color: v.color, sort: v.sort }))}>
        {sv.ok ? 'Sparat ✓' : 'Spara'}
      </Button>
      {c.slug !== 'styrgruppen' && (
        <Button size="sm" variant="danger" onClick={() => confirm(`Ta bort ${c.name}? Volontärer och scheman i kommittén försvinner.`) && sv.run(() => api.remove('committees', c.id))}>
          <Trash2 className="size-4" />
        </Button>
      )}
      {sv.err && <ErrorText>{sv.err}</ErrorText>}
    </Card>
  )
}

const QR_PAGES = [
  { path: '', label: 'Startsida' },
  { path: 'program', label: 'Vuxna & ungdomar' },
  { path: 'barn', label: 'Barn & fritids' },
  { path: 'koket', label: 'Köket' },
]

function QrCodes() {
  const base = window.location.origin + import.meta.env.BASE_URL
  const [codes, setCodes] = useState<Record<string, string>>({})
  useEffect(() => {
    Promise.all(QR_PAGES.map(async (p) => [p.path, await QRCode.toDataURL(base + p.path, { width: 600, margin: 1, color: { dark: '#0f2a47' } })] as const)).then((e) =>
      setCodes(Object.fromEntries(e)),
    )
  }, [base])
  return (
    <>
      <p className="mb-4 text-sm text-slate-600">Skriv ut och sätt upp vid entrén, i salen, vid barnrummet och i köket.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {QR_PAGES.map((p) => (
          <Card key={p.path} className="print-break p-4 text-center">
            {codes[p.path] && <img src={codes[p.path]} alt={`QR-kod till ${p.label}`} className="mx-auto w-48" />}
            <div className="mt-2 font-semibold text-ink">{p.label}</div>
            <div className="break-all text-xs text-slate-500">{base + p.path}</div>
            {codes[p.path] && (
              <a href={codes[p.path]} download={`qr-${p.path || 'start'}.png`} className="no-print mt-2 inline-block text-sm text-ink underline">
                Ladda ner
              </a>
            )}
          </Card>
        ))}
      </div>
    </>
  )
}
