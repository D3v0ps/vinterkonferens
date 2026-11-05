import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { confirmDialog, notify } from '../../components/dialogs'
import { Button, Checkbox, Empty, ErrorText, Field, Input, LocalizedInput, Modal, PageHeader, Select, Spinner, cx } from '../../components/ui'
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

/** "25", "25,50", "25 kr", "1 500" → tal. null = tomt, undefined = ogiltigt. */
function parseAmount(v: string): number | null | undefined {
  const t = v.replace(/\s|kr|:-/gi, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** 25 → "25", 25.5 → "25,50" (som i listan). Fler decimaler lämnas orörda så att priset inte ändras vid Spara. */
function priceText(n: number | null | undefined): string {
  if (n == null) return ''
  const s = Number.isInteger(n) || Number(n.toFixed(2)) !== n ? String(n) : n.toFixed(2)
  return s.replace('.', ',')
}

// ---------------------------------------------------------------- Exempelmeny
// Några rätter så att köket kan se hur menyn och "Slut" ser ut för besökarna. Namnen börjar med
// "Exempel:" så att de känns igen och tas bort med en knapp. Beskrivningarna är vanlig besökartext.

const EXAMPLE_PREFIX = 'Exempel:'
const isExample = (it: MenuItem) => (it.name?.sv ?? '').trim().startsWith(EXAMPLE_PREFIX)

const EXAMPLE_MENU: Pick<MenuItem, 'name' | 'description' | 'category' | 'price' | 'tags'>[] = [
  {
    name: { sv: 'Exempel: Linsgryta med ris', en: 'Example: Lentil stew with rice', ar: 'مثال: يخنة العدس مع الأرز' },
    description: {
      sv: 'Mild gryta med röda linser och kokosmjölk, serveras med ris.',
      en: 'Mild stew with red lentils and coconut milk, served with rice.',
      ar: 'يخنة خفيفة من العدس الأحمر وحليب جوز الهند، تُقدَّم مع الأرز.',
    },
    category: 'food',
    price: 60,
    tags: ['vegan', 'glutenfree', 'halal'],
  },
  {
    name: { sv: 'Exempel: Kycklingwrap', en: 'Example: Chicken wrap', ar: 'مثال: لفافة دجاج' },
    description: {
      sv: 'Grillad kyckling, sallad och vitlökssås i tunnbröd.',
      en: 'Grilled chicken, salad and garlic sauce in a flatbread.',
      ar: 'دجاج مشوي وسلطة وصلصة الثوم في خبز رقيق.',
    },
    category: 'food',
    price: 55,
    tags: ['halal'],
  },
  {
    name: { sv: 'Exempel: Kaffe', en: 'Example: Coffee', ar: 'مثال: قهوة' },
    description: { sv: 'Bryggkaffe. Påtår ingår.', en: 'Filter coffee. Refills are free.', ar: 'قهوة مفلترة. إعادة التعبئة مجانية.' },
    category: 'coffee',
    price: 15,
    tags: ['vegan'],
  },
  {
    name: { sv: 'Exempel: Te', en: 'Example: Tea', ar: 'مثال: شاي' },
    description: { sv: 'Svart te eller myntate.', en: 'Black tea or mint tea.', ar: 'شاي أسود أو شاي بالنعناع.' },
    category: 'coffee',
    price: 10,
    tags: ['vegan'],
  },
  {
    name: { sv: 'Exempel: Saft', en: 'Example: Cordial', ar: 'مثال: عصير' },
    description: { sv: 'Hallon- eller fläderblomssaft.', en: 'Raspberry or elderflower cordial.', ar: 'عصير التوت أو زهر البيلسان.' },
    category: 'drinks',
    price: 10,
    tags: ['vegan'],
  },
  {
    name: { sv: 'Exempel: Kanelbulle', en: 'Example: Cinnamon bun', ar: 'مثال: كعكة القرفة' },
    description: { sv: 'Nybakad i vårt eget kök.', en: 'Freshly baked in our own kitchen.', ar: 'مخبوزة طازجة في مطبخنا.' },
    category: 'snacks',
    price: 20,
    tags: ['vegetarian'],
  },
]

export default function MenuAdmin() {
  const auth = useAuth()
  const canEdit = auth.isAdmin || auth.isMemberOf('koket')
  const { data: items, loading } = useList('menu_items', { order: [{ col: 'sort' }] })
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [exBusy, setExBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const examples = useMemo(() => items.filter(isExample), [items])

  const open = (it?: MenuItem, category: MenuCategory = 'food') => {
    setErr(null)
    setForm(
      it
        ? { ...it, priceText: priceText(it.price) }
        : { name: {}, description: {}, category, tags: [], available: true, sort: items.length, priceText: '' },
    )
  }

  async function save() {
    if (!form) return
    if (!form.name?.sv?.trim()) return setErr('Skriv ett namn på svenska.')
    const { priceText, id, ...rest } = form
    const price = parseAmount(priceText)
    if (price === undefined) return setErr('Skriv priset i kronor, t.ex. 25 eller 25,50.')
    setBusy(true)
    setErr(null)
    const row: Partial<MenuItem> = { ...rest, price }
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

  async function remove() {
    if (!form?.id) return
    const ok = await confirmDialog({
      title: `Ta bort "${form.name?.sv?.trim() || 'rätten'}"?`,
      message: 'Rätten försvinner från menyn på besökarsidan.',
      confirmLabel: 'Ta bort',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    setErr(null)
    try {
      await api.remove('menu_items', form.id)
      setForm(null)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const [busyId, setBusyId] = useState<string | null>(null)
  async function toggle(it: MenuItem) {
    setBusyId(it.id)
    try {
      await api.update('menu_items', it.id, { available: !it.available })
    } catch (e) {
      notify(`Kunde inte ändra ${tr(it.name, 'sv')}: ${(e as Error).message}`, 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function addExamples() {
    const ok = await confirmDialog({
      title: 'Lägga in exempelmeny?',
      message: `${EXAMPLE_MENU.length} rätter läggs in: mat, kaffe, te, dryck och fika. De syns under Köket på besökarsidan med "Exempel:" först i namnet och tas bort med en knapp här.`,
      confirmLabel: 'Lägg in',
    })
    if (!ok) return
    setExBusy(true)
    try {
      await api.insertMany(
        'menu_items',
        EXAMPLE_MENU.map((x, i) => ({ ...x, available: true, sort: i })),
      )
      notify('Exempelmenyn är inlagd')
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setExBusy(false)
    }
  }

  async function removeExamples() {
    const ok = await confirmDialog({
      title: `Ta bort ${examples.length} exempelrätter?`,
      message: 'Bara rätter vars namn börjar med "Exempel:" tas bort. Resten av menyn lämnas kvar.',
      confirmLabel: 'Ta bort exemplen',
      danger: true,
    })
    if (!ok) return
    setExBusy(true)
    try {
      for (const it of examples) await api.remove('menu_items', it.id)
      notify('Exempelmenyn är borttagen')
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setExBusy(false)
    }
  }

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f))

  return (
    <div>
      <PageHeader
        title="Meny"
        subtitle="Visas under Köket på besökarsidan. Bocka i Slut när något tar slut, så syns det direkt för besökarna."
        actions={
          canEdit && (
            <Button onClick={() => open()}>
              <Plus className="size-4" aria-hidden /> Ny rätt
            </Button>
          )
        }
      />
      {!canEdit && <p className="mb-4 text-base text-muted">Menyn ändras av Köket och styrgruppen.</p>}

      {canEdit && examples.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-ice px-4 py-3">
          <p className="text-base text-ink">Exempelmenyn ligger inne och syns på besökarsidan.</p>
          <Button variant="ghost" className="text-rose-700" loading={exBusy} onClick={removeExamples}>
            <Trash2 className="size-4" aria-hidden /> Ta bort exemplen
          </Button>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="space-y-8">
          <Empty>Menyn är tom.</Empty>
          {canEdit && (
            <section className="max-w-[65ch]">
              <h2 className="text-lg font-semibold text-ink">Vill du se hur menyn ser ut först?</h2>
              <p className="mt-1 text-base text-muted">Lägg in några exempelrätter och prova att markera något som slut.</p>
              <Button variant="secondary" className="mt-3" loading={exBusy} onClick={addExamples}>
                Lägg in exempelmeny
              </Button>
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-10">
          {CATS.map((c) => {
            const list = items.filter((i) => i.category === c.value)
            if (!list.length) return null
            return (
              <section key={c.value}>
                <h2 className="mb-2 text-xl font-semibold text-ink">{c.label}</h2>
                <ul className="divide-y divide-line border-y border-line">
                  {list.map((it) => {
                    const name = tr(it.name, 'sv')
                    const tags = it.tags.map((t) => TAGS.find((x) => x.value === t)?.label ?? t)
                    const missing = [!it.name.en?.trim() && 'engelska', !it.name.ar?.trim() && 'arabiska'].filter(Boolean)
                    return (
                      <li key={it.id} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-3">
                            <span className={cx('text-base font-medium', it.available ? 'text-ink' : 'text-muted line-through')}>{name}</span>
                            {it.price != null && (
                              <span className={cx('text-base tabular-nums', it.available ? 'text-ink' : 'text-muted')}>{kr(it.price)}</span>
                            )}
                          </div>
                          {tags.length > 0 && <p className="text-sm text-muted">{tags.join(', ')}</p>}
                          {missing.length > 0 && <p className="text-sm text-muted">Namnet saknas på {missing.join(' och ')}.</p>}
                        </div>
                        {canEdit ? (
                          <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-base text-ink">
                            <input
                              type="checkbox"
                              className="size-5 rounded accent-ink"
                              checked={!it.available}
                              disabled={busyId === it.id}
                              onChange={() => toggle(it)}
                              aria-label={`Markera ${name} som slut`}
                            />
                            <span aria-hidden className={it.available ? 'text-muted' : 'font-semibold text-ink'}>
                              Slut
                            </span>
                          </label>
                        ) : (
                          !it.available && <span className="shrink-0 text-base font-semibold text-ink">Slut</span>
                        )}
                        {canEdit && (
                          <Button variant="ghost" className="shrink-0 text-muted hover:text-ink" onClick={() => open(it)} aria-label={`Redigera ${name}`}>
                            <Pencil className="size-4" aria-hidden />
                            <span className="hidden sm:inline">Redigera</span>
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Redigera rätt' : 'Ny rätt'} persistent>
        {form && (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <LocalizedInput label="Namn" required value={form.name ?? {}} onChange={(name) => set({ name })} />
            <LocalizedInput label="Beskrivning (valfritt)" value={form.description ?? {}} onChange={(description) => set({ description })} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Kategori">
                <Select value={form.category} onChange={(e) => set({ category: e.target.value as MenuCategory })}>
                  {CATS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Pris i kronor (valfritt)" hint="Till exempel 25 eller 25,50. Lämna tomt om inget pris ska visas.">
                <Input inputMode="decimal" value={form.priceText} onChange={(e) => set({ priceText: e.target.value })} aria-invalid={!!err && err.startsWith('Skriv priset')} />
              </Field>
              <Field label="Ordning" hint="Lägre tal visas först i sin kategori.">
                <Input type="number" inputMode="numeric" value={form.sort ?? 0} onChange={(e) => set({ sort: Number(e.target.value) })} />
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1 block text-base font-medium text-slate-800">Märkning (valfritt)</legend>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {TAGS.map((t) => (
                  <Checkbox
                    key={t.value}
                    label={t.label}
                    checked={!!form.tags?.includes(t.value)}
                    onChange={(on) => set({ tags: on ? [...(form.tags ?? []), t.value] : (form.tags ?? []).filter((x) => x !== t.value) })}
                  />
                ))}
              </div>
            </fieldset>
            <Checkbox label="Slut just nu" checked={!form.available} onChange={(out) => set({ available: !out })} />
            <ErrorText>{err}</ErrorText>
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {form.id && (
                <Button type="button" variant="ghost" className="text-rose-700" disabled={busy} onClick={remove}>
                  <Trash2 className="size-4" aria-hidden /> Ta bort
                </Button>
              )}
              <div className="ms-auto flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                  Avbryt
                </Button>
                <Button type="submit" loading={busy}>
                  Spara
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
