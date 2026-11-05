import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, ExternalLink, Pencil, Plus, Receipt, ShoppingCart, Trash2 } from 'lucide-react'
import { confirmDialog, notify } from '../../components/dialogs'
import { Button, Empty, ErrorText, Input, Modal, PageHeader, Select, Spinner, Textarea, cx } from '../../components/ui'
import { api, isDemo } from '../../lib/api'
import { useAuth, useAuthorFields } from '../../lib/auth'
import { safeFileName, uuid } from '../../lib/db'
import { kr, num } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { formatShortDate, todayStr } from '../../lib/time'
import type { Purchase, PurchaseItem } from '../../lib/types'
import { canOpenUrl, FileLinks, FILTER_MIN, Question } from './Notes'

export const toNum = (s: string | number | null | undefined) => {
  if (typeof s === 'number') return s
  const n = parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export const lineTotal = (i: Pick<PurchaseItem, 'quantity' | 'unit_price' | 'discount'>) => i.quantity * i.unit_price - (i.discount || 0)

export function purchaseTotals(p: Pick<Purchase, 'discount_total'>, items: Pick<PurchaseItem, 'quantity' | 'unit_price' | 'discount'>[]) {
  const gross = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const discount = items.reduce((s, i) => s + (i.discount || 0), 0) + (p.discount_total || 0)
  return { gross, discount, total: gross - discount }
}

/** Användarens webbadress som säker länk: bara http(s), och "ica.se" blir https://ica.se. */
export function webHref(u: string | null | undefined): string | null {
  const v = u?.trim()
  if (!v) return null
  const full = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`
  return /^https?:\/\/[^\s]+$/i.test(full) ? full : null
}

export function useCanEditPurchase() {
  const auth = useAuth()
  // Namnet räcker bara i demoläget – RLS i Supabase går på created_by
  return (p: Purchase) =>
    auth.isAdmin ||
    auth.isLead(p.committee_id) ||
    (!!p.created_by && p.created_by === auth.userId) ||
    (isDemo && !!p.author_name && p.author_name === auth.displayName)
}

export default function Purchases() {
  const auth = useAuth()
  const canEdit = useCanEditPurchase()
  const purchases = useList('purchases', { order: [{ col: 'purchased_on', asc: false }, { col: 'created_at', asc: false }] })
  // I den ordning produkterna skrevs in (radernas id är slumpade)
  const items = useList('purchase_items', { order: [{ col: 'created_at' }] })
  const [editing, setEditing] = useState<Purchase | 'new' | null>(null)
  const form = useRef<FormState>({ dirty: false, busy: false })
  const [open, setOpen] = useState<string | null>(null)
  const [committee, setCommittee] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const byPurchase = useMemo(() => {
    const m = new Map<string, PurchaseItem[]>()
    for (const i of items.data) m.set(i.purchase_id, [...(m.get(i.purchase_id) ?? []), i])
    return m
  }, [items.data])

  // Kommittéfiltret bara när listan är lång; annars gäller det inte (så att inget göms utan att synas)
  const filtering = purchases.data.length > FILTER_MIN
  const shown = purchases.data.filter((p) => !filtering || !committee || p.committee_id === committee)

  async function closeForm() {
    // Pågår sparandet fortsätter det när rutan stängs; annars fråga innan ändringar slängs
    if (form.current.dirty && !form.current.busy) {
      const ok = await confirmDialog({
        title: editing === 'new' ? 'Släng inköpet?' : 'Släng ändringarna?',
        message: 'Det du har fyllt i sparas inte.',
        confirmLabel: 'Släng',
        cancelLabel: 'Fortsätt',
        danger: true,
      })
      if (!ok) return
    }
    setEditing(null)
  }
  const sum = shown.reduce((s, p) => s + purchaseTotals(p, byPurchase.get(p.id) ?? []).total, 0)

  async function remove(p: Purchase) {
    const n = byPurchase.get(p.id)?.length ?? 0
    const ok = await confirmDialog({
      title: 'Ta bort inköpet?',
      message: `Inköpet från ${p.store_name}${n ? ` och ${n === 1 ? 'produkten' : `alla ${n} produkter`}` : ''} tas bort, även ur inventarielistan.${p.receipt_path ? ' Kvittot raderas också.' : ''}`,
      confirmLabel: 'Ta bort',
      danger: true,
    })
    if (!ok) return
    setErr(null)
    try {
      for (const i of byPurchase.get(p.id) ?? []) await api.remove('purchase_items', i.id)
      // Kvittot före raden: lagringsreglerna tillåter borttagningen bara medan inköpet pekar på filen
      if (p.receipt_path) await api.removeFile('receipts', p.receipt_path).catch(() => undefined)
      await api.remove('purchases', p.id)
      notify('Inköpet är borttaget')
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <div>
      <PageHeader
        title="Inköp"
        subtitle="Registrera allt som köps in – butik, kontaktperson, priser och rabatter. Allt hamnar i inventarielistan."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Nytt inköp
          </Button>
        }
      />

      {filtering && (
        <Question label="Kommitté" className="mb-4 sm:max-w-xs">
          <Select value={committee} onChange={(e) => setCommittee(e.target.value)}>
            <option value="">Alla kommittéer</option>
            {auth.committees.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Question>
      )}
      {purchases.data.length > 0 && (
        <p className="mb-4 text-base text-muted">
          {shown.length} inköp · totalt <b className="font-semibold text-ink tabular-nums">{kr(sum)}</b>
        </p>
      )}

      <ErrorText>{err}</ErrorText>

      {purchases.loading ? (
        <Spinner />
      ) : purchases.error ? (
        <ErrorText>{purchases.error}</ErrorText>
      ) : shown.length === 0 ? (
        <Empty icon={<ShoppingCart className="size-8 text-muted" aria-hidden />}>{purchases.data.length ? 'Inga inköp för den kommittén.' : 'Inga inköp registrerade ännu.'}</Empty>
      ) : (
        <div className="divide-y divide-line border-y border-line">
          {shown.map((p) => {
            const rows = byPurchase.get(p.id) ?? []
            const t = purchaseTotals(p, rows)
            const c = auth.committees.find((x) => x.id === p.committee_id)
            const isOpen = open === p.id
            const meta = [p.purchased_on && formatShortDate(p.purchased_on), `${rows.length} ${rows.length === 1 ? 'produkt' : 'produkter'}`, c?.name].filter(Boolean).join(' · ')
            return (
              <article key={p.id}>
                {/* Rubrik med knapp i (inte tvärtom), så att skärmläsare hittar inköpen som rubriker */}
                <h3>
                  <button onClick={() => setOpen(isOpen ? null : p.id)} className="group flex w-full items-start justify-between gap-3 py-4 text-start" aria-expanded={isOpen}>
                    <span className="min-w-0">
                      <span className="block text-lg font-semibold text-ink break-words">{p.store_name}</span>
                      <span className="mt-0.5 block text-sm font-normal text-muted">{meta}</span>
                    </span>
                    <span className="flex shrink-0 items-start gap-2 text-end">
                      <span>
                        <span className="block text-lg font-semibold tabular-nums text-ink">{kr(t.total)}</span>
                        {t.discount > 0 && <span className="block text-sm font-normal text-emerald-800 tabular-nums">−{kr(t.discount)} rabatt</span>}
                      </span>
                      <ChevronDown className={cx('mt-1 size-5 text-muted transition group-hover:text-ink', isOpen && 'rotate-180')} aria-hidden />
                    </span>
                  </button>
                </h3>
                {isOpen && (
                  <PurchaseDetails
                    purchase={p}
                    rows={rows}
                    actions={
                      canEdit(p) && (
                        <>
                          <Button variant="secondary" onClick={() => setEditing(p)} disabled={items.loading}>
                            <Pencil className="size-4" aria-hidden /> Redigera
                          </Button>
                          <Button variant="danger" onClick={() => remove(p)} disabled={items.loading}>
                            <Trash2 className="size-4" aria-hidden /> Ta bort
                          </Button>
                        </>
                      )
                    }
                  />
                )}
              </article>
            )
          })}
        </div>
      )}

      <Modal open={!!editing} onClose={closeForm} title={editing === 'new' ? 'Nytt inköp' : 'Redigera inköp'} wide persistent>
        {editing && (
          <PurchaseForm
            key={editing === 'new' ? 'new' : editing.id}
            purchase={editing === 'new' ? null : editing}
            items={editing === 'new' ? [] : byPurchase.get(editing.id) ?? []}
            state={form}
            onCancel={closeForm}
            onSaved={(alive) => {
              if (alive) setEditing(null)
              notify(editing === 'new' ? 'Inköpet är sparat' : 'Ändringarna är sparade')
            }}
          />
        )}
      </Modal>
    </div>
  )
}

function PurchaseDetails({ purchase: p, rows, actions }: { purchase: Purchase; rows: PurchaseItem[]; actions: React.ReactNode }) {
  const site = webHref(p.store_url)
  return (
    <div className="space-y-6 pb-6">
      <dl className="grid gap-x-6 gap-y-2 text-base sm:grid-cols-[11rem_1fr]">
        {p.store_address && <Info label="Adress">{p.store_address}</Info>}
        {p.store_url && (
          <Info label="Webbplats">
            {site ? (
              <a href={site} target="_blank" rel="noopener noreferrer" className="-my-2.5 inline-block min-w-11 max-w-full py-2.5 break-all text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                {p.store_url.replace(/^https?:\/\//, '')}
              </a>
            ) : (
              <span className="break-all select-all">{p.store_url}</span>
            )}
          </Info>
        )}
        {(p.contact_name || p.contact_phone) && (
          <Info label="Kontaktperson">
            {p.contact_name}
            {p.contact_name && p.contact_phone && ' · '}
            {p.contact_phone && (
              <>
                <span className="select-all tabular-nums">{p.contact_phone}</span>{' '}
                <a href={`tel:${p.contact_phone.replace(/[^\d+]/g, '')}`} className="-my-2.5 inline-block min-w-11 py-2.5 text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                  Ring
                </a>
              </>
            )}
          </Info>
        )}
        {p.paid_by && <Info label="Betalt av">{p.paid_by}</Info>}
        {p.discount_total > 0 && (
          <Info label="Rabatt på hela köpet">
            {kr(p.discount_total)}
            {p.discount_note && ` – ${p.discount_note}`}
          </Info>
        )}
        {p.notes && <Info label="Övrigt">{p.notes}</Info>}
        <Info label="Registrerat av">{p.author_name ?? '–'}</Info>
      </dl>

      {rows.length > 0 && (
        <>
          {/* Mobil: lista, som i inventarielistan */}
          <ul className="divide-y divide-line border-y border-line sm:hidden">
            {rows.map((i) => {
              const link = webHref(i.link)
              return (
                <li key={i.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="text-base font-medium text-ink break-words">
                      {link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="-my-2.5 inline-block min-w-11 py-2.5 underline decoration-ink/30 underline-offset-4">
                          {i.name}
                        </a>
                      ) : (
                        i.name
                      )}
                    </div>
                    {i.brand && <div className="text-sm text-muted break-words">{i.brand}</div>}
                  </div>
                  <div className="shrink-0 text-end tabular-nums">
                    <div className="text-base font-semibold text-ink">{kr(lineTotal(i))}</div>
                    <div className="text-sm text-muted">
                      {num(i.quantity, 3)} {i.unit} × {kr(i.unit_price)}
                    </div>
                    {i.discount > 0 && <div className="text-sm text-emerald-800">−{kr(i.discount)} rabatt</div>}
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Dator: tabell */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[34rem] text-base">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th className="py-2 pe-3 text-start font-medium">Produkt</th>
                  <th className="py-2 pe-3 text-start font-medium">Märke</th>
                  <th className="py-2 pe-3 text-end font-medium">Antal</th>
                  <th className="py-2 pe-3 text-end font-medium">À-pris</th>
                  <th className="py-2 pe-3 text-end font-medium">Rabatt</th>
                  <th className="py-2 text-end font-medium">Summa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((i) => {
                  const link = webHref(i.link)
                  return (
                    <tr key={i.id}>
                      <td className="py-2 pe-3">
                        {link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="-my-2.5 inline-flex min-w-11 items-center gap-1 py-2.5 text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                            {i.name} <ExternalLink className="size-3.5" aria-label="(öppnas i ny flik)" />
                          </a>
                        ) : (
                          i.name
                        )}
                      </td>
                      <td className="py-2 pe-3 text-muted">{i.brand}</td>
                      <td className="whitespace-nowrap py-2 pe-3 text-end tabular-nums">
                        {num(i.quantity, 3)} {i.unit}
                      </td>
                      <td className="whitespace-nowrap py-2 pe-3 text-end tabular-nums">{kr(i.unit_price)}</td>
                      <td className="whitespace-nowrap py-2 pe-3 text-end tabular-nums text-emerald-800">{i.discount ? `−${kr(i.discount)}` : ''}</td>
                      <td className="whitespace-nowrap py-2 text-end tabular-nums">{kr(lineTotal(i))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {p.receipt_path && <ReceiptView path={p.receipt_path} name={p.receipt_name} />}

      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="mb-2 min-w-0 break-words sm:mb-0">{children}</dd>
    </>
  )
}

/** Signerade länkar i Supabase gäller en timme – förnya i tid. */
const URL_MAX_AGE = 50 * 60 * 1000
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|heic|heif)$/i

/** Kvittot på sidan: bild direkt, annars "Öppna kvittot" och "Spara" när det går. */
function ReceiptView({ path, name }: { path: string; name: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [imgFailed, setImgFailed] = useState(false)
  const [nonce, setNonce] = useState(0)
  const fileName = name || 'kvitto'
  const isImage = IMAGE_EXT.test(fileName)

  useEffect(() => {
    let created: string | null = null
    let cancelled = false
    // Demoläget skapar en ny blob:-adress per anrop; artifactens adresser cachas och får inte släppas
    const release = (u: string | null) => u && api.mode === 'demo' && u.startsWith('blob:') && URL.revokeObjectURL(u)
    api
      .fileUrl('receipts', path)
      .catch(() => null)
      .then((u) => {
        if (cancelled) return void release(u)
        created = u
        setUrl(u)
        setState(u ? 'ready' : 'missing')
      })
    const t = api.mode === 'supabase' ? setInterval(() => setNonce((n) => n + 1), URL_MAX_AGE) : null
    return () => {
      cancelled = true
      if (t) clearInterval(t)
      release(created)
    }
  }, [path, nonce])

  return (
    <div>
      <h4 className="text-base font-medium text-ink">Kvitto</h4>
      <div className="mt-2">
        {state === 'loading' && !url && <p className="text-base text-muted">Hämtar kvittot …</p>}
        {state === 'missing' && <p className="text-base text-muted">Kvittot hittades inte.</p>}
        {url && isImage && !imgFailed && (
          canOpenUrl(url) ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="block w-fit max-w-full" aria-label="Öppna kvittot i en ny flik">
              <img src={url} alt={`Kvitto: ${fileName}`} loading="lazy" decoding="async" onError={() => setImgFailed(true)} className="max-h-96 max-w-full rounded-md border border-line object-contain" />
            </a>
          ) : (
            <img src={url} alt={`Kvitto: ${fileName}`} loading="lazy" decoding="async" onError={() => setImgFailed(true)} className="max-h-96 max-w-full rounded-md border border-line object-contain" />
          )
        )}
        {url && (!isImage || imgFailed) && <FileLinks bucket="receipts" path={path} url={url} name={fileName} openLabel="Öppna kvittot" />}
      </div>
    </div>
  )
}

interface ItemDraft {
  id?: string
  name: string
  brand: string
  quantity: string
  unit: string
  unit_price: string
  discount: string
  link: string
  category: string
  storage_location: string
}

const emptyItem = (): ItemDraft => ({ name: '', brand: '', quantity: '1', unit: 'st', unit_price: '', discount: '', link: '', category: '', storage_location: '' })
/** Tomt eller 0 i Antal sparas som 1 – samma regel i förhandsvisningen. */
const qty = (r: ItemDraft) => toNum(r.quantity) || 1
/** Har användaren börjat fylla i raden? (Antal och enhet har förifyllda värden.) */
const touched = (r: ItemDraft) => [r.brand, r.unit_price, r.discount, r.link, r.category, r.storage_location].some((v) => v.trim())
/** Tomt eller ett tal som 12, 24,90 eller 1 234,50 (ev. med "kr"). Med `negative` godtas också -10. */
const isAmount = (v: string, negative = false) =>
  !v.trim() || (negative ? /^-?\d+([.,]\d+)?$/ : /^\d+([.,]\d+)?$/).test(v.replace(/\s|kr\.?$/gi, ''))

const CATEGORIES = ['Livsmedel', 'Förbrukning', 'Teknik', 'Verktyg', 'Dekoration', 'Barnmaterial', 'Städ', 'Kontor', 'Övrigt']
const UNITS = ['st', 'paket', 'förp.', 'kg', 'liter', 'rulle', 'låda', 'set']
const MAX_RECEIPT = 20 * 1024 * 1024

const s = (v: string | null | undefined) => v ?? ''
/** Tal tillbaka till fältet som man skriver dem: 1,5 och 3 (inte 1.5). */
const numStr = (v: number) => String(v).replace('.', ',')
/** Belopp med ören som 24,90 – heltal som 49. */
const amountStr = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(Math.max(2, String(v).split('.')[1]?.length ?? 0)).replace('.', ','))
const n = (v: string) => (v.trim() ? v.trim() : null)

type Errors = Record<string, string>
/** Formulärets läge, så att sidan kan fråga innan osparat slängs. */
type FormState = { dirty: boolean; busy: boolean }

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-6 border-t border-line pt-6">
      <div>
        <h3 className="text-xl font-semibold text-ink">{title}</h3>
        {hint && <p className="mt-1 text-base text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function PurchaseForm({
  purchase,
  items,
  state,
  onSaved,
  onCancel,
}: {
  purchase: Purchase | null
  items: PurchaseItem[]
  state: React.MutableRefObject<FormState>
  /** `alive` är falskt om rutan stängdes medan inköpet sparades. */
  onSaved: (alive: boolean) => void
  onCancel: () => void
}) {
  const auth = useAuth()
  const author = useAuthorFields()
  const uid = useId()
  const fid = (k: string) => `${uid}-${k}`
  const fileRef = useRef<HTMLInputElement>(null)
  const [f, setF] = useState({
    store_name: s(purchase?.store_name),
    store_address: s(purchase?.store_address),
    store_url: s(purchase?.store_url),
    contact_name: s(purchase?.contact_name),
    contact_phone: s(purchase?.contact_phone),
    purchased_on: purchase?.purchased_on ?? todayStr(),
    committee_id: purchase?.committee_id ?? auth.memberships[0]?.committee_id ?? '',
    paid_by: s(purchase?.paid_by),
    discount_total: purchase?.discount_total ? amountStr(purchase.discount_total) : '',
    discount_note: s(purchase?.discount_note),
    notes: s(purchase?.notes),
  })
  const [rows, setRows] = useState<ItemDraft[]>(
    items.length
      ? items.map((i) => ({
          id: i.id,
          name: i.name,
          brand: s(i.brand),
          quantity: numStr(i.quantity),
          unit: s(i.unit),
          unit_price: amountStr(i.unit_price),
          discount: i.discount ? amountStr(i.discount) : '',
          link: s(i.link),
          category: s(i.category),
          storage_location: s(i.storage_location),
        }))
      : [emptyItem()],
  )
  const [origIds] = useState(() => items.map((i) => i.id))
  // Redan borttagna rader hoppas över om användaren försöker spara igen efter ett fel
  const removed = useRef(new Set<string>())
  const [receipt, setReceipt] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  // Webbplats, kontaktperson och rabatt på hela köpet ligger hopfällda – öppna om något redan är ifyllt
  const moreRef = useRef<HTMLDetailsElement>(null)
  const [moreOpen, setMoreOpen] = useState(() => [f.store_url, f.contact_name, f.contact_phone, f.discount_total, f.discount_note].some((v) => v.trim()))
  const [initial] = useState(() => JSON.stringify({ f, rows }))
  const dirty = !!receipt || JSON.stringify({ f, rows }) !== initial
  useEffect(() => {
    state.current = { dirty, busy }
  }, [state, dirty, busy])
  // Stängs rutan medan inköpet sparas fortsätter sparandet – då visas resultatet som ett meddelande
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const clearErr = (k: string) => {
    if (!errors[k]) return
    setErrors((prev) => {
      const next = { ...prev }
      delete next[k]
      return next
    })
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setF({ ...f, [k]: e.target.value })
    clearErr(k)
  }
  const setRow = (i: number, k: keyof ItemDraft, v: string) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
    clearErr(`${i}.${k}`)
  }
  const removeRow = (i: number) => {
    setRows(rows.filter((_, j) => j !== i))
    // Raderna byter plats – släpp felen på produkterna i stället för att peka fel
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !/^\d+\./.test(k))))
  }

  const parsed = rows.filter((r) => r.name.trim()).map((r) => ({ quantity: qty(r), unit_price: toNum(r.unit_price), discount: toNum(r.discount) }))
  const totals = purchaseTotals({ discount_total: toNum(f.discount_total) }, parsed)

  /** Felen läggs till i samma ordning som fälten står på sidan. */
  function validate(): Errors {
    const e: Errors = {}
    if (!f.store_name.trim()) e.store_name = 'Skriv vilken butik det var, till exempel ICA Maxi.'
    if (f.store_url.trim() && !webHref(f.store_url)) e.store_url = 'Skriv en webbadress, till exempel ica.se.'
    const noProducts = !rows.some((r) => r.name.trim())
    rows.forEach((r, i) => {
      if (!r.name.trim()) {
        if (touched(r)) e[`${i}.name`] = 'Skriv vad produkten heter – eller ta bort produkten.'
        else if (i === 0 && noProducts) e['0.name'] = 'Skriv namnet på minst en produkt.'
      }
      if (!isAmount(r.quantity)) e[`${i}.quantity`] = 'Skriv antalet som en siffra, till exempel 2.'
      // Minus är tillåtet för t.ex. pant som går tillbaka
      if (!isAmount(r.unit_price, true)) e[`${i}.unit_price`] = 'Skriv priset i kronor, till exempel 24,90.'
      if (!isAmount(r.discount)) e[`${i}.discount`] = 'Skriv rabatten i kronor, till exempel 10.'
    })
    if (!isAmount(f.discount_total)) e.discount_total = 'Skriv rabatten i kronor, till exempel 50.'
    if (receipt && receipt.size > MAX_RECEIPT) e.receipt = 'Kvittot är för stort. Det får vara högst 20 MB – ta ett nytt foto eller välj en mindre fil.'
    return e
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length) {
      // Fel i de hopfällda fälten: fäll ut dem först, annars går det inte att se eller fokusera fältet
      if ((found.store_url || found.discount_total) && moreRef.current) {
        moreRef.current.open = true
        setMoreOpen(true)
      }
      // Fokus till det första felet uppifrån på sidan, oavsett i vilken ordning felen hittades
      const first = Object.keys(found)
        .map((k) => document.getElementById(fid(k)))
        .filter((el): el is HTMLElement => !!el)
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0]
      first?.focus()
      return setErr('Rätta det som är markerat ovan och spara igen.')
    }
    const valid = rows.filter((r) => r.name.trim())
    setBusy(true)
    try {
      const oldReceipt = purchase?.receipt_path ?? null
      let uploaded: string | null = null
      // Adaptern kan lägga filen på en annan sökväg (t.ex. i artifacten) – spara den den ger tillbaka
      if (receipt) uploaded = await api.upload('receipts', `${uuid()}/${safeFileName(receipt.name)}`, receipt)
      const row: Partial<Purchase> = {
        store_name: f.store_name.trim(),
        store_address: n(f.store_address),
        store_url: n(f.store_url),
        contact_name: n(f.contact_name),
        contact_phone: n(f.contact_phone),
        purchased_on: f.purchased_on || todayStr(),
        committee_id: f.committee_id || null,
        paid_by: n(f.paid_by),
        discount_total: toNum(f.discount_total),
        discount_note: n(f.discount_note),
        notes: n(f.notes),
        receipt_path: uploaded ?? oldReceipt,
        receipt_name: uploaded ? receipt!.name : (purchase?.receipt_name ?? null),
      }
      let saved: Purchase
      try {
        if (purchase && uploaded && oldReceipt) {
          // Lagringsreglerna tillåter bara att kvittot tas bort medan inköpet pekar på det: spara först med det
          // gamla kvittot (så att ett behörighetsfel stoppar innan något raderas), ta bort det och byt sedan.
          await api.update('purchases', purchase.id, { ...row, receipt_path: oldReceipt, receipt_name: purchase.receipt_name })
          await api.removeFile('receipts', oldReceipt).catch(() => undefined)
        }
        saved = purchase ? await api.update('purchases', purchase.id, row) : await api.insert('purchases', { ...row, ...author() })
      } catch (e) {
        if (uploaded) await api.removeFile('receipts', uploaded).catch(() => undefined)
        throw e
      }
      const toItem = (r: ItemDraft): Partial<PurchaseItem> => ({
        purchase_id: saved.id,
        name: r.name.trim(),
        brand: n(r.brand),
        quantity: qty(r),
        unit: n(r.unit),
        unit_price: toNum(r.unit_price),
        discount: toNum(r.discount),
        link: n(r.link),
        category: n(r.category),
        storage_location: n(r.storage_location),
      })
      const keep = new Set(valid.map((r) => r.id).filter(Boolean))
      for (const id of origIds) {
        if (keep.has(id) || removed.current.has(id)) continue
        await api.remove('purchase_items', id)
        removed.current.add(id)
      }
      for (const r of valid.filter((r) => r.id)) await api.update('purchase_items', r.id!, toItem(r))
      // En egen tid per rad (efter de befintliga) så att produkterna listas i den ordning de skrevs in
      const t0 = Math.max(Date.now(), ...items.map((i) => (Date.parse(i.created_at ?? '') || 0) + 1))
      const fresh = valid.filter((r) => !r.id).map((r, k) => ({ ...toItem(r), status: 'in_stock' as const, created_at: new Date(t0 + k).toISOString() }))
      if (fresh.length) await api.insertMany('purchase_items', fresh)
      onSaved(alive.current)
    } catch (e) {
      const msg = (e as Error).message
      if (alive.current) setErr(msg)
      else notify(`Inköpet från ${f.store_name.trim()} kunde inte sparas: ${msg}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const receiptName = receipt?.name ?? purchase?.receipt_name ?? null

  return (
    <form onSubmit={save} className="space-y-8" noValidate>
      <datalist id="vk-categories">
        {CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="vk-units">
        {UNITS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="vk-paid-by">
        <option value="Föreningens kort" />
        <option value="Faktura" />
        <option value="Swish" />
        <option value="Utlägg – " />
      </datalist>

      <p className="text-base text-muted">Butiken och minst en produkt måste fyllas i. Resten fyller du i om du vet.</p>

      <Section title="Butik">
        <Question label="Butikens namn" error={errors.store_name}>
          <Input id={fid('store_name')} value={f.store_name} onChange={set('store_name')} aria-invalid={!!errors.store_name} autoComplete="off" />
        </Question>
        <div className="grid items-end gap-6 sm:grid-cols-2">
          <Question label="Inköpsdatum">
            <Input type="date" value={f.purchased_on} onChange={set('purchased_on')} />
          </Question>
          <Question label="Kommitté" hint="Vems inköp det är.">
            <Select value={f.committee_id} onChange={set('committee_id')}>
              <option value="">Ingen, gemensamt</option>
              {auth.committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Question>
        </div>
        <Question label="Adress eller ort (valfritt)">
          <Input value={f.store_address} onChange={set('store_address')} className="sm:max-w-md" />
        </Question>
      </Section>

      <Section title="Produkter" hint="En rad per sorts vara. Allt hamnar i inventarielistan.">
        <ol className="divide-y divide-line border-y border-line">
          {rows.map((r, i) => {
            const e = (k: keyof ItemDraft) => errors[`${i}.${k}`]
            return (
              <li key={r.id ?? `new-${i}`} className="space-y-5 py-5">
                <div className="flex min-h-11 items-center justify-between gap-3">
                  <h4 className="text-lg font-semibold text-ink">{rows.length > 1 ? `Produkt ${i + 1}` : 'Produkt'}</h4>
                  {rows.length > 1 && (
                    <Button type="button" variant="ghost" className="-me-4" onClick={() => removeRow(i)} aria-label={`Ta bort produkt ${i + 1}${r.name.trim() ? ` (${r.name.trim()})` : ''}`}>
                      <Trash2 className="size-4" aria-hidden /> Ta bort
                    </Button>
                  )}
                </div>
                <Question label="Vad är det?" error={e('name')}>
                  <Input id={fid(`${i}.name`)} value={r.name} onChange={(ev) => setRow(i, 'name', ev.target.value)} aria-invalid={!!e('name')} autoComplete="off" />
                </Question>
                <Question label="Märke (valfritt)">
                  <Input value={r.brand} onChange={(ev) => setRow(i, 'brand', ev.target.value)} autoComplete="off" />
                </Question>
                <div className="grid items-end gap-4 sm:grid-cols-2">
                  <Question label="Antal" error={e('quantity')}>
                    <Input id={fid(`${i}.quantity`)} inputMode="decimal" value={r.quantity} onChange={(ev) => setRow(i, 'quantity', ev.target.value)} aria-invalid={!!e('quantity')} />
                  </Question>
                  <Question label="Enhet">
                    <Input list="vk-units" value={r.unit} onChange={(ev) => setRow(i, 'unit', ev.target.value)} />
                  </Question>
                </div>
                <div className="grid items-end gap-4 sm:grid-cols-2">
                  <Question label="Pris per enhet i kronor (valfritt)" error={e('unit_price')}>
                    <Input id={fid(`${i}.unit_price`)} inputMode="decimal" value={r.unit_price} onChange={(ev) => setRow(i, 'unit_price', ev.target.value)} aria-invalid={!!e('unit_price')} />
                  </Question>
                  <Question label="Rabatt i kronor (valfritt)" error={e('discount')}>
                    <Input id={fid(`${i}.discount`)} inputMode="decimal" value={r.discount} onChange={(ev) => setRow(i, 'discount', ev.target.value)} aria-invalid={!!e('discount')} />
                  </Question>
                </div>
                <div className="grid items-end gap-5 sm:grid-cols-2">
                  <Question label="Kategori (valfritt)">
                    <Input list="vk-categories" value={r.category} onChange={(ev) => setRow(i, 'category', ev.target.value)} />
                  </Question>
                  <Question label="Var förvaras den? (valfritt)">
                    <Input value={r.storage_location} onChange={(ev) => setRow(i, 'storage_location', ev.target.value)} />
                  </Question>
                </div>
                <Question label="Länk till produkten (valfritt)">
                  <Input type="url" inputMode="url" value={r.link} onChange={(ev) => setRow(i, 'link', ev.target.value)} autoCapitalize="off" />
                </Question>
                <p className="text-base text-muted">
                  Summa för raden <b className="font-semibold text-ink tabular-nums">{kr(qty(r) * toNum(r.unit_price) - toNum(r.discount))}</b>
                </p>
              </li>
            )
          })}
        </ol>
        <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setRows([...rows, emptyItem()])}>
          <Plus className="size-4" aria-hidden /> Lägg till produkt
        </Button>
      </Section>

      <Section title="Betalning och kvitto">
        <Question label="Betalt av (valfritt)" hint="Föreningens kort, faktura – eller namn vid utlägg.">
          <Input list="vk-paid-by" value={f.paid_by} onChange={set('paid_by')} className="sm:max-w-sm" />
        </Question>
        <div>
          <p className="text-base font-medium text-ink">Foto eller PDF av kvittot (valfritt)</p>
          <p className="mt-0.5 text-base text-muted">Högst 20 MB.</p>
          {errors.receipt && <p className="mt-1 text-base font-medium text-rose-700">{errors.receipt}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf,.heic,.heif"
            className="hidden"
            onChange={(e) => {
              setReceipt(e.target.files?.[0] ?? null)
              clearErr('receipt')
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button id={fid('receipt')} type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              <Receipt className="size-4" aria-hidden /> {receiptName ? 'Byt kvitto' : 'Välj kvitto'}
            </Button>
            {receiptName && <span className="min-w-0 truncate text-base text-muted">{receiptName}</span>}
          </div>
        </div>
        <Question label="Övrigt om inköpet (valfritt)">
          <Textarea rows={2} value={f.notes} onChange={set('notes')} />
        </Question>
      </Section>

      <details ref={moreRef} open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)} className="group border-t border-line pt-4">
        <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 text-lg font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-5 transition-transform group-open:rotate-180" aria-hidden /> Fler uppgifter om butiken och rabatt
        </summary>
        <div className="space-y-6 pt-4">
          <Question label="Butikens webbplats (valfritt)" hint="Till exempel ica.se" error={errors.store_url}>
            <Input id={fid('store_url')} type="url" inputMode="url" value={f.store_url} onChange={set('store_url')} aria-invalid={!!errors.store_url} autoCapitalize="off" className="sm:max-w-md" />
          </Question>
          <div className="grid items-end gap-6 sm:grid-cols-2">
            <Question label="Kontaktperson i butiken (valfritt)" hint="Namn och roll, om någon hjälpte till.">
              <Input value={f.contact_name} onChange={set('contact_name')} />
            </Question>
            <Question label="Kontaktpersonens telefon (valfritt)">
              <Input type="tel" inputMode="tel" value={f.contact_phone} onChange={set('contact_phone')} />
            </Question>
          </div>
          <div className="grid items-end gap-6 sm:grid-cols-2">
            <Question label="Rabatt på hela köpet i kronor (valfritt)" hint="Utöver rabatterna på produkterna." error={errors.discount_total}>
              <Input id={fid('discount_total')} inputMode="decimal" value={f.discount_total} onChange={set('discount_total')} aria-invalid={!!errors.discount_total} />
            </Question>
            <Question label="Om rabatten (valfritt)" hint="Till exempel föreningsrabatt 10 %, kampanj, vem som ordnade den.">
              <Input value={f.discount_note} onChange={set('discount_note')} />
            </Question>
          </div>
        </div>
      </details>

      <section aria-label="Summering" className="rounded-lg bg-ice px-4 py-4 sm:px-5">
        <dl className="space-y-1 text-base">
          <div className="flex justify-between gap-4">
            <dt>
              {parsed.length} {parsed.length === 1 ? 'produkt' : 'produkter'}
            </dt>
            <dd className="tabular-nums">{kr(totals.gross)}</dd>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between gap-4 text-emerald-800">
              <dt>Rabatt</dt>
              <dd className="tabular-nums">−{kr(totals.discount)}</dd>
            </div>
          )}
          <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-ink/15 pt-2 text-ink">
            <dt className="font-semibold">Att betala</dt>
            <dd className="text-2xl font-semibold tabular-nums">{kr(totals.total)}</dd>
          </div>
        </dl>
      </section>

      <ErrorText>{err}</ErrorText>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {busy ? 'Stäng' : 'Avbryt'}
        </Button>
        <Button type="submit" loading={busy}>
          Spara inköp
        </Button>
      </div>
    </form>
  )
}
