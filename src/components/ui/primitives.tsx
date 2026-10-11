import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const ctaVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-glow hover:bg-primary-hover hover:shadow-glow-lg',
        play: 'bg-gradient-to-b from-primary-hover to-primary text-primary-foreground shadow-glow hover:brightness-110 hover:shadow-glow-lg',
        warning: 'bg-warning text-black hover:brightness-110',
        secondary: 'border border-border bg-panel text-foreground hover:border-foreground/20 hover:bg-[#2a2a2a]',
        ghost: 'text-muted-foreground hover:bg-panel hover:text-foreground',
        outline: 'border border-primary/50 text-foreground hover:border-primary hover:bg-primary/10',
        danger: 'border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20',
        muted: 'border border-border bg-panel/70 text-muted-foreground',
      },
      size: {
        sm: 'h-8 px-3 text-xs [&_svg]:size-3.5',
        md: 'h-10 px-4 text-sm [&_svg]:size-4',
        lg: 'h-12 px-7 text-base [&_svg]:size-5',
        icon: 'size-9 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export type CtaVariantProps = VariantProps<typeof ctaVariants>

export function Cta({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & CtaVariantProps) {
  return <button type={type} className={cn(ctaVariants({ variant, size }), className)} {...props} />
}

export function ProgressBar({
  value,
  className,
  tone = 'primary',
  animated = false,
  label,
}: {
  value: number
  className?: string
  tone?: 'primary' | 'warning' | 'success' | 'muted'
  animated?: boolean
  label?: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  const toneClass = {
    primary: 'bg-gradient-to-r from-primary-deep via-primary to-primary-hover shadow-[0_0_12px_rgba(229,9,20,0.6)]',
    warning: 'bg-warning',
    success: 'bg-success',
    muted: 'bg-muted-foreground/60',
  }[tone]
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-panel', className)}
    >
      <div
        className={cn('relative h-full rounded-full transition-[width] duration-500 ease-out', toneClass)}
        style={{ width: `${pct}%` }}
      >
        {animated && (
          <span className="absolute inset-0 animate-stripes bg-[linear-gradient(45deg,rgba(255,255,255,0.18)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.18)_50%,rgba(255,255,255,0.18)_75%,transparent_75%)] bg-[length:24px_24px]" />
        )}
      </div>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-shimmer rounded-lg bg-[linear-gradient(90deg,#171717_0%,#232323_40%,#2b1414_50%,#232323_60%,#171717_100%)] bg-[length:200%_100%]',
        className,
      )}
      aria-hidden
    />
  )
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50',
        checked ? 'border-primary bg-primary shadow-glow' : 'border-border bg-panel',
      )}
    >
      <span
        className={cn(
          'inline-block size-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  )
}

export function Badge({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode
  tone?: 'default' | 'primary' | 'success' | 'warning'
  className?: string
}) {
  const toneClass = {
    default: 'border-border bg-panel/80 text-foreground/80',
    primary: 'border-primary/40 bg-primary/15 text-primary-hover',
    success: 'border-success/30 bg-success/10 text-success',
    warning: 'border-warning/30 bg-warning/10 text-warning',
  }[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        toneClass,
        className,
      )}
    >
      {children}
    </span>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-balance md:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary [&_svg]:size-6">
        {icon}
      </div>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {description && <p className="mt-2 max-w-md text-sm text-pretty text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
