import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useLauncherStore } from '@/stores/launcher-store'

const ICONS = {
  info: { icon: Info, className: 'text-foreground' },
  success: { icon: CircleCheck, className: 'text-success' },
  warning: { icon: TriangleAlert, className: 'text-warning' },
  error: { icon: CircleAlert, className: 'text-primary' },
} as const

export function Toaster() {
  const toasts = useLauncherStore((s) => s.toasts)
  const dismiss = useLauncherStore((s) => s.dismissToast)

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const { icon: Icon, className } = ICONS[toast.kind]
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-xl border bg-card/95 p-3.5 shadow-2xl backdrop-blur-xl',
                toast.kind === 'error' ? 'border-primary/50' : 'border-border',
              )}
            >
              <Icon className={cn('mt-0.5 size-5 shrink-0', className)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.body && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{toast.body}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Закрыть уведомление"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
