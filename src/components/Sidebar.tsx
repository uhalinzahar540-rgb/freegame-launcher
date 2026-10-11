import { Download, House, LayoutGrid, Library, RefreshCw, Settings } from 'lucide-react'
import { motion } from 'motion/react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { backend } from '@/services'
import { useLauncherStore } from '@/stores/launcher-store'
import type { SourceStatus } from '@/types'

const ACTIVE_DOWNLOAD = new Set(['queued', 'downloading', 'paused', 'verifying', 'installing'])

export function Sidebar() {
  const activeDownloads = useLauncherStore(
    (s) => Object.values(s.downloads).filter((d) => ACTIVE_DOWNLOAD.has(d.status)).length,
  )
  const updatesCount = useLauncherStore((s) => s.updates.length)
  const sources = useLauncherStore((s) => s.sources)

  const items = [
    { to: '/', label: 'Главная', icon: House, end: true },
    { to: '/catalog', label: 'Каталог', icon: LayoutGrid },
    { to: '/library', label: 'Библиотека', icon: Library },
    { to: '/downloads', label: 'Загрузки', icon: Download, badge: activeDownloads },
    { to: '/updates', label: 'Обновления', icon: RefreshCw, badge: updatesCount },
    { to: '/settings', label: 'Настройки', icon: Settings },
  ]

  return (
    <nav
      aria-label="Основная навигация"
      className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar px-3 py-4 max-md:w-16 max-md:px-2"
    >
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors max-md:justify-center max-md:px-0',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:bg-panel/60 hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-lg border border-primary/40 bg-gradient-to-r from-primary/25 to-primary/5 shadow-glow"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  {isActive && (
                    <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-primary max-md:hidden" />
                  )}
                  <item.icon
                    className={cn('relative size-[18px] shrink-0', isActive && 'text-primary')}
                    aria-hidden
                  />
                  <span className="relative max-md:sr-only">{item.label}</span>
                  {!!item.badge && (
                    <span className="relative ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground max-md:absolute max-md:top-1 max-md:right-1 max-md:h-4 max-md:min-w-4 max-md:text-[10px]">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4 max-md:hidden">
        <p className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Источники</p>
        <ul className="flex flex-col gap-2">
          {sources.map((source) => (
            <li key={source.id} className="flex items-center gap-2 px-1 text-xs" title={source.statusMessage ?? ''}>
              <StatusDot status={source.status} />
              <span className="truncate text-foreground/80">{source.name}</span>
              <span className="ml-auto text-muted-foreground tabular-nums">{source.gameCount}</span>
            </li>
          ))}
          {sources.length === 0 && <li className="px-1 text-xs text-muted-foreground">Загрузка…</li>}
        </ul>
        <p className="px-1 text-[11px] text-muted-foreground">
          Версия {backend.appVersion}
          {!backend.isDesktop && ' · предпросмотр'}
        </p>
      </div>
    </nav>
  )
}

export function StatusDot({ status }: { status: SourceStatus }) {
  const color: Record<SourceStatus, string> = {
    online: 'bg-success shadow-[0_0_8px_rgba(41,199,111,0.7)]',
    limited: 'bg-warning',
    offline: 'bg-primary',
    error: 'bg-primary shadow-[0_0_8px_rgba(229,9,20,0.8)]',
    disabled: 'bg-muted-foreground/40',
    unknown: 'bg-muted-foreground/40',
  }
  return <span className={cn('size-2 shrink-0 rounded-full', color[status])} aria-hidden />
}
