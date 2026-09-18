import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'

export const cn = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' ')

/* ------------------------------------------------------------------ button */

type Variant = 'primary' | 'neutral' | 'ghost' | 'danger' | 'success'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white border-brand',
  neutral: 'bg-surface text-ink border-line',
  ghost: 'bg-transparent text-ink border-transparent',
  danger: 'bg-red-600 text-white border-red-600',
  success: 'bg-emerald-600 text-white border-emerald-600',
}

export function Button({
  variant = 'neutral',
  block,
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  block?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizes = {
    sm: 'min-h-[44px] px-3 text-sm rounded-xl',
    md: 'min-h-[52px] px-4 text-base rounded-2xl',
    lg: 'min-h-[64px] px-5 text-lg rounded-2xl',
  }
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 border-2 font-bold transition active:scale-[0.97] disabled:opacity-40',
        sizes[size],
        VARIANTS[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------- card */

export function Card({
  className,
  children,
  style,
}: {
  className?: string
  children: ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div className={cn('rounded-3xl border border-line bg-surface p-4 shadow-card', className)} style={style}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 mt-4 px-1">
      <h2 className="text-sm font-black uppercase tracking-wider text-sub">{children}</h2>
      {hint ? <p className="mt-1 text-xs text-sub">{hint}</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------------- chips */

export function Chip({
  active,
  children,
  onClick,
  color,
  className,
  title,
}: {
  active?: boolean
  children: ReactNode
  onClick?: () => void
  color?: string
  className?: string
  title?: string
}) {
  const style = color
    ? { borderColor: color, color: active ? '#fff' : color, backgroundColor: active ? color : 'transparent' }
    : undefined
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      title={title}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 px-3 text-sm font-bold transition active:scale-95',
        !color && (active ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink'),
        className,
      )}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ toggle */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[56px] w-full items-center justify-between gap-3 py-1 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{label}</span>
        {hint ? <span className="block text-xs text-sub">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-9 w-16 shrink-0 rounded-full border-2 transition',
          checked ? 'border-emerald-600 bg-emerald-600' : 'border-line bg-surface2',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all',
            checked ? 'left-8' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}

/* --------------------------------------------------------------- segmented */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  columns = 1,
}: {
  value: T
  options: { value: T; label: string; hint?: string }[]
  onChange: (v: T) => void
  columns?: number
}) {
  return (
    <div className={cn('grid gap-2', columns === 3 ? 'grid-cols-3' : columns === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              'flex min-h-[56px] flex-col items-start justify-center rounded-2xl border-2 px-3 text-left transition active:scale-[0.98]',
              active ? 'border-brand bg-brand/10' : 'border-line bg-surface',
            )}
          >
            <span className="text-sm font-bold leading-tight">{opt.label}</span>
            {opt.hint ? <span className="mt-0.5 text-[11px] leading-tight text-sub">{opt.hint}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------- input */

export function Field({
  label,
  hint,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-sub">{label}</span>
      <input
        id={id}
        className={cn(
          'w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 text-base font-semibold outline-none placeholder:text-sub/60 focus:border-brand',
          className,
        )}
        {...rest}
      />
      {hint ? <span className="mt-1 block text-xs text-sub">{hint}</span> : null}
    </label>
  )
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 9,
  label,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  label?: string
}) {
  return (
    <div className="flex items-center gap-2">
      {label ? <span className="mr-1 text-xs font-bold uppercase text-sub">{label}</span> : null}
      <Button size="sm" onClick={() => onChange(Math.max(min, value - 1))} aria-label="minus">
        −
      </Button>
      <span className="tnum min-w-[2.5rem] text-center text-xl font-black">{value}</span>
      <Button size="sm" onClick={() => onChange(Math.min(max, value + 1))} aria-label="plus">
        ＋
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------ bottom sheet */

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  actions,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  actions?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative max-h-[88vh] animate-slide-up overflow-y-auto rounded-t-3xl border-x-2 border-t-2 border-line bg-surface shadow-sheet"
      >
        <div className="sticky top-0 z-10 border-b border-line bg-surface/95 px-4 pb-3 pt-2 backdrop-blur">
          <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-line" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black leading-tight">{title}</h2>
              {subtitle ? <p className="mt-0.5 text-sm text-sub">{subtitle}</p> : null}
            </div>
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="close">
              ✕
            </Button>
          </div>
        </div>
        <div className="px-4 py-4 pb-safe">{children}</div>
        {actions ? <div className="sticky bottom-0 border-t border-line bg-surface px-4 py-3 pb-safe">{actions}</div> : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ modal */

export function Modal({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  actions?: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="close" onClick={onClose} className="absolute inset-0 bg-black/55" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md animate-pop-in rounded-3xl border-2 border-line bg-surface p-5 shadow-sheet"
      >
        <h2 className="text-lg font-black">{title}</h2>
        <div className="mt-2 text-sm text-sub">{children}</div>
        {actions ? <div className="mt-4 flex flex-col gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      actions={
        <>
          <Button variant={danger ? 'danger' : 'primary'} size="lg" block onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" block onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </>
      }
    >
      <p>{body}</p>
    </Modal>
  )
}

/* ------------------------------------------------------------------- toast */

export function ToastHost() {
  const { t } = useI18n()
  const { toast, undo, dismissToast, screen } = useStore()
  if (!toast) return null
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3',
        screen === 'finish' ? 'bottom-6' : 'bottom-[calc(var(--safe-b)+5.5rem)]',
      )}
    >
      <div className="pointer-events-auto flex w-full max-w-md animate-pop-in items-center gap-3 rounded-2xl border-2 border-line bg-ink px-4 py-3 text-surface shadow-sheet">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{t(toast.key, toast.vars)}</p>
          {toast.subKey ? <p className="truncate text-xs opacity-80">{t(toast.subKey, toast.subVars)}</p> : null}
        </div>
        {toast.undoable ? (
          <button
            type="button"
            onClick={() => {
              undo()
              dismissToast()
            }}
            className="shrink-0 rounded-xl border-2 border-surface/40 px-3 py-2 text-sm font-black uppercase"
          >
            {t('common.undo')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ layout */

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center gap-2', className)}>{children}</div>
}

export function EmptyState({ text, emoji }: { text: string; emoji?: string }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-line px-4 py-10 text-center">
      {emoji ? <div className="mb-2 text-4xl">{emoji}</div> : null}
      <p className="text-sm font-semibold text-sub">{text}</p>
    </div>
  )
}

/** tiny animated number that flashes when it changes */
export function FlashNumber({ value, className }: { value: number; className?: string }) {
  const [flash, setFlash] = useState(false)
  const [prev, setPrev] = useState(value)
  useEffect(() => {
    if (value !== prev) {
      setPrev(value)
      setFlash(true)
      const id = window.setTimeout(() => setFlash(false), 700)
      return () => window.clearTimeout(id)
    }
    return undefined
  }, [value, prev])
  return <span className={cn('tnum tabular-nums', flash && 'animate-flash rounded-lg', className)}>{value}</span>
}

/* ------------------------------------------------------------------ dialogs */

interface PromptState {
  resolve: (v: string | null) => void
  title: string
  label: string
  initial: string
}
const PromptCtx = createContext<((title: string, label: string, initial?: string) => Promise<string | null>) | null>(
  null,
)

export function PromptProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [state, setState] = useState<PromptState | null>(null)
  const [value, setValue] = useState('')

  const ask = (title: string, label: string, initial = '') => {
    setValue(initial)
    return new Promise<string | null>((resolve) => setState({ resolve, title, label, initial }))
  }

  return (
    <PromptCtx.Provider value={ask}>
      {children}
      <Modal
        open={Boolean(state)}
        onClose={() => {
          state?.resolve(null)
          setState(null)
        }}
        title={state?.title ?? ''}
        actions={
          <>
            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => {
                state?.resolve(value.trim() || null)
                setState(null)
              }}
            >
              {t('common.save')}
            </Button>
            <Button
              variant="ghost"
              block
              onClick={() => {
                state?.resolve(null)
                setState(null)
              }}
            >
              {t('common.cancel')}
            </Button>
          </>
        }
      >
        <Field
          label={state?.label ?? ''}
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              state?.resolve(value.trim() || null)
              setState(null)
            }
          }}
        />
      </Modal>
    </PromptCtx.Provider>
  )
}

export function usePrompt() {
  const ctx = useContext(PromptCtx)
  if (!ctx) throw new Error('usePrompt must be used inside PromptProvider')
  return ctx
}
