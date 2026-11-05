import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Download, Package } from 'lucide-react'
import { notify } from '../../components/dialogs'
import { Button, Empty, ErrorText, Input, PageHeader, Select, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { downloadCsv, kr, num } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { formatShortDate, todayStr } from '../../lib/time'
import type { ItemStatus, Purchase, PurchaseItem } from '../../lib/types'
import { FILTER_MIN, FilterCount, FilterDetails, Question, SearchField } from './Notes'
import { lineTotal, webHref } from './Purchases'

const STATUS: Record<ItemStatus, { label: string }> = {
  in_stock: { label: 'I lager' },
  used: { label: 'Förbrukad' },
  returned: { label: 'Returnerad' },
  lent: { label: 'Utlånad' },
}

type Row = PurchaseItem & { purchase: Purchase | undefined }

/** Kronor med högst två decimaler – annars hamnar flyttalsbrus som 69,69999999999999 i Excel. */
const round2 = (n: number) => Math.round(n * 100) / 100

export default function Inventory() {
  const auth = useAuth()
  const items = useList('purchase_items', { order: [{ col: 'name' }] })
  const purchases = useList('purchases')
  const [q, setQ] = useState('')
  const [committee, setCommittee] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [exporting, setExporting] = useState(false)

  const rows: Row[] = useMemo(() => {
    const pm = new Map(purchases.data.map((p) => [p.id, p]))
    return items.data.map((i) => ({ ...i, purchase: pm.get(i.purchase_id) }))
  }, [items.data, purchases.data])

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'sv')), [rows])

  // Sök och filter bara när listan är lång; annars gäller de inte (så att inget göms utan att synas)
  const filtering = rows.length > FILTER_MIN
  const active = filtering ? [committee, category, status].filter(Boolean).length : 0
  const shown = useMemo(() => {
    if (!filtering) return rows
    const s = q.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (!committee || r.purchase?.committee_id === committee) &&
        (!category || r.category === category) &&
        (!status || r.status === status) &&
        (!s || [r.name, r.brand, r.purchase?.store_name, r.storage_location, r.category].some((x) => x?.toLowerCase().includes(s))),
    )
  }, [rows, filtering, q, committee, category, status])
  const narrowed = filtering && (active > 0 || !!q.trim())
  const resetFilters = () => {
    setQ('')
    setCommittee('')
    setCategory('')
    setStatus('')
  }

  const value = shown.reduce((s, r) => s + lineTotal(r), 0)
  const purchaseDiscounts = [...new Set(shown.map((r) => r.purchase).filter(Boolean) as Purchase[])].reduce((s, p) => s + (p.discount_total || 0), 0)
  const countBy = (st: ItemStatus) => shown.filter((r) => r.status === st).length
  const summary = [
    `${num(shown.length)} ${shown.length === 1 ? 'produkt' : 'produkter'}`,
    kr(value),
    `${num(countBy('in_stock'))} i lager`,
    countBy('lent') > 0 && `${num(countBy('lent'))} ${countBy('lent') === 1 ? 'utlånad' : 'utlånade'}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const committeeName = (id: string | null | undefined) => auth.committees.find((c) => c.id === id)?.name ?? ''

  /** Sparar en ändring. Ger felmeddelandet om det inte gick, så att det kan visas vid fältet. */
  async function patch(r: Row, p: Partial<PurchaseItem>): Promise<string | null> {
    try {
      await api.update('purchase_items', r.id, p)
      return null
    } catch (e) {
      return (e as Error).message || 'Okänt fel.'
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
          round2(lineTotal(r)),
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
      <StatusSelect name={r.name} value={r.status} onSave={(v) => patch(r, { status: v })} />
    ) : (
      <span className="text-muted">{STATUS[r.status]?.label ?? r.status}</span>
    )

  const storageCell = (r: Row, labelled = false) =>
    editable ? (
      <StorageEdit name={r.name} value={r.storage_location} labelled={labelled} onSave={(v) => patch(r, { storage_location: v })} />
    ) : (
      <StorageText value={r.storage_location} labelled={labelled} />
    )

  return (
    <div>
      <PageHeader
        title="Inventarielista"
        subtitle="Allt som köpts in – var det köptes, vad det kostade och var det finns nu."
      />

      {rows.length > 0 && (
        <>
          {/* Telefon: en rad i stället för fyra nyckeltal */}
          <p className="mb-4 text-base text-muted sm:hidden">{summary}</p>
          <dl className="mb-6 hidden grid-cols-[2fr_1fr_1fr_1fr] gap-x-6 border-y border-line py-4 sm:grid">
            <Stat label="Inköpsvärde" value={kr(value)} sub={purchaseDiscounts ? `därtill −${kr(purchaseDiscounts)} rabatt på hela köp` : 'summan av produkterna'} />
            <Stat label="Produkter" value={num(shown.length)} />
            <Stat label="I lager" value={num(countBy('in_stock'))} />
            <Stat label="Utlånat / förbrukat" value={`${num(countBy('lent'))} / ${num(countBy('used'))}`} />
          </dl>
        </>
      )}

      {filtering && (
        <div className="mb-4 space-y-1">
          <SearchField value={q} onChange={setQ} label="Sök i inventarielistan" placeholder="Sök produkt, märke, butik, plats …" />
          <FilterDetails active={active}>
            <Question label="Kommitté">
              <Select value={committee} onChange={(e) => setCommittee(e.target.value)}>
                <option value="">Alla kommittéer</option>
                {auth.committees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Question>
            <Question label="Kategori">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Alla kategorier</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Question>
            <Question label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Alla statusar</option>
                {(Object.keys(STATUS) as ItemStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS[s].label}
                  </option>
                ))}
              </Select>
            </Question>
          </FilterDetails>
          {narrowed && shown.length > 0 && <FilterCount shown={shown.length} total={rows.length} onReset={resetFilters} />}
        </div>
      )}

      {items.loading || purchases.loading ? (
        <Spinner />
      ) : items.error ? (
        <ErrorText>{items.error}</ErrorText>
      ) : shown.length === 0 ? (
        <Empty icon={<Package className="size-8 text-muted" aria-hidden />}>
          {rows.length ? (
            <>
              Inget matchar sökningen.
              <button type="button" onClick={resetFilters} className={linkCls}>
                Visa alla
              </button>
            </>
          ) : (
            'Inventarielistan fylls på automatiskt när inköp registreras.'
          )}
        </Empty>
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
                          <a href={link} target="_blank" rel="noopener noreferrer" className="-my-2.5 inline-block min-w-11 py-2.5 underline decoration-ink/30 underline-offset-4">
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
                        {num(r.quantity, 3)} {r.unit} × {kr(r.unit_price)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    {[r.purchase?.store_name, r.purchase?.purchased_on && formatShortDate(r.purchase.purchased_on), committee].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-2">{storageCell(r, true)}</div>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-base text-muted">Status</span>
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
                            <a href={link} target="_blank" rel="noopener noreferrer" className="-my-2.5 inline-block min-w-11 py-2.5 underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                              {r.name}
                            </a>
                          ) : (
                            r.name
                          )}
                        </div>
                        {(r.brand || r.category) && <div className="text-sm text-muted">{[r.brand, r.category].filter(Boolean).join(' · ')}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-end tabular-nums">
                        {num(r.quantity, 3)} {r.unit}
                      </td>
                      <td className="px-3 py-2.5">
                        <div>{r.purchase?.store_name}</div>
                        <div className="text-sm text-muted">{[r.purchase?.purchased_on && formatShortDate(r.purchase.purchased_on), committee].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-end tabular-nums">{kr(r.unit_price)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-end tabular-nums">
                        {kr(lineTotal(r))}
                        {r.discount > 0 && <div className="text-sm text-emerald-800">−{kr(r.discount)}</div>}
                      </td>
                      <td className="min-w-52 px-3 py-2.5">{storageCell(r)}</td>
                      <td className="py-2.5 ps-3">{statusCell(r)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {shown.length > 0 && (
        <div className="mt-8 border-t border-line pt-4">
          <button type="button" className="inline-flex min-h-11 items-center gap-2 text-base text-ink underline underline-offset-4 hover:text-ink-soft disabled:opacity-50" onClick={exportCsv} disabled={exporting}>
            <Download className="size-4" aria-hidden /> {exporting ? 'Sparar …' : 'Ladda ner listan för Excel (CSV)'}
          </button>
        </div>
      )}
    </div>
  )
}

/** Nyckeltal utan ram – en rad med hårfina linjer i stället för fyra kort. */
function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={['min-w-0', className].filter(Boolean).join(' ')}>
      <dt className="text-base text-muted">{label}</dt>
      <dd className="mt-0.5 text-2xl font-semibold text-ink tabular-nums">{value}</dd>
      {sub && <dd className="text-sm text-muted">{sub}</dd>}
    </div>
  )
}

const linkCls = 'inline-flex min-h-11 items-center text-base font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink'

/** Förvaringsplatsen som text; `labelled` sätter "Förvaring:" framför (i listan på telefon, där kolumnrubriken saknas). */
function StorageText({ value, labelled }: { value: string | null; labelled?: boolean }) {
  if (labelled)
    return (
      <span className="min-w-0 break-words">
        <span className="text-muted">Förvaring: </span>
        {value ? <span className="text-ink">{value}</span> : <span className="text-muted">ingen plats angiven</span>}
      </span>
    )
  return <span className={value ? 'min-w-0 break-words text-ink' : 'text-muted'}>{value ?? 'Ingen plats angiven'}</span>
}

/** Felet står direkt vid fältet (som i GOV.UK), med role=alert så att skärmläsare läser upp det. */
function FieldError({ id, children }: { id: string; children: string | null }) {
  if (!children) return null
  return (
    <p id={id} role="alert" className="text-base font-medium text-rose-700">
      {children}
    </p>
  )
}

/** Rullar fram fältet med felet och knapparna om något hamnat utanför skärmen (t.ex. när felet trycker ner dem). */
function useReveal(ref: React.RefObject<HTMLElement | null>, err: string | null) {
  useEffect(() => {
    if (err) ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [ref, err])
}

/** Statusen sparas direkt när man väljer; går det inte står felet under och den gamla statusen ligger kvar. */
function StatusSelect({ name, value, onSave }: { name: string; value: ItemStatus; onSave: (v: ItemStatus) => Promise<string | null> }) {
  const errId = useId()
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useReveal(box, err)
  async function change(v: ItemStatus) {
    setErr(null)
    setBusy(true)
    const e = await onSave(v)
    setBusy(false)
    if (e) setErr(`Statusen kunde inte sparas. ${e}`)
  }
  return (
    <div ref={box} className="scroll-mt-28 scroll-mb-4 space-y-1">
      <Select
        value={value}
        onChange={(e) => change(e.target.value as ItemStatus)}
        aria-busy={busy || undefined}
        className={`w-auto${err ? ' border-rose-600' : ''}`}
        aria-label={`Status för ${name}`}
        aria-invalid={err ? true : undefined}
        aria-describedby={err ? errId : undefined}
      >
        {(Object.keys(STATUS) as ItemStatus[]).map((s) => (
          <option key={s} value={s}>
            {STATUS[s].label}
          </option>
        ))}
      </Select>
      <FieldError id={errId}>{err}</FieldError>
    </div>
  )
}

/** Förvaringsplatsen som text med "Ändra" – fältet visas först när man vill ändra. */
function StorageEdit({ name, value, labelled, onSave }: { name: string; value: string | null; labelled?: boolean; onSave: (v: string | null) => Promise<string | null> }) {
  const id = useId()
  const errId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const returnFocus = useRef(false)
  useReveal(form, err)

  useEffect(() => {
    if (editing) input.current?.focus()
    else if (returnFocus.current) {
      returnFocus.current = false
      button.current?.focus()
    }
  }, [editing])

  function close() {
    returnFocus.current = true
    setErr(null)
    setEditing(false)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const v = draft.trim() || null
    if (v === (value ?? null)) return close()
    setErr(null)
    setBusy(true)
    const fail = await onSave(v)
    setBusy(false)
    // Gick det inte att spara står felet vid fältet, som ligger kvar med det man skrev
    if (fail) {
      setErr(`Förvaringsplatsen kunde inte sparas. ${fail}`)
      input.current?.focus({ preventScroll: true })
    } else close()
  }

  if (!editing)
    return (
      <div className="flex min-w-0 items-center justify-between gap-3">
        <StorageText value={value} labelled={labelled} />
        <button
          ref={button}
          type="button"
          className={`${linkCls} shrink-0`}
          onClick={() => {
            setDraft(value ?? '')
            setEditing(true)
          }}
        >
          Ändra<span className="sr-only"> förvaringsplats för {name}</span>
        </button>
      </div>
    )

  return (
    <form ref={form} onSubmit={save} className="scroll-mt-28 scroll-mb-4 space-y-2" noValidate>
      <label htmlFor={id} className="block text-base font-medium text-ink">
        Förvaringsplats
      </label>
      <FieldError id={errId}>{err}</FieldError>
      <Input
        ref={input}
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-invalid={err ? true : undefined}
        aria-describedby={err ? errId : undefined}
        className={err ? 'border-rose-600' : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            close()
          }
        }}
        autoComplete="off"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>
          Spara
        </Button>
        <Button type="button" variant="ghost" onClick={close} disabled={busy}>
          Avbryt
        </Button>
      </div>
    </form>
  )
}
