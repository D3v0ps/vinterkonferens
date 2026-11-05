import { Eye } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useList } from '../lib/hooks'

/** Låter en admin se sidan som en viss volontär, för att kontrollera vad olika roller ser. */
export default function ViewAsControl() {
  const auth = useAuth()
  const { data } = useList('volunteers', { order: [{ col: 'full_name' }] })
  const people = [...new Map(data.filter((v) => v.email).map((v) => [v.email!, v])).values()]
  if (!people.length) return null
  return (
    <label className="block px-3 py-2">
      <span className="mb-1 flex items-center gap-2 text-sm text-white/70">
        <Eye className="size-4" aria-hidden /> Visa som
      </span>
      <select
        className="min-h-11 w-full rounded-lg border border-white/20 bg-ink-soft px-2 text-base text-white"
        value={auth.viewAs ?? ''}
        onChange={(e) => auth.setViewAs(e.target.value || null)}
      >
        <option value="">Mig själv</option>
        {people.map((v) => (
          <option key={v.email} value={v.email!}>
            {v.full_name}
          </option>
        ))}
      </select>
    </label>
  )
}
