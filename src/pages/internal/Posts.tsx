import { useEffect, useMemo, useState } from 'react'
import { Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth, useAuthorFields } from '../../lib/auth'
import { tr } from '../../lib/format'
import { useList } from '../../lib/hooks'
import { formatDateTime } from '../../lib/time'
import type { Localized, Post, PostAudience, PostPage } from '../../lib/types'
import { confirmDialog, notify } from '../../components/dialogs'
import { Badge, Button, Checkbox, Empty, ErrorText, Field, LocalizedInput, Modal, PageHeader, Select, Spinner, Tabs } from '../../components/ui'

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
        {d.audience === 'external' && <p className="text-sm text-muted">Språk du lämnar tomma visas på svenska för besökaren.</p>}
        <div className="flex flex-wrap gap-5">
          <Checkbox label="Fäst högst upp" checked={d.pinned} onChange={(v) => set('pinned', v)} />
          <Checkbox label="Publicerad" checked={d.published} onChange={(v) => set('published', v)} />
        </div>
        <ErrorText>{err}</ErrorText>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button onClick={save} loading={busy}>
            Spara inlägg
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Ett inlägg som rad. Lägg raderna i en <div className="divide-y divide-line border-y border-line">. */
export function PostCard({ post, onEdit }: { post: Post; onEdit?: (p: Post) => void }) {
  const auth = useAuth()
  const canEdit = auth.isAdmin || auth.isLead(post.committee_id)
  const committee = auth.committees.find((c) => c.id === post.committee_id)
  const title = tr(post.title, 'sv')
  const body = tr(post.body, 'sv')
  const meta = [
    post.pinned && 'Fäst',
    post.audience === 'external' && `Besökarsidan · ${PAGE_LABEL[post.page]}`,
    committee?.name,
    post.author_name,
    formatDateTime(post.updated_at ?? post.created_at),
  ].filter(Boolean)

  async function remove() {
    const ok = await confirmDialog({ title: 'Ta bort inlägget?', message: `"${title}" tas bort för alla.`, confirmLabel: 'Ta bort', danger: true })
    if (!ok) return
    try {
      await api.remove('posts', post.id)
      notify('Inlägget är borttaget')
    } catch (e) {
      notify((e as Error).message, 'error')
    }
  }

  return (
    <article className="flex items-start gap-3 py-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {post.pinned && <Pin className="size-4 shrink-0 text-muted" aria-hidden />}
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
          {!post.published && <Badge tone="amber">Ej publicerad</Badge>}
        </div>
        {body && <p className="mt-1 whitespace-pre-line text-base text-slate-700">{body}</p>}
        <p className="mt-2 text-sm text-muted">{meta.join(' · ')}</p>
      </div>
      {canEdit && onEdit && (
        <div className="no-print -me-2 flex shrink-0">
          <button className="grid size-11 place-items-center rounded-xl text-muted hover:bg-slate-100 hover:text-ink" aria-label={`Redigera ${title}`} title="Redigera" onClick={() => onEdit(post)}>
            <Pencil className="size-4" />
          </button>
          <button className="grid size-11 place-items-center rounded-xl text-rose-700 hover:bg-rose-50" aria-label={`Ta bort ${title}`} title="Ta bort" onClick={remove}>
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </article>
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
        title={
          <>
            Info & <em className="font-display font-normal italic">anslag</em>
          </>
        }
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
        <div className="divide-y divide-line border-y border-line">
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
