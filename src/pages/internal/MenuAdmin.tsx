import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Checkbox, Empty, ErrorText, Field, Input, LocalizedInput, Modal, PageHeader, Select, Spinner, cx } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { kr, tr } from '../../lib/format'
import { useList } from '../../lib/hooks'
import type { MenuCategory, MenuItem } from '../../lib/types'

const CATS: { value: MenuCategory; label: string }[] = [
  { value: 'food', label: 'Mat' },
  { value: 'coffee', label: 'Kaffe & te' },
  { value: 'drinks', label: 'Dryck' },
  { value: 'snacks', label: 'Fika' },
  { value: 'dessert', label: 'Efterrätt' },
]
const TAGS: { value: string; label: string }[] = [
  { value: 'vegetarian', label: 'Vegetarisk' },
  { value: 'vegan', label: 'Vegansk' },
  { value: 'halal', label: 'Halal' },
  { value: 'glutenfree', label: 'Glutenfri' },
  { value: 'lactosefree', label: 'Laktosfri' },
  { value: 'nuts', label: 'Innehåller nötter' },
]

type Form = Partial<MenuItem> & { priceText: string }

export default function MenuAdmin() {
  const auth = useAuth()
  const canEdit = auth.isAdmin || auth.isMemberOf('koket')
  const { data: items, loading } = useList('menu_items', { order: [{ col: 'sort' }] })
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const open = (it?: MenuItem, category: MenuCategory = 'food') => {
    setErr(null)
    setForm(
      it
        ? { ...it, priceText: it.price != null ? String(it.price) : '' }
        : { name: {}, description: {}, category, tags: [], available: true, sort: items.length, priceText: '' },
    )
  }

  async function save() {
    if (!form) return
    if (!form.name?.sv?.trim()) return setErr('Namn på svenska behövs.')
    setBusy(true)
    setErr(null)
    const { priceText, id, ...rest } = form
    const row: Partial<MenuItem> = { ...rest, price: priceText.trim() ? Number(priceText.replace(',', '.')) : null }
    delete row.created_at
    try {
      if (id) await api.update('menu_items', id, row)
      else await api.insert('menu_items', row)
      setForm(null)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function toggle(it: MenuItem) {
    await api.update('menu_items', it.id, { available: !it.available })
  }

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f))

  return (
    <div>
      <PageHeader
        title="Meny"
        subtitle="Visas under Köket på besökarsidan. Tryck på Finns/Slut när något tar slut."
        actions={
          canEdit && (
            <Button onClick={() => open()}>
              <Plus className="size-4" /> Ny rätt
            </Button>
          )
        }
      />
      {!canEdit && <p className="mb-4 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">Menyn ändras av Köket och styrgruppen.</p>}

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty>Menyn är tom.</Empty>
      ) : (
        <div className="space-y-6">
          {CATS.map((c) => {
            const list = items.filter((i) => i.category === c.value)
            if (!list.length) return null
            return (
              <section key={c.value}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{c.label}</h2>
                <div className="space-y-2">
                  {list.map((it) => (
                    <Card key={it.id} className={cx('flex items-center gap-3 p-3', !it.available && 'bg-slate-50')}>
                      <button
                        disabled={!canEdit}
                        onClick={() => toggle(it)}
                        className={cx(
                          'w-20 shrink-0 rounded-xl py-3 text-sm font-bold transition',
                          it.available ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white',
                          !canEdit && 'opacity-70',
                        )}
                        aria-pressed={!it.available}
                        title="Tryck för att växla"
                      >
                        {it.available ? 'Finns' : 'Slut'}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className={cx('font-medium', !it.available && 'text-slate-400 line-through')}>{tr(it.name, 'sv')}</div>
                        <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-slate-500">
                          <span className="font-semibold text-slate-700">{kr(it.price)}</span>
                          {it.tags.map((t) => (
                            <Badge key={t}>{TAGS.find((x) => x.value === t)?.label ?? t}</Badge>
                          ))}
                          {(!it.name.en || !it.name.ar) && <span className="text-amber-600">saknar {[!it.name.en && 'EN', !it.name.ar && 'AR'].filter(Boolean).join('/')}</span>}
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => open(it)} aria-label="Redigera">
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Ta bort"
                            onClick={() => confirm(`Ta bort "${tr(it.name, 'sv')}"?`) && api.remove('menu_items', it.id)}
                          >
                            <Trash2 className="size-4 text-rose-600" />
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Redigera rätt' : 'Ny rätt'}>
        {form && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <LocalizedInput label="Namn" required value={form.name ?? {}} onChange={(name) => set({ name })} />
            <LocalizedInput label="Beskrivning" value={form.description ?? {}} onChange={(description) => set({ description })} />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Kategori" className="col-span-3 sm:col-span-1">
                <Select value={form.category} onChange={(e) => set({ category: e.target.value as MenuCategory })}>
                  {CATS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Pris (kr)" className="col-span-2 sm:col-span-1">
                <Input inputMode="decimal" value={form.priceText} onChange={(e) => set({ priceText: e.target.value })} />
              </Field>
              <Field label="Ordning" className="col-span-1">
                <Input type="number" value={form.sort ?? 0} onChange={(e) => set({ sort: Number(e.target.value) })} />
              </Field>
            </div>
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">Märkning</span>
              <div className="grid grid-cols-2 gap-2">
                {TAGS.map((t) => (
                  <Checkbox
                    key={t.value}
                    label={t.label}
                    checked={!!form.tags?.includes(t.value)}
                    onChange={(on) => set({ tags: on ? [...(form.tags ?? []), t.value] : (form.tags ?? []).filter((x) => x !== t.value) })}
                  />
                ))}
              </div>
            </div>
            <Checkbox label="Finns att köpa just nu" checked={!!form.available} onChange={(available) => set({ available })} />
            <ErrorText>{err}</ErrorText>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Avbryt
              </Button>
              <Button type="submit" loading={busy}>
                Spara
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
