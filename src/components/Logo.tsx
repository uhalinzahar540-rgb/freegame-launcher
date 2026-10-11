import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('drop-shadow-[0_0_10px_var(--glow)]', className)} aria-hidden>
      <rect width="64" height="64" rx="14" style={{ fill: 'var(--logo-bg)' }} />
      <path d="M18 14h30l-4 8H27l-1.6 6H42l-4 8H23.3L20 50h-9l7-36z" style={{ fill: 'var(--logo-mark)' }} />
      <path d="M40 40h10l-3 10H37z" style={{ fill: 'var(--logo-accent)' }} />
    </svg>
  )
}
