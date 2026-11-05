import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import type { Lang, Localized } from '../lib/types'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

// Accentfärgen (accent) används sparsamt: bara för sidans viktigaste handling.
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid' | 'accent'
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-soft',
  accent: 'bg-accent text-white hover:bg-accent-strong',
  secondary: 'bg-white text-ink border border-line hover:border-slate-400',
  ghost: 'text-ink hover:bg-slate-100',
  danger: 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50',
  'danger-solid': 'bg-rose-700 text-white hover:bg-rose-800',
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
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' && 'min-h-9 px-3 py-1.5 text-[15px]',
        size === 'md' && 'min-h-11 px-4 py-2.5 text-base',
        size === 'lg' && 'min-h-13 px-6 py-3.5 text-lg',
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
    <div {...rest} className={cx('card', className)}>
      {children}
    </div>
  )
}

export function Field({ label, hint, children, required, className }: { label: string; hint?: ReactNode; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-base font-medium text-slate-800">
        {label}
        {required && <span className="text-rose-700"> *</span>}
      </span>
      {hint && <span className="-mt-0.5 mb-1.5 block text-base text-muted">{hint}</span>}
      {children}
    </label>
  )
}

const inputCls = 'field'

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={cx(inputCls, props.className)} />
}

export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea rows={3} {...props} className={cx(inputCls, props.className)} />
}

export function Select({ children, ...props }: ComponentProps<'select'>) {
  return (
    <select {...props} className={cx(inputCls, 'pe-8', props.className)}>
      {children}
    </select>
  )
}

export function Checkbox({ label, checked, onChange, className }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <label className={cx('flex min-h-11 cursor-pointer items-center gap-3 text-base', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 rounded accent-ink" />
      <span>{label}</span>
    </label>
  )
}

export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'accent'; className?: string }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-50 text-emerald-800',
    amber: 'bg-amber-50 text-amber-900',
    red: 'bg-rose-50 text-rose-800',
    blue: 'bg-sky-50 text-sky-900',
    violet: 'bg-violet-50 text-violet-800',
    accent: 'bg-accent-soft text-accent-strong',
  }
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium', tones[tone], className)}>{children}</span>
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      {label && <span className="text-base">{label}</span>}
    </div>
  )
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center text-base text-muted">
      {icon}
      {children}
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="rounded-xl bg-rose-50 px-3 py-2 text-base text-rose-800" role="alert">{children}</p>
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[2rem] leading-tight font-semibold tracking-tight text-ink text-balance sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-[65ch] text-base text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

const CLOSE_LABEL: Record<string, string> = { sv: 'Stäng', en: 'Close', ar: 'إغلاق' }

/**
 * Dialogruta. Stängs bara med stängknappen (eller Esc när `persistent` inte är satt), aldrig
 * av ett tryck bredvid – så att ett långt formulär inte töms av misstag. Helskärm på telefon.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  persistent,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  wide?: boolean
  /** Esc stänger inte (för formulär med inmatning). */
  persistent?: boolean
}) {
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
      onCancel={(e) => {
        e.preventDefault()
        if (!persistent) onClose()
      }}
      onClose={() => open && onClose()}
      className={cx(
        'm-auto w-[calc(100%-1.5rem)] rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-ink/50',
        'max-sm:m-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-none',
        wide ? 'max-w-3xl' : 'max-w-lg',
      )}
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto overscroll-contain max-sm:max-h-dvh max-sm:pb-[env(safe-area-inset-bottom,0px)]">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-white px-5 py-3 max-sm:pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
            <h2 className="text-xl font-semibold text-ink text-balance">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-slate-100"
              aria-label={CLOSE_LABEL[document.documentElement.lang] ?? 'Stäng'}
            >
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
    <div role="tablist" className={cx('no-print inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-base font-medium transition-colors',
            value === o.value ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink',
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
  hint,
}: {
  hint?: ReactNode
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
        <span className="text-base font-medium text-slate-800">
          {label}
          {required && <span className="text-rose-700"> *</span>}
        </span>
        {langs.length > 1 && (
          <div className="flex gap-1">
            {langs.map((l) => (
              <button
                type="button"
                key={l}
                onClick={() => setActive(l)}
                className={cx(
                  'inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2.5 text-base font-medium',
                  active === l ? 'bg-ink text-white' : 'bg-slate-100 text-ink',
                )}
                title={`${LANG_NAMES[l]}${value[l]?.trim() ? ' – ifylld' : ' – tom'}`}
                aria-pressed={active === l}
              >
                {value[l]?.trim() && <Check className="size-4" aria-label="ifylld" />}
                {l === 'ar' ? 'عربي' : l === 'sv' ? 'Sv' : 'En'}
              </button>
            ))}
          </div>
        )}
      </div>
      {hint && <span className="mb-1.5 block text-base text-muted">{hint}</span>}
      <C
        key={active}
        dir={active === 'ar' ? 'rtl' : 'ltr'}
        lang={active}
        value={value[active] ?? ''}
        placeholder={active === 'sv' ? '' : `${LANG_NAMES[active]} – tomt = visas på svenska`}
        aria-label={langs.length > 1 ? `${label} (${LANG_NAMES[active]})` : label}
        aria-required={required || undefined}
        onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => onChange({ ...value, [active]: e.target.value })}
      />
    </div>
  )
}

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-base text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-ink tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-sm text-muted">{sub}</div>}
    </Card>
  )
}
