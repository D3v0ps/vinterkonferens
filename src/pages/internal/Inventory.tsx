import { useMemo, useState } from 'react'
import { Download, Package, Search } from 'lucide-react'
import { Badge, Button, Card, Empty, ErrorText, Input, PageHeader, Select, Spinner, StatTile } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { downloadCsv, kr, num } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { todayStr } from '../../lib/time'
import type { ItemStatus, Purchase, PurchaseItem } from '../../lib/types'
import { lineTotal, useCanEditPurchase } from './Purchases'

const STATUS: Record<ItemStatus, { label: string; tone: 'green' | 'slate' | 'amber' | 'blue' }> = {
  in_stock: { label: 'I lager', tone: 'green' },
  used: { label: 'Förbrukad', tone: 'slate' },
  returned: { label: 'Returnerad', tone: 'amber' },
  lent: { label: 'Utlånad', tone: 'blue' },
}

type Row = PurchaseItem & { purchase: Purchase | undefined }

export default function Inventory() {
  const auth = useAuth()
  const canEdit = useCanEditPurchase()
  const items = useList('purchase_items', { order: [{ col: 'name' }] })
  const purchases = useList('purchases')
  const [q, setQ] = useState('')
  const [committee, setCommittee] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [err, setErr] = useState<string | null>(null)

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

  function exportCsv() {
    downloadCsv(
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
  }

  const editable = (r: Row) => !!r.purchase && canEdit(r.purchase)

  const statusCell = (r: Row) =>
    editable(r) ? (
      <Select value={r.status} onChange={(e) => patch(r, { status: e.target.value as ItemStatus })} className="w-auto py-1.5 text-sm" aria-label="Status">
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
    editable(r) ? (
      <Input
        key={r.storage_location ?? ''}
        defaultValue={r.storage_location ?? ''}
        placeholder="Var finns den?"
        className="py-1.5 text-sm"
        onBlur={(e) => {
          const v = e.target.value.trim() || null
          if (v !== (r.storage_location ?? null)) patch(r, { storage_location: v })
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    ) : (
      <span className="text-slate-600">{r.storage_location ?? '–'}</span>
    )

  return (
    <div>
      <PageHeader
        title="Inventarielista"
        subtitle="Allt som köpts in – var det köptes, vad det kostade och var det finns nu."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={!shown.length}>
            <Download className="size-4" /> Exportera till Excel (CSV)
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Inköpsvärde" value={kr(value)} sub={purchaseDiscounts ? `därtill −${kr(purchaseDiscounts)} rabatt på hela köp` : 'summa av raderna'} />
        <StatTile label="Rader" value={num(shown.length)} />
        <StatTile label="I lager" value={num(countBy('in_stock'))} />
        <StatTile label="Utlånat / förbrukat" value={`${num(countBy('lent'))} / ${num(countBy('used'))}`} />
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök produkt, märke, butik, plats …" className="ps-9" />
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
        <Empty icon={<Package className="size-8 text-slate-400" />}>{rows.length ? 'Inget matchar filtret.' : 'Inventarielistan fylls på automatiskt när inköp registreras.'}</Empty>
      ) : (
        <>
          {/* Mobil: kort */}
          <div className="space-y-2 sm:hidden">
            {shown.map((r) => (
              <Card key={r.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-ink">{r.name}</div>
                    <div className="text-xs text-slate-500">
                      {[r.brand, r.category].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <div className="font-semibold tabular-nums">{kr(lineTotal(r))}</div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {num(r.quantity, 2)} {r.unit} × {kr(r.unit_price)}
                    </div>
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {r.purchase?.store_name} · {r.purchase?.purchased_on}
                  {committeeName(r.purchase?.committee_id) && ` · ${committeeName(r.purchase?.committee_id)}`}
                </div>
                <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
                  {storageCell(r)}
                  {statusCell(r)}
                </div>
              </Card>
            ))}
          </div>

          {/* Dator: tabell */}
          <Card className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">Produkt</th>
                  <th className="px-3 py-2 text-end font-medium">Antal</th>
                  <th className="px-3 py-2 text-start font-medium">Butik</th>
                  <th className="px-3 py-2 text-end font-medium">À-pris</th>
                  <th className="px-3 py-2 text-end font-medium">Summa</th>
                  <th className="px-3 py-2 text-start font-medium">Förvaring</th>
                  <th className="px-3 py-2 text-start font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.id} className="align-middle">
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink">
                        {r.link ? (
                          <a href={r.link} target="_blank" rel="noreferrer" className="underline decoration-slate-300">
                            {r.name}
                          </a>
                        ) : (
                          r.name
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{[r.brand, r.category].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-end tabular-nums">
                      {num(r.quantity, 2)} {r.unit}
                    </td>
                    <td className="px-3 py-2">
                      <div>{r.purchase?.store_name}</div>
                      <div className="text-xs text-slate-500">
                        {r.purchase?.purchased_on}
                        {committeeName(r.purchase?.committee_id) && ` · ${committeeName(r.purchase?.committee_id)}`}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-end tabular-nums">{kr(r.unit_price)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-end tabular-nums">
                      {kr(lineTotal(r))}
                      {r.discount > 0 && <div className="text-xs text-emerald-700">−{kr(r.discount)}</div>}
                    </td>
                    <td className="min-w-40 px-3 py-2">
                      {storageCell(r)}
                    </td>
                    <td className="px-3 py-2">
                      {statusCell(r)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}
