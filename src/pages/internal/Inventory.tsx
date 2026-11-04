import { useMemo, useState } from 'react'
import { Download, Package, Search } from 'lucide-react'
import { notify } from '../../components/dialogs'
import { Badge, Button, Empty, ErrorText, Input, PageHeader, Select, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { downloadCsv, kr, num } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { todayStr } from '../../lib/time'
import type { ItemStatus, Purchase, PurchaseItem } from '../../lib/types'
import { lineTotal, webHref } from './Purchases'

const STATUS: Record<ItemStatus, { label: string; tone: 'green' | 'slate' | 'amber' | 'blue' }> = {
  in_stock: { label: 'I lager', tone: 'green' },
  used: { label: 'Förbrukad', tone: 'slate' },
  returned: { label: 'Returnerad', tone: 'amber' },
  lent: { label: 'Utlånad', tone: 'blue' },
}

type Row = PurchaseItem & { purchase: Purchase | undefined }

export default function Inventory() {
  const auth = useAuth()
  const items = useList('purchase_items', { order: [{ col: 'name' }] })
  const purchases = useList('purchases')
  const [q, setQ] = useState('')
  const [committee, setCommittee] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const rows: Row[] = useMemo(() => {
    const pm = new Map(purchases.data.map((p) => [p.id, p]))
    return items.data.map((i) => ({ ...i, purchase: pm.get(i.purchase_id) }))
  }, [items.data, purchases.data])

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'sv')), [rows])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (!committee || r.purchase?.committee_id === committee) &&
        (!category || r.category === category) &&
        (!status || r.status === status) &&
        (!s || [r.name, r.brand, r.purchase?.store_name, r.storage_location, r.category].some((x) => x?.toLowerCase().includes(s))),
    )
  }, [rows, q, committee, category, status])

  const value = shown.reduce((s, r) => s + lineTotal(r), 0)
  const purchaseDiscounts = [...new Set(shown.map((r) => r.purchase).filter(Boolean) as Purchase[])].reduce((s, p) => s + (p.discount_total || 0), 0)
  const countBy = (st: ItemStatus) => shown.filter((r) => r.status === st).length
  const committeeName = (id: string | null | undefined) => auth.committees.find((c) => c.id === id)?.name ?? ''

  async function patch(r: Row, p: Partial<PurchaseItem>) {
    setErr(null)
    try {
      await api.update('purchase_items', r.id, p)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function exportCsv() {
    setExporting(true)
    try {
      // downloadCsv visar själv ett meddelande om att filen sparats eller varför det inte gick
      await downloadCsv(
        `inventarielista-${todayStr()}.csv`,
        ['Produkt', 'Märke', 'Antal', 'Enhet', 'À-pris', 'Rabatt (rad)', 'Radsumma', 'Kategori', 'Förvaring', 'Status', 'Butik', 'Butikens adress', 'Butikens webb', 'Kontaktperson', 'Kontaktens telefon', 'Inköpsdatum', 'Kommitté', 'Rabatt hela köpet', 'Om rabatten', 'Betalt av', 'Länk'],
        shown.map((r) => [
          r.name,
          r.brand,
          r.quantity,
          r.unit,
          r.unit_price,
          r.discount || 0,
          lineTotal(r),
          r.category,
          r.storage_location,
          STATUS[r.status]?.label ?? r.status,
          r.purchase?.store_name,
          r.purchase?.store_address,
          r.purchase?.store_url,
          r.purchase?.contact_name,
          r.purchase?.contact_phone,
          r.purchase?.purchased_on,
          committeeName(r.purchase?.committee_id),
          r.purchase?.discount_total || 0,
          r.purchase?.discount_note,
          r.purchase?.paid_by,
          r.link,
        ]),
      )
    } catch (e) {
      notify((e as Error).message || 'Listan kunde inte exporteras.', 'error')
    } finally {
      setExporting(false)
    }
  }

  // Alla volontärer får ändra förvaringsplats och status (övriga kolumner spärras i databasen)
  const editable = auth.isStaff

  const statusCell = (r: Row) =>
    editable ? (
      <Select value={r.status} onChange={(e) => patch(r, { status: e.target.value as ItemStatus })} className="w-auto" aria-label={`Status för ${r.name}`}>
        {(Object.keys(STATUS) as ItemStatus[]).map((s) => (
          <option key={s} value={s}>
            {STATUS[s].label}
          </option>
        ))}
      </Select>
    ) : (
      <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</Badge>
    )

  const storageCell = (r: Row) =>
    editable ? (
      <Input
        key={r.storage_location ?? ''}
        defaultValue={r.storage_location ?? ''}
        placeholder="Var finns den?"
        aria-label={`Förvaring för ${r.name}`}
        onBlur={(e) => {
          const v = e.target.value.trim() || null
          if (v !== (r.storage_location ?? null)) patch(r, { storage_location: v })
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    ) : (
      <span className="text-muted">{r.storage_location ?? '–'}</span>
    )

  return (
    <div>
      <PageHeader
        title="Inventarielista"
        subtitle="Allt som köpts in – var det köptes, vad det kostade och var det finns nu."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={!shown.length} loading={exporting}>
            {!exporting && <Download className="size-4" aria-hidden />} Exportera till Excel (CSV)
          </Button>
        }
      />

      <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-[2fr_1fr_1fr_1fr]">
        <Stat label="Inköpsvärde" value={kr(value)} sub={purchaseDiscounts ? `därtill −${kr(purchaseDiscounts)} rabatt på hela köp` : 'summan av produkterna'} className="col-span-2 sm:col-span-1" />
        <Stat label="Produkter" value={num(shown.length)} />
        <Stat label="I lager" value={num(countBy('in_stock'))} />
        <Stat label="Utlånat / förbrukat" value={`${num(countBy('lent'))} / ${num(countBy('used'))}`} className="col-span-2 sm:col-span-1" />
      </dl>

      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök produkt, märke, butik, plats …" className="ps-9" aria-label="Sök i inventarielistan" />
        </div>
        <Select value={committee} onChange={(e) => setCommittee(e.target.value)} aria-label="Kommitté">
          <option value="">Alla kommittéer</option>
          {auth.committees.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategori">
          <option value="">Alla kategorier</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Alla statusar</option>
          {(Object.keys(STATUS) as ItemStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS[s].label}
            </option>
          ))}
        </Select>
      </div>

      <ErrorText>{err}</ErrorText>

      {items.loading || purchases.loading ? (
        <Spinner />
      ) : items.error ? (
        <ErrorText>{items.error}</ErrorText>
      ) : shown.length === 0 ? (
        <Empty icon={<Package className="size-8 text-muted" aria-hidden />}>{rows.length ? 'Inget matchar filtret.' : 'Inventarielistan fylls på automatiskt när inköp registreras.'}</Empty>
      ) : (
        <>
          {/* Mobil: lista */}
          <ul className="divide-y divide-line border-y border-line sm:hidden">
            {shown.map((r) => {
              const link = webHref(r.link)
              const committee = committeeName(r.purchase?.committee_id)
              return (
                <li key={r.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-ink break-words">
                        {link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="underline decoration-ink/30 underline-offset-4">
                            {r.name}
                          </a>
                        ) : (
                          r.name
                        )}
                      </div>
                      {(r.brand || r.category) && <div className="text-sm text-muted">{[r.brand, r.category].filter(Boolean).join(' · ')}</div>}
                    </div>
                    <div className="shrink-0 text-end">
                      <div className="text-base font-semibold tabular-nums text-ink">{kr(lineTotal(r))}</div>
                      <div className="text-sm text-muted tabular-nums">
                        {num(r.quantity, 2)} {r.unit} × {kr(r.unit_price)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    {[r.purchase?.store_name, r.purchase?.purchased_on, committee].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
                    {storageCell(r)}
                    {statusCell(r)}
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Dator: tabell */}
          <div className="hidden overflow-x-auto border-y border-line sm:block">
            <table className="w-full text-base">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th className="py-2.5 pe-3 text-start font-medium">Produkt</th>
                  <th className="px-3 py-2.5 text-end font-medium">Antal</th>
                  <th className="px-3 py-2.5 text-start font-medium">Butik</th>
                  <th className="px-3 py-2.5 text-end font-medium">À-pris</th>
                  <th className="px-3 py-2.5 text-end font-medium">Summa</th>
                  <th className="px-3 py-2.5 text-start font-medium">Förvaring</th>
                  <th className="py-2.5 ps-3 text-start font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => {
                  const link = webHref(r.link)
                  const committee = committeeName(r.purchase?.committee_id)
                  return (
                    <tr key={r.id} className="align-middle">
                      <td className="py-2.5 pe-3">
                        <div className="font-medium text-ink">
                          {link ? (
                            <a href={link} target="_blank" rel="noopener noreferrer" className="underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                              {r.name}
                            </a>
                          ) : (
                            r.name
                          )}
                        </div>
                        {(r.brand || r.category) && <div className="text-sm text-muted">{[r.brand, r.category].filter(Boolean).join(' · ')}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-end tabular-nums">
                        {num(r.quantity, 2)} {r.unit}
                      </td>
                      <td className="px-3 py-2.5">
                        <div>{r.purchase?.store_name}</div>
                        <div className="text-sm text-muted">{[r.purchase?.purchased_on, committee].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-end tabular-nums">{kr(r.unit_price)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-end tabular-nums">
                        {kr(lineTotal(r))}
                        {r.discount > 0 && <div className="text-sm text-emerald-800">−{kr(r.discount)}</div>}
                      </td>
                      <td className="min-w-44 px-3 py-2.5">{storageCell(r)}</td>
                      <td className="py-2.5 ps-3">{statusCell(r)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

/** Nyckeltal utan ram – en rad med hårfina linjer i stället för fyra kort. */
function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={['min-w-0', className].filter(Boolean).join(' ')}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 text-2xl font-semibold text-ink tabular-nums">{value}</dd>
      {sub && <dd className="text-sm text-muted">{sub}</dd>}
    </div>
  )
}
