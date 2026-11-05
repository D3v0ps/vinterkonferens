import { Fragment } from 'react'
import { Clock } from 'lucide-react'
import { PageTitle, PostsList } from '../../components/Agenda'
import { Empty, Spinner, cx } from '../../components/ui'
import { useConference } from '../../lib/conference'
import { kr, tr } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { Tr, useI18n } from '../../lib/i18n'
import type { MenuCategory, MenuItem } from '../../lib/types'

const CATS: MenuCategory[] = ['food', 'coffee', 'drinks', 'snacks', 'dessert']

export default function Kitchen() {
  const { t, lang } = useI18n()
  const { settings } = useConference()
  const { data, loading } = useList('menu_items', { order: [{ col: 'sort' }] }, { pollMs: 60_000 })
  const label = (k: string) => (t as unknown as Record<string, string>)[k] ?? k
  const hours = tr(settings.kitchen_info, lang)
  return (
    <>
      <PageTitle title={t.kitchen} lead={t.kitchenLead} />
      {hours && (
        <div className="mb-8 flex gap-3 border-y border-line py-4">
          <Clock className="mt-1 size-5 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{t.openingHours}</h2>
            <p className="text-base whitespace-pre-line">
              <Tr value={settings.kitchen_info} />
            </p>
          </div>
        </div>
      )}
      <PostsList page="kitchen" />
      {loading ? (
        <Spinner />
      ) : !data.length ? (
        <Empty>{t.noMenu}</Empty>
      ) : (
        // Prislista: namn, prickad linje, pris. Slutsålt stryks över.
        <div className="max-w-xl space-y-9">
          {CATS.map((c) => {
            const items = data.filter((m) => m.category === c)
            if (!items.length) return null
            return (
              <section key={c}>
                <h2 className="border-b border-line pb-2 text-xl font-semibold text-ink">{label(`cat_${c}`)}</h2>
                <ul className="mt-1">
                  {items.map((m) => (
                    <PriceRow key={m.id} item={m} label={label} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

function PriceRow({ item: m, label }: { item: MenuItem; label: (k: string) => string }) {
  const { t, lang } = useI18n()
  const sold = !m.available
  const description = tr(m.description, lang)
  const hasPrice = m.price != null
  return (
    <li className="py-3">
      <div className="flex items-end gap-2">
        <span className={cx('min-w-0 text-lg leading-snug font-medium', sold ? 'text-muted line-through decoration-1' : 'text-ink')}>
          <Tr value={m.name} />
        </span>
        {(sold || hasPrice) && (
          <>
            <span className="mb-[0.45em] min-w-6 flex-1 border-b-2 border-dotted border-muted/35" aria-hidden />
            {sold ? (
              <span className="shrink-0 text-base font-medium text-muted">{t.soldOut}</span>
            ) : (
              <span className="shrink-0 text-lg font-semibold tabular-nums text-ink" dir="ltr">
                {kr(m.price)}
              </span>
            )}
          </>
        )}
      </div>
      {description && (
        <p className="mt-0.5 text-base text-muted">
          <Tr value={m.description} />
        </p>
      )}
      {!!m.tags.length && (
        <p className="mt-0.5 text-sm text-muted">
          {m.tags.map((tag, i) => (
            <Fragment key={tag}>
              {i > 0 && ' · '}
              <span className={tag === 'nuts' ? 'font-medium text-rose-800' : undefined}>{label(`tag_${tag}`)}</span>
            </Fragment>
          ))}
        </p>
      )}
    </li>
  )
}
