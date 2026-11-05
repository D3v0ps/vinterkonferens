import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Download, Plus, Save, Trash2 } from 'lucide-react'
import { confirmDialog, notify } from '../../components/dialogs'
import { Button, Card, ErrorText, Field, Input, LocalizedInput, PageHeader, Select, Tabs } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { EMPTY_SETTINGS } from '../../lib/conference'
import { eq, uuid } from '../../lib/db'
import { pathToHash } from '../../lib/hashRouter'
import { useList } from '../../lib/hooks'
import { canPrint, isArtifact, safeStorage, saveFile } from '../../lib/platform'
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
        className="mb-5 max-sm:grid max-sm:grid-cols-2"
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
    <div className="max-w-2xl space-y-5">
      <Field label="Konferensens namn">
        <Input value={s.conference_name} onChange={(e) => set({ conference_name: e.target.value })} />
      </Field>
      <LocalizedInput label="Undertitel" value={s.tagline} onChange={(tagline) => set({ tagline })} />
      <div className="grid gap-5 sm:grid-cols-2">
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
    </div>
  )
}

function Days() {
  const { data } = useList('conference_days', { order: [{ col: 'date' }] })
  const [date, setDate] = useState('')
  const [lang, setLang] = useState<Lang>('sv')
  const sv = useSaver()
  return (
    <div className="max-w-3xl">
      <p className="max-w-[65ch] text-base text-muted">
        Varje dag har ett standardspråk som besökarsidan visas på (t.ex. fredag = arabiska, lördag–söndag = svenska). Besökaren kan alltid byta själv.
      </p>
      {data.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {data.map((d) => (
            <DayRow key={d.id} day={d} taken={data.filter((x) => x.id !== d.id).map((x) => x.date)} />
          ))}
        </ul>
      )}
      <h2 className="mt-10 text-xl font-semibold text-ink">Lägg till dag</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="Datum">
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
              if (data.some((x) => x.date === date)) throw new Error(`${capitalize(formatDay(date))} är redan en konferensdag.`)
              await api.insert('conference_days', { date, default_lang: lang, label: { sv: `Dag ${data.length + 1}`, en: `Day ${data.length + 1}`, ar: `اليوم ${data.length + 1}` } })
              setDate('')
            })
          }
        >
          <Plus className="size-4" /> Lägg till dag
        </Button>
      </div>
      <div className="mt-3">
        <ErrorText>{sv.err}</ErrorText>
      </div>
    </div>
  )
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function DayRow({ day, taken }: { day: ConferenceDay; taken: string[] }) {
  const [d, setD] = useState(day)
  const sv = useSaver()
  async function remove() {
    const ok = await confirmDialog({
      title: `Ta bort ${formatDay(day.date)}?`,
      message: 'Dagen försvinner ur konferensdagarna. Programmet och passen för dagen ligger kvar.',
      confirmLabel: 'Ta bort dagen',
      danger: true,
    })
    if (ok) sv.run(() => api.remove('conference_days', d.id))
  }
  return (
    <li className="space-y-4 py-5">
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
        {d.date && <span className="inline-block pb-2.5 text-base text-muted first-letter:uppercase">{formatDay(d.date)}</span>}
      </div>
      <LocalizedInput label="Etikett" value={d.label} onChange={(label) => setD({ ...d, label })} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          loading={sv.busy}
          onClick={() =>
            sv.run(async () => {
              if (!d.date) throw new Error('Välj ett datum.')
              if (taken.includes(d.date)) throw new Error(`${capitalize(formatDay(d.date))} är redan en konferensdag.`)
              await api.update('conference_days', d.id, { date: d.date, default_lang: d.default_lang, label: d.label })
            })
          }
        >
          {sv.ok ? 'Sparat ✓' : 'Spara'}
        </Button>
        <Button variant="danger" onClick={remove}>
          <Trash2 className="size-4" /> Ta bort
        </Button>
      </div>
      <ErrorText>{sv.err}</ErrorText>
    </li>
  )
}

function Committees() {
  const { data } = useList('committees', { order: [{ col: 'sort' }] })
  const [name, setName] = useState('')
  const sv = useSaver()
  return (
    <div>
      <p className="max-w-[65ch] text-base text-muted">
        Medlemmar i <b className="font-semibold text-ink">Styrgruppen</b> är administratörer. Kommittéansvariga och volontärer läggs till under respektive kommitté.
      </p>
      {data.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {data.map((c) => (
            <CommitteeRow key={c.id} c={c} />
          ))}
        </ul>
      )}
      <h2 className="mt-10 text-xl font-semibold text-ink">Lägg till kommitté</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="Namn" className="min-w-56 flex-1">
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
      </div>
      <div className="mt-3">
        <ErrorText>{sv.err}</ErrorText>
      </div>
    </div>
  )
}

/**
 * Tar bort en kommitté som databasen i Supabase gör: volontärer, pass och inlägg försvinner
 * (on delete cascade) och anteckningar och inköp blir kvar utan kommitté (on delete set null).
 * Artifactens och demolägets databas gör inte det själva, så där görs det här.
 * Kommittén tas bort sist, så att ett avbrott kan göras om.
 */
async function removeCommittee(id: string) {
  if (api.mode !== 'supabase') {
    const of = { filters: [eq('committee_id', id)] }
    for (const r of await api.list('shifts', of)) await api.remove('shifts', r.id)
    for (const r of await api.list('posts', of)) await api.remove('posts', r.id)
    for (const r of await api.list('notes', of)) await api.update('notes', r.id, { committee_id: null })
    for (const r of await api.list('purchases', of)) await api.update('purchases', r.id, { committee_id: null })
    for (const r of await api.list('volunteers', of)) await api.remove('volunteers', r.id)
  }
  await api.remove('committees', id)
}

function CommitteeRow({ c }: { c: Committee }) {
  const [v, setV] = useState(c)
  const sv = useSaver()
  async function remove() {
    const ok = await confirmDialog({
      title: `Ta bort ${c.name}?`,
      message: 'Kommitténs volontärer, pass och inlägg tas också bort. Anteckningar och inköp ligger kvar. Det går inte att ångra.',
      confirmLabel: 'Ta bort kommittén',
      danger: true,
    })
    if (ok) sv.run(() => removeCommittee(c.id))
  }
  return (
    <li className="flex flex-wrap items-end gap-3 py-5">
      <label className="block">
        <span className="mb-1.5 block text-base font-medium text-slate-800">Färg</span>
        <input type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className="h-11 w-14 cursor-pointer rounded-xl border border-line bg-white p-1" />
      </label>
      <Field label="Namn" className="min-w-40 flex-1">
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label="Beskrivning" className="min-w-48 flex-[2]">
        <Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      <Field label="Ordning" className="w-24">
        <Input type="number" inputMode="numeric" value={v.sort} onChange={(e) => setV({ ...v, sort: Number(e.target.value) })} />
      </Field>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          loading={sv.busy}
          onClick={() => {
            if (!v.name.trim()) return notify('Kommittén behöver ett namn.', 'error')
            sv.run(() => api.update('committees', c.id, { name: v.name.trim(), description: v.description, color: v.color, sort: v.sort }))
          }}
        >
          {sv.ok ? 'Sparat ✓' : 'Spara'}
        </Button>
        {c.slug !== 'styrgruppen' && (
          <Button variant="danger" disabled={sv.busy} onClick={remove} aria-label={`Ta bort ${c.name}`} title="Ta bort">
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
      {sv.err && (
        <div className="basis-full">
          <ErrorText>{sv.err}</ErrorText>
        </div>
      )}
    </li>
  )
}

const QR_PAGES = [
  { path: '', label: 'Startsida' },
  { path: 'program', label: 'Vuxna & ungdomar' },
  { path: 'barn', label: 'Barn & fritids' },
  { path: 'koket', label: 'Köket' },
]

const QR_BASE_KEY = 'vk-qr-base'
// Utanför artifacten är sidans egen adress rätt; i artifacten finns ingen publik adress att gissa.
const DEFAULT_QR_BASE = isArtifact ? '' : window.location.origin + import.meta.env.BASE_URL

/**
 * "vinterkonferensen.se" → "https://vinterkonferensen.se/". null om adressen inte går att använda.
 * I artifacten blir det artifactens adress utan avslutande snedstreck och utan #namn
 * ("https://claude.ai/artifact/abc123"), eftersom sidorna där nås med #program, #barn …
 */
function normalizeBase(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(t) ? t : `https://${t}`)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null
    if (isArtifact) return u.origin + u.pathname.replace(/\/+$/, '')
    return u.origin + (u.pathname.endsWith('/') ? u.pathname : u.pathname + '/')
  } catch {
    return null
  }
}

/** Adressen som QR-koden leder till: …/program på webben, …#program i artifacten. */
function pageUrl(base: string, path: string): string {
  if (!isArtifact) return base + path
  return path ? `${base}#${pathToHash(path)}` : base
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/png'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function QrCodes() {
  const [raw, setRaw] = useState(() => safeStorage.get(QR_BASE_KEY) ?? DEFAULT_QR_BASE)
  const base = normalizeBase(raw)
  const [codes, setCodes] = useState<Record<string, string>>({})

  useEffect(() => {
    safeStorage.set(QR_BASE_KEY, raw.trim() && raw.trim() !== DEFAULT_QR_BASE ? raw.trim() : null)
  }, [raw])

  useEffect(() => {
    if (!base) return setCodes({})
    let alive = true
    Promise.all(QR_PAGES.map(async (p) => [p.path, await QRCode.toDataURL(pageUrl(base, p.path), { width: 600, margin: 1, color: { dark: '#0e2240' } })] as const))
      .then((e) => alive && setCodes(Object.fromEntries(e)))
      .catch(() => alive && setCodes({}))
    return () => {
      alive = false
    }
  }, [base])

  async function download(path: string) {
    const url = codes[path]
    if (!url) return
    const filename = `qr-${path || 'start'}.png`
    try {
      if (await saveFile(filename, dataUrlToBlob(url), 'image/png')) notify(`${filename} sparad`)
    } catch (e) {
      notify((e as Error).message, 'error')
    }
  }

  return (
    <>
      <div className="no-print max-w-xl">
        <Field
          label="Sidans adress"
          hint={
            isArtifact
              ? 'Artifactens adress på claude.ai, som du delar med besökarna. QR-koderna leder dit.'
              : 'Adressen där besökarsidan ligger på nätet. QR-koderna leder dit.'
          }
        >
          <Input
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={isArtifact ? 'https://claude.ai/artifact/…' : 'https://vinterkonferensen.se/'}
            aria-invalid={!!raw.trim() && !base}
          />
        </Field>
        {raw.trim() && !base && <p className="mt-1.5 text-base text-rose-700">Skriv en hel webbadress, till exempel https://vinterkonferensen.se/</p>}
        {!raw.trim() && <p className="mt-3 text-base text-muted">Skriv in adressen så skapas QR-koderna.</p>}
        {!isArtifact && raw.trim() !== DEFAULT_QR_BASE && (
          <button type="button" className="mt-2 min-h-11 text-base text-ink underline underline-offset-4" onClick={() => setRaw(DEFAULT_QR_BASE)}>
            Använd den här sidans adress
          </button>
        )}
      </div>

      {base && (
        <>
          <p className="mt-8 mb-4 max-w-[65ch] text-base text-muted">
            {canPrint
              ? 'Skriv ut sidan eller ladda ner bilderna och sätt upp dem vid entrén, i salen, vid barnrummet och i köket.'
              : 'Ladda ner bilderna, skriv ut dem och sätt upp dem vid entrén, i salen, vid barnrummet och i köket.'}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {QR_PAGES.map((p) => (
              <Card key={p.path} className="print-break p-5 text-center">
                {codes[p.path] ? <img src={codes[p.path]} alt={`QR-kod till ${p.label}`} className="mx-auto w-48" /> : <div className="mx-auto size-48" />}
                <div className="mt-3 text-lg font-semibold text-ink">{p.label}</div>
                <div className="select-all break-all text-sm text-muted">{pageUrl(base, p.path)}</div>
                <Button variant="secondary" className="no-print mt-3" disabled={!codes[p.path]} onClick={() => download(p.path)}>
                  <Download className="size-4" /> Ladda ner bild
                </Button>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  )
}
