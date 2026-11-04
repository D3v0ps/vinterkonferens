import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ExternalLink, Pencil, Plus, Receipt, ShoppingCart, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Empty, ErrorText, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, cx } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth, useAuthorFields } from '../../lib/auth'
import { safeFileName, uuid } from '../../lib/db'
import { kr } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { todayStr } from '../../lib/time'
import type { Purchase, PurchaseItem } from '../../lib/types'

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

/** Öppnar ett kvitto (signerad länk) i ny flik. */
export async function openReceipt(path: string) {
  const w = window.open('', '_blank')
  const url = await api.fileUrl('receipts', path)
  if (url && w) w.location.href = url
  else w?.close()
}

export function useCanEditPurchase() {
  const auth = useAuth()
  return (p: Purchase) =>
    auth.isAdmin || auth.isLead(p.committee_id) || (!!p.created_by && p.created_by === auth.userId) || (!!p.author_name && p.author_name === auth.displayName)
}

export default function Purchases() {
  const auth = useAuth()
  const canEdit = useCanEditPurchase()
  const purchases = useList('purchases', { order: [{ col: 'purchased_on', asc: false }, { col: 'created_at', asc: false }] })
  const items = useList('purchase_items')
  const [editing, setEditing] = useState<Purchase | 'new' | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [committee, setCommittee] = useState('')

  const byPurchase = useMemo(() => {
    const m = new Map<string, PurchaseItem[]>()
    for (const i of items.data) m.set(i.purchase_id, [...(m.get(i.purchase_id) ?? []), i])
    return m
  }, [items.data])

  const shown = purchases.data.filter((p) => !committee || p.committee_id === committee)
  const sum = shown.reduce((s, p) => s + purchaseTotals(p, byPurchase.get(p.id) ?? []).total, 0)

  async function remove(p: Purchase) {
    if (!confirm(`Ta bort inköpet från ${p.store_name} med alla rader?`)) return
    for (const i of byPurchase.get(p.id) ?? []) await api.remove('purchase_items', i.id)
    await api.remove('purchases', p.id)
    if (p.receipt_path) await api.removeFile('receipts', p.receipt_path).catch(() => undefined)
  }

  return (
    <div>
      <PageHeader
        title="Inköp"
        subtitle="Registrera allt som köps in – butik, kontaktperson, priser och rabatter. Allt hamnar i inventarielistan."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Nytt inköp
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Select value={committee} onChange={(e) => setCommittee(e.target.value)} className="w-auto" aria-label="Kommitté">
          <option value="">Alla kommittéer</option>
          {auth.committees.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <span className="text-sm text-slate-600">
          {shown.length} inköp · totalt <b className="text-ink">{kr(sum)}</b>
        </span>
      </div>

      {purchases.loading ? (
        <Spinner />
      ) : purchases.error ? (
        <ErrorText>{purchases.error}</ErrorText>
      ) : shown.length === 0 ? (
        <Empty icon={<ShoppingCart className="size-8 text-slate-400" />}>Inga inköp registrerade ännu.</Empty>
      ) : (
        <div className="space-y-3">
          {shown.map((p) => {
            const rows = byPurchase.get(p.id) ?? []
            const t = purchaseTotals(p, rows)
            const c = auth.committees.find((x) => x.id === p.committee_id)
            const isOpen = open === p.id
            return (
              <Card key={p.id} className="overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : p.id)} className="flex w-full items-start justify-between gap-3 p-4 text-start hover:bg-slate-50" aria-expanded={isOpen}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{p.store_name}</span>
                      {c && <Badge>{c.name}</Badge>}
                    </div>
                    <div className="mt-0.5 text-sm text-slate-600">
                      {p.purchased_on} · {rows.length} {rows.length === 1 ? 'rad' : 'rader'}
                      {p.contact_name && ` · Kontakt: ${p.contact_name}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-end">
                    <div>
                      <div className="font-semibold tabular-nums text-ink">{kr(t.total)}</div>
                      {t.discount > 0 && <div className="text-xs text-emerald-700">−{kr(t.discount)} rabatt</div>}
                    </div>
                    <ChevronDown className={cx('size-5 text-slate-400 transition', isOpen && 'rotate-180')} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 p-4 text-sm">
                    <dl className="mb-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                      {p.store_address && <Info label="Adress">{p.store_address}</Info>}
                      {p.store_url && (
                        <Info label="Webb">
                          <a href={p.store_url} target="_blank" rel="noreferrer" className="text-ink-soft underline">
                            {p.store_url.replace(/^https?:\/\//, '')}
                          </a>
                        </Info>
                      )}
                      {(p.contact_name || p.contact_phone) && (
                        <Info label="Kontaktperson">
                          {p.contact_name} {p.contact_phone && <a href={`tel:${p.contact_phone}`} className="text-ink-soft underline">{p.contact_phone}</a>}
                        </Info>
                      )}
                      {p.paid_by && <Info label="Betalt av">{p.paid_by}</Info>}
                      {p.discount_total > 0 && <Info label="Rabatt på hela köpet">{kr(p.discount_total)}{p.discount_note && ` – ${p.discount_note}`}</Info>}
                      {p.notes && <Info label="Övrigt">{p.notes}</Info>}
                      <Info label="Registrerat av">{p.author_name ?? '–'}</Info>
                    </dl>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[32rem] text-left text-sm">
                        <thead className="text-xs uppercase text-slate-500">
                          <tr>
                            <th className="py-1.5 pe-2 text-start font-medium">Produkt</th>
                            <th className="py-1.5 pe-2 text-start font-medium">Märke</th>
                            <th className="py-1.5 pe-2 text-end font-medium">Antal</th>
                            <th className="py-1.5 pe-2 text-end font-medium">À-pris</th>
                            <th className="py-1.5 pe-2 text-end font-medium">Rabatt</th>
                            <th className="py-1.5 text-end font-medium">Summa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rows.map((i) => (
                            <tr key={i.id}>
                              <td className="py-1.5 pe-2">
                                {i.link ? (
                                  <a href={i.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-soft underline">
                                    {i.name} <ExternalLink className="size-3" />
                                  </a>
                                ) : (
                                  i.name
                                )}
                              </td>
                              <td className="py-1.5 pe-2 text-slate-600">{i.brand}</td>
                              <td className="py-1.5 pe-2 text-end tabular-nums">
                                {i.quantity} {i.unit}
                              </td>
                              <td className="py-1.5 pe-2 text-end tabular-nums">{kr(i.unit_price)}</td>
                              <td className="py-1.5 pe-2 text-end tabular-nums text-emerald-700">{i.discount ? `−${kr(i.discount)}` : ''}</td>
                              <td className="py-1.5 text-end tabular-nums">{kr(lineTotal(i))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {p.receipt_path && (
                        <Button size="sm" variant="secondary" onClick={() => openReceipt(p.receipt_path!)}>
                          <Receipt className="size-4" /> Kvitto
                        </Button>
                      )}
                      {canEdit(p) && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                            <Pencil className="size-4" /> Redigera
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => remove(p)}>
                            <Trash2 className="size-4" /> Ta bort
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nytt inköp' : 'Redigera inköp'} wide>
        {editing && (
          <PurchaseForm
            key={editing === 'new' ? 'new' : editing.id}
            purchase={editing === 'new' ? null : editing}
            items={editing === 'new' ? [] : byPurchase.get(editing.id) ?? []}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-slate-500">{label}:</dt>
      <dd className="min-w-0 break-words">{children}</dd>
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

const CATEGORIES = ['Livsmedel', 'Förbrukning', 'Teknik', 'Verktyg', 'Dekoration', 'Barnmaterial', 'Städ', 'Kontor', 'Övrigt']
const UNITS = ['st', 'paket', 'förp.', 'kg', 'liter', 'rulle', 'låda', 'set']

const s = (v: string | null | undefined) => v ?? ''
const n = (v: string) => (v.trim() ? v.trim() : null)

function PurchaseForm({ purchase, items, onDone }: { purchase: Purchase | null; items: PurchaseItem[]; onDone: () => void }) {
  const auth = useAuth()
  const author = useAuthorFields()
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
    discount_total: purchase?.discount_total ? String(purchase.discount_total) : '',
    discount_note: s(purchase?.discount_note),
    notes: s(purchase?.notes),
  })
  const [rows, setRows] = useState<ItemDraft[]>(
    items.length
      ? items.map((i) => ({
          id: i.id,
          name: i.name,
          brand: s(i.brand),
          quantity: String(i.quantity),
          unit: s(i.unit),
          unit_price: String(i.unit_price),
          discount: i.discount ? String(i.discount) : '',
          link: s(i.link),
          category: s(i.category),
          storage_location: s(i.storage_location),
        }))
      : [emptyItem()],
  )
  const [receipt, setReceipt] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const setRow = (i: number, k: keyof ItemDraft, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))

  const parsed = rows.filter((r) => r.name.trim()).map((r) => ({ quantity: toNum(r.quantity), unit_price: toNum(r.unit_price), discount: toNum(r.discount) }))
  const totals = purchaseTotals({ discount_total: toNum(f.discount_total) }, parsed)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const valid = rows.filter((r) => r.name.trim())
    if (!f.store_name.trim()) return setErr('Fyll i butikens namn.')
    if (!valid.length) return setErr('Lägg till minst en produkt.')
    if (receipt && receipt.size > 20 * 1024 * 1024) return setErr('Kvittot är för stort (max 20 MB).')
    setBusy(true)
    try {
      let receipt_path = purchase?.receipt_path ?? null
      let receipt_name = purchase?.receipt_name ?? null
      if (receipt) {
        const path = `${uuid()}/${safeFileName(receipt.name)}`
        await api.upload('receipts', path, receipt)
        if (receipt_path) await api.removeFile('receipts', receipt_path).catch(() => undefined)
        receipt_path = path
        receipt_name = receipt.name
      }
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
        receipt_path,
        receipt_name,
      }
      const saved = purchase ? await api.update('purchases', purchase.id, row) : await api.insert('purchases', { ...row, ...author() })
      const toItem = (r: ItemDraft): Partial<PurchaseItem> => ({
        purchase_id: saved.id,
        name: r.name.trim(),
        brand: n(r.brand),
        quantity: toNum(r.quantity) || 1,
        unit: n(r.unit),
        unit_price: toNum(r.unit_price),
        discount: toNum(r.discount),
        link: n(r.link),
        category: n(r.category),
        storage_location: n(r.storage_location),
      })
      const keep = new Set(valid.map((r) => r.id).filter(Boolean))
      for (const old of items) if (!keep.has(old.id)) await api.remove('purchase_items', old.id)
      for (const r of valid.filter((r) => r.id)) await api.update('purchase_items', r.id!, toItem(r))
      const fresh = valid.filter((r) => !r.id).map((r) => ({ ...toItem(r), status: 'in_stock' as const }))
      if (fresh.length) await api.insertMany('purchase_items', fresh)
      onDone()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <datalist id="vk-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="vk-units">{UNITS.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="vk-paid-by">
        <option value="Föreningens kort" />
        <option value="Faktura" />
        <option value="Swish" />
        <option value="Utlägg – " />
      </datalist>

      <section className="grid gap-3 sm:grid-cols-2">
        <Field label="Butik" required>
          <Input value={f.store_name} onChange={set('store_name')} placeholder="T.ex. ICA Maxi" />
        </Field>
        <Field label="Adress / ort">
          <Input value={f.store_address} onChange={set('store_address')} />
        </Field>
        <Field label="Butikens webbplats">
          <Input type="url" inputMode="url" value={f.store_url} onChange={set('store_url')} placeholder="https://" />
        </Field>
        <Field label="Inköpsdatum">
          <Input type="date" value={f.purchased_on} onChange={set('purchased_on')} />
        </Field>
        <Field label="Kontaktperson i butiken">
          <Input value={f.contact_name} onChange={set('contact_name')} placeholder="Namn och roll" />
        </Field>
        <Field label="Kontaktpersonens telefon">
          <Input type="tel" value={f.contact_phone} onChange={set('contact_phone')} />
        </Field>
        <Field label="Kommitté">
          <Select value={f.committee_id} onChange={set('committee_id')}>
            <option value="">Ingen / gemensamt</option>
            {auth.committees.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Betalt av" hint="Föreningens kort, faktura – eller namn vid utlägg.">
          <Input list="vk-paid-by" value={f.paid_by} onChange={set('paid_by')} />
        </Field>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">Produkter</h3>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.id ?? i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                <Field label="Produkt" required className="col-span-2">
                  <Input value={r.name} onChange={(e) => setRow(i, 'name', e.target.value)} />
                </Field>
                <Field label="Märke" className="col-span-2 sm:col-span-2">
                  <Input value={r.brand} onChange={(e) => setRow(i, 'brand', e.target.value)} />
                </Field>
                <Field label="Antal">
                  <Input inputMode="decimal" value={r.quantity} onChange={(e) => setRow(i, 'quantity', e.target.value)} />
                </Field>
                <Field label="Enhet">
                  <Input list="vk-units" value={r.unit} onChange={(e) => setRow(i, 'unit', e.target.value)} />
                </Field>
                <Field label="À-pris (kr)">
                  <Input inputMode="decimal" value={r.unit_price} onChange={(e) => setRow(i, 'unit_price', e.target.value)} />
                </Field>
                <Field label="Rabatt (kr)">
                  <Input inputMode="decimal" value={r.discount} onChange={(e) => setRow(i, 'discount', e.target.value)} placeholder="0" />
                </Field>
                <Field label="Kategori" className="col-span-2 sm:col-span-2">
                  <Input list="vk-categories" value={r.category} onChange={(e) => setRow(i, 'category', e.target.value)} />
                </Field>
                <Field label="Förvaringsplats" className="col-span-2 sm:col-span-2">
                  <Input value={r.storage_location} onChange={(e) => setRow(i, 'storage_location', e.target.value)} />
                </Field>
                <Field label="Länk till produkten" className="col-span-2 sm:col-span-4">
                  <Input type="url" inputMode="url" value={r.link} onChange={(e) => setRow(i, 'link', e.target.value)} placeholder="https://" />
                </Field>
                <div className="col-span-2 flex items-end justify-between gap-2">
                  <span className="pb-2.5 text-sm tabular-nums text-slate-600">
                    = <b className="text-ink">{kr(toNum(r.quantity) * toNum(r.unit_price) - toNum(r.discount))}</b>
                  </span>
                  {rows.length > 1 && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Ta bort rad">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => setRows([...rows, emptyItem()])}>
          <Plus className="size-4" /> Lägg till produkt
        </Button>
      </section>

      <section className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label="Rabatt hela köpet (kr)">
          <Input inputMode="decimal" value={f.discount_total} onChange={set('discount_total')} placeholder="0" />
        </Field>
        <Field label="Om rabatten" hint="T.ex. föreningsrabatt 10 %, kampanj, vem som ordnade den.">
          <Input value={f.discount_note} onChange={set('discount_note')} />
        </Field>
        <Field label="Kvitto (foto eller PDF)" className="sm:col-span-2">
          <input ref={fileRef} type="file" accept="image/*,.pdf,.heic,.heif" className="hidden" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <Receipt className="size-4" /> {receipt || purchase?.receipt_path ? 'Byt kvitto' : 'Ladda upp kvitto'}
            </Button>
            <span className="truncate text-sm text-slate-600">{receipt?.name ?? purchase?.receipt_name ?? ''}</span>
          </div>
        </Field>
        <Field label="Övrigt" className="sm:col-span-2">
          <Textarea rows={2} value={f.notes} onChange={set('notes')} />
        </Field>
      </section>

      <div className="rounded-xl bg-ice px-4 py-3 text-sm">
        <div className="flex justify-between"><span>Summa före rabatt</span><span className="tabular-nums">{kr(totals.gross)}</span></div>
        <div className="flex justify-between text-emerald-700"><span>Rabatt</span><span className="tabular-nums">−{kr(totals.discount)}</span></div>
        <div className="mt-1 flex justify-between border-t border-slate-300/60 pt-1 font-semibold text-ink"><span>Att betala</span><span className="tabular-nums">{kr(totals.total)}</span></div>
      </div>

      <ErrorText>{err}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Avbryt
        </Button>
        <Button type="submit" loading={busy}>
          Spara inköp
        </Button>
      </div>
    </form>
  )
}
