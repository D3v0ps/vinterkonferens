import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Loader2, X } from 'lucide-react'
import type { Lang, Localized } from '../lib/types'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-soft shadow-sm',
  accent: 'bg-accent text-white hover:brightness-110 shadow-sm',
  secondary: 'bg-white text-ink border border-slate-300 hover:bg-slate-50',
  ghost: 'text-ink hover:bg-slate-100',
  danger: 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2.5 text-sm',
        size === 'lg' && 'px-5 py-3.5 text-base',
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>
      {children}
    </div>
  )
}

export function Field({ label, hint, children, required, className }: { label: string; hint?: ReactNode; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-600"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/15 disabled:bg-slate-100'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(inputCls, props.className)} />
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(inputCls, 'pe-8', props.className)}>
      {children}
    </select>
  )
}

export function Checkbox({ label, checked, onChange, className }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <label className={cx('flex cursor-pointer items-center gap-2.5 text-sm', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 rounded accent-ink" />
      <span>{label}</span>
    </label>
  )
}

export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'accent'; className?: string }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-rose-100 text-rose-800',
    blue: 'bg-sky-100 text-sky-800',
    violet: 'bg-violet-100 text-violet-800',
    accent: 'bg-accent-soft text-accent',
  }
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center text-sm text-slate-500">
      {icon}
      {children}
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{children}</p>
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        'm-auto w-[calc(100%-1.5rem)] rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/50',
        wide ? 'max-w-3xl' : 'max-w-lg',
      )}
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Stäng">
              <X className="size-5" />
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  )
}

export function Tabs<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cx('no-print flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition',
            value === o.value ? 'bg-white text-ink shadow-sm' : 'text-slate-600 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const LANG_NAMES: Record<Lang, string> = { sv: 'Svenska', en: 'English', ar: 'العربية' }

/** Inmatning av samma text på svenska, engelska och arabiska. */
export function LocalizedInput({
  label,
  value,
  onChange,
  multiline,
  langs = ['sv', 'en', 'ar'],
  required,
}: {
  label: string
  value: Localized
  onChange: (v: Localized) => void
  multiline?: boolean
  langs?: Lang[]
  required?: boolean
}) {
  const [active, setActive] = useState<Lang>(langs[0])
  const C = multiline ? Textarea : Input
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-rose-600"> *</span>}
        </span>
        {langs.length > 1 && (
          <div className="flex gap-1">
            {langs.map((l) => (
              <button
                type="button"
                key={l}
                onClick={() => setActive(l)}
                className={cx(
                  'rounded-md px-2 py-0.5 text-xs font-semibold uppercase',
                  active === l ? 'bg-ink text-white' : value[l]?.trim() ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
                )}
                title={LANG_NAMES[l]}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>
      <C
        key={active}
        dir={active === 'ar' ? 'rtl' : 'ltr'}
        lang={active}
        value={value[active] ?? ''}
        placeholder={active === 'sv' ? '' : `${LANG_NAMES[active]} – tomt = visas på svenska`}
        onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => onChange({ ...value, [active]: e.target.value })}
      />
    </div>
  )
}

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-ink tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </Card>
  )
}
