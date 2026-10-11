import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, Copy, Minus, Search, Square, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { NotificationsMenu } from '@/components/NotificationsMenu'
import { Logo } from '@/components/Logo'
import { useT } from '@/i18n'
import { backend } from '@/services'

async function withWindow(action: 'minimize' | 'toggleMaximize' | 'close') {
  if (!backend.isDesktop) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()
  await win[action]()
}

/** `minimal` renders only the brand and window controls — used by the first-run wizard. */
export function TitleBar({ minimal = false }: { minimal?: boolean }) {
  const t = useT()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [maximized, setMaximized] = useState(false)

  function submit(event: FormEvent) {
    event.preventDefault()
    const q = query.trim()
    navigate(q ? `/catalog?q=${encodeURIComponent(q)}` : '/catalog')
  }

  return (
    <header
      data-tauri-drag-region
      className="relative z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-sidebar ps-3"
    >
      <div data-tauri-drag-region className="flex w-52 shrink-0 items-center gap-2.5">
        <Logo className="size-7" />
        <span data-tauri-drag-region className="font-display text-sm font-semibold tracking-tight">
          FreeGame<span className="text-primary"> Launcher</span>
        </span>
      </div>

      {!minimal && (
        <>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-panel hover:text-foreground"
            aria-label={t('common.back')}
          >
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </button>

          <form onSubmit={submit} role="search" className="w-full max-w-md">
            <label className="group flex h-8 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 transition-colors focus-within:border-primary/70 focus-within:shadow-glow">
              <Search className="size-4 text-muted-foreground group-focus-within:text-primary" aria-hidden />
              <span className="sr-only">{t('titlebar.search')}</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('titlebar.searchPlaceholder')}
                className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
          </form>
        </>
      )}

      <div data-tauri-drag-region className="h-full flex-1" />

      {!minimal && <NotificationsMenu />}

      {backend.isDesktop ? (
        <div className="flex h-full items-stretch">
          <WindowButton label={t('titlebar.minimize')} onClick={() => withWindow('minimize')}>
            <Minus className="size-4" />
          </WindowButton>
          <WindowButton
            label={maximized ? t('titlebar.restore') : t('titlebar.maximize')}
            onClick={() => {
              setMaximized((m) => !m)
              void withWindow('toggleMaximize')
            }}
          >
            {maximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
          </WindowButton>
          <WindowButton label={t('common.close')} danger onClick={() => withWindow('close')}>
            <X className="size-4" />
          </WindowButton>
        </div>
      ) : (
        <span className="me-3 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
          {t('titlebar.browserPreview')}
        </span>
      )}
    </header>
  )
}

function WindowButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex w-12 items-center justify-center text-muted-foreground transition-colors hover:text-foreground ${
        danger ? 'hover:bg-[#e81123] hover:text-white' : 'hover:bg-panel'
      }`}
    >
      {children}
    </button>
  )
}
