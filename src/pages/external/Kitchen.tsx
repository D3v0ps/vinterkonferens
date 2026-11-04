import { Clock } from 'lucide-react'
import { PostsList } from '../../components/Agenda'
import { Badge, Card, Empty, Spinner, cx } from '../../components/ui'
import { useConference } from '../../lib/conference'
import { kr, tr } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { useI18n } from '../../lib/i18n'
import type { MenuCategory } from '../../lib/types'

const CATS: MenuCategory[] = ['food', 'coffee', 'drinks', 'snacks', 'dessert']

export default function Kitchen() {
  const { t, lang } = useI18n()
  const { settings } = useConference()
  const { data, loading } = useList('menu_items', { order: [{ col: 'sort' }] }, { pollMs: 60_000 })
  const label = (k: string) => (t as unknown as Record<string, string>)[k] ?? k
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t.kitchen}</h1>
      <p className="mb-4 text-sm text-slate-600">{t.kitchenLead}</p>
      {tr(settings.kitchen_info, lang) && (
        <Card className="mb-5 flex items-start gap-3 bg-accent-soft p-4">
          <Clock className="mt-0.5 size-5 shrink-0 text-accent" />
          <div>
            <div className="text-sm font-semibold text-ink">{t.openingHours}</div>
            <p className="whitespace-pre-line text-sm text-slate-700">{tr(settings.kitchen_info, lang)}</p>
          </div>
        </Card>
      )}
      <PostsList page="kitchen" />
      {loading ? (
        <Spinner />
      ) : !data.length ? (
        <Empty>{t.menu}: –</Empty>
      ) : (
        <div className="space-y-6">
          {CATS.map((c) => {
            const items = data.filter((m) => m.category === c)
            if (!items.length) return null
            return (
              <section key={c}>
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{label(`cat_${c}`)}</h2>
                <Card className="divide-y divide-slate-100">
                  {items.map((m) => (
                    <div key={m.id} className={cx('flex items-start justify-between gap-3 px-4 py-3', !m.available && 'opacity-55')}>
                      <div className="min-w-0">
                        <div className={cx('font-medium text-slate-900', !m.available && 'line-through')}>{tr(m.name, lang)}</div>
                        {tr(m.description, lang) && <div className="text-sm text-slate-500">{tr(m.description, lang)}</div>}
                        {!!m.tags.length && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {m.tags.map((tag) => (
                              <Badge key={tag} tone={tag === 'nuts' ? 'red' : 'green'}>
                                {label(`tag_${tag}`)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-end">
                        {m.available ? <span className="font-semibold tabular-nums text-ink" dir="ltr">{m.price != null ? kr(m.price) : ''}</span> : <Badge tone="red">{t.soldOut}</Badge>}
                      </div>
                    </div>
                  ))}
                </Card>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
