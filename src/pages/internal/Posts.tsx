import { useEffect, useMemo, useState } from 'react'
import { Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth, useAuthorFields } from '../../lib/auth'
import { tr } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { formatDateTime } from '../../lib/time'
import type { Localized, Post, PostAudience, PostPage } from '../../lib/types'
import { Badge, Button, Card, Checkbox, Empty, ErrorText, Field, LocalizedInput, Modal, PageHeader, Select, Spinner, Tabs } from '../../components/ui'

export const PAGE_LABEL: Record<PostPage, string> = {
  home: 'Startsidan',
  program: 'Vuxna & ungdomar',
  kids: 'Barn',
  kitchen: 'Köket',
}

type Draft = {
  id?: string
  audience: PostAudience
  page: PostPage
  committee_id: string | null
  title: Localized
  body: Localized
  pinned: boolean
  published: boolean
}

export function PostEditor({
  open,
  onClose,
  post,
  defaultCommitteeId = null,
  defaultAudience = 'internal',
}: {
  open: boolean
  onClose: () => void
  post?: Post | null
  defaultCommitteeId?: string | null
  defaultAudience?: PostAudience
}) {
  const auth = useAuth()
  const author = useAuthorFields()
  const allowed = auth.isAdmin ? auth.committees : auth.committees.filter((c) => auth.isLead(c.id))
  const pickCommittee = (id: string | null) => (auth.isAdmin || allowed.some((c) => c.id === id) ? id : (allowed[0]?.id ?? null))

  const blank = (): Draft => ({
    audience: defaultAudience,
    page: 'home',
    committee_id: pickCommittee(defaultCommitteeId),
    title: {},
    body: {},
    pinned: false,
    published: true,
  })
  const [d, setD] = useState<Draft>(blank)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setErr(null)
    setD(
      post
        ? { id: post.id, audience: post.audience, page: post.page, committee_id: post.committee_id, title: post.title, body: post.body, pinned: post.pinned, published: post.published }
        : blank(),
    )
  }, [open, post])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const langs = d.audience === 'external' ? (['sv', 'en', 'ar'] as const) : (['sv'] as const)

  async function save() {
    if (!d.title.sv?.trim()) return setErr('Skriv åtminstone en rubrik på svenska.')
    if (!auth.isAdmin && !d.committee_id) return setErr('Välj en kommitté.')
    setBusy(true)
    setErr(null)
    const committeeName = auth.committees.find((c) => c.id === d.committee_id)?.name
    const row = {
      audience: d.audience,
      page: d.audience === 'external' ? d.page : 'home',
      committee_id: d.committee_id,
      title: d.title,
      body: d.body,
      pinned: d.pinned,
      published: d.published,
      updated_at: new Date().toISOString(),
    } satisfies Partial<Post>
    try {
      if (d.id) await api.update('posts', d.id, row)
      else {
        const a = author()
        await api.insert('posts', {
          ...row,
          ...a,
          author_name: d.audience === 'external' ? (committeeName ?? 'Styrgruppen') : a.author_name,
        })
      }
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={d.id ? 'Redigera inlägg' : 'Nytt inlägg'} wide>
      <div className="space-y-4">
        <Tabs
          value={d.audience}
          onChange={(v) => set('audience', v)}
          options={[
            { value: 'internal', label: 'Internt – för volontärer' },
            { value: 'external', label: 'Externt – för besökare' },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kommitté">
            <Select value={d.committee_id ?? ''} onChange={(e) => set('committee_id', e.target.value || null)}>
              {auth.isAdmin && <option value="">Alla (Styrgruppen)</option>}
              {allowed.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          {d.audience === 'external' && (
            <Field label="Visas på">
              <Select value={d.page} onChange={(e) => set('page', e.target.value as PostPage)}>
                {Object.entries(PAGE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <LocalizedInput key={`t-${d.audience}`} label="Rubrik" required langs={[...langs]} value={d.title} onChange={(v) => set('title', v)} />
        <LocalizedInput key={`b-${d.audience}`} label="Text" multiline langs={[...langs]} value={d.body} onChange={(v) => set('body', v)} />
        {d.audience === 'external' && <p className="text-xs text-slate-500">Tomma språk visas på svenska för besökaren.</p>}
        <div className="flex flex-wrap gap-5">
          <Checkbox label="Fäst högst upp" checked={d.pinned} onChange={(v) => set('pinned', v)} />
          <Checkbox label="Publicerad" checked={d.published} onChange={(v) => set('published', v)} />
        </div>
        <ErrorText>{err}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Avbryt
          </Button>
          <Button onClick={save} loading={busy}>
            Spara
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function PostCard({ post, onEdit }: { post: Post; onEdit?: (p: Post) => void }) {
  const auth = useAuth()
  const canEdit = auth.isAdmin || auth.isLead(post.committee_id)
  const committee = auth.committees.find((c) => c.id === post.committee_id)
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {post.pinned && (
              <Badge tone="accent">
                <Pin className="size-3" /> Fäst
              </Badge>
            )}
            <Badge tone={post.audience === 'external' ? 'blue' : 'slate'}>{post.audience === 'external' ? `Extern · ${PAGE_LABEL[post.page]}` : 'Intern'}</Badge>
            {committee && <Badge>{committee.name}</Badge>}
            {!post.published && <Badge tone="amber">Ej publicerad</Badge>}
          </div>
          <h3 className="font-semibold text-ink">{tr(post.title, 'sv')}</h3>
          {tr(post.body, 'sv') && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{tr(post.body, 'sv')}</p>}
          <p className="mt-2 text-xs text-slate-500">
            {post.author_name ?? '–'} · {formatDateTime(post.updated_at ?? post.created_at)}
          </p>
        </div>
        {canEdit && onEdit && (
          <div className="no-print flex shrink-0 gap-1">
            <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Redigera" onClick={() => onEdit(post)}>
              <Pencil className="size-4" />
            </button>
            <button
              className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
              aria-label="Ta bort"
              onClick={() => confirm('Ta bort inlägget?') && api.remove('posts', post.id)}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}

const ORDER = { order: [{ col: 'pinned', asc: false }, { col: 'created_at', asc: false }] }

export default function Posts() {
  const auth = useAuth()
  const { data, loading } = useList('posts', ORDER)
  const [filter, setFilter] = useState<'all' | PostAudience>('all')
  const [editing, setEditing] = useState<Post | null>(null)
  const [open, setOpen] = useState(false)
  const canCreate = auth.isAdmin || auth.memberships.some((m) => m.is_lead)
  const list = useMemo(() => data.filter((p) => filter === 'all' || p.audience === filter), [data, filter])

  return (
    <div>
      <PageHeader
        title="Info & anslag"
        subtitle="Interna meddelanden till volontärer och extern information som visas för besökarna."
        actions={
          canCreate && (
            <Button
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              <Plus className="size-4" /> Nytt inlägg
            </Button>
          )
        }
      />
      <Tabs
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: `Alla (${data.length})` },
          { value: 'internal', label: 'Interna' },
          { value: 'external', label: 'Externa' },
        ]}
      />
      {loading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty icon={<Megaphone className="size-8 text-slate-300" />}>Inga inlägg ännu.</Empty>
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onEdit={(x) => {
                setEditing(x)
                setOpen(true)
              }}
            />
          ))}
        </div>
      )}
      <PostEditor open={open} onClose={() => setOpen(false)} post={editing} />
    </div>
  )
}
