import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLauncherStore } from '@/stores/launcher-store'

const KIND_COLOR = {
  info: 'bg-foreground/60',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-primary',
} as const

export function NotificationsMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const notifications = useLauncherStore((s) => s.notifications)
  const markRead = useLauncherStore((s) => s.markNotificationsRead)
  const unread = notifications.filter((n) => !n.read).length

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Уведомления${unread ? `, непрочитанных: ${unread}` : ''}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
          if (!open && unread) void markRead()
        }}
        className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-panel hover:text-foreground"
      >
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary shadow-glow" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-10 right-0 w-80 overflow-hidden rounded-xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">Уведомления</div>
            <ul className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">Пока ничего нового</li>
              )}
              {notifications.map((n) => (
                <li key={n.id} className="flex gap-3 border-b border-border/60 px-4 py-3 last:border-0">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', KIND_COLOR[n.kind])} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground/70">{formatRelative(n.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
