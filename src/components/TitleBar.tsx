import { useState, type FormEvent } from 'react'
import { ArrowLeft, Copy, Minus, Search, Square, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { NotificationsMenu } from '@/components/NotificationsMenu'
import { Logo } from '@/components/Logo'
import { backend } from '@/services'

async function withWindow(action: 'minimize' | 'toggleMaximize' | 'close') {
  if (!backend.isDesktop) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()
  await win[action]()
}

export function TitleBar() {
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
      className="relative z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-sidebar pl-3"
    >
      <div data-tauri-drag-region className="flex w-52 shrink-0 items-center gap-2.5">
        <Logo className="size-7" />
        <span data-tauri-drag-region className="font-display text-sm font-semibold tracking-tight">
          FreeGame<span className="text-primary"> Launcher</span>
        </span>
      </div>

      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-panel hover:text-foreground"
        aria-label="Назад"
      >
        <ArrowLeft className="size-4" />
      </button>

      <form onSubmit={submit} role="search" className="w-full max-w-md">
        <label className="group flex h-8 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 transition-colors focus-within:border-primary/70 focus-within:shadow-glow">
          <Search className="size-4 text-muted-foreground group-focus-within:text-primary" aria-hidden />
          <span className="sr-only">Поиск игр</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск игр…"
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </form>

      <div data-tauri-drag-region className="h-full flex-1" />

      <NotificationsMenu />

      {backend.isDesktop ? (
        <div className="flex h-full items-stretch">
          <WindowButton label="Свернуть" onClick={() => withWindow('minimize')}>
            <Minus className="size-4" />
          </WindowButton>
          <WindowButton
            label={maximized ? 'Восстановить' : 'Развернуть'}
            onClick={() => {
              setMaximized((m) => !m)
              void withWindow('toggleMaximize')
            }}
          >
            {maximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
          </WindowButton>
          <WindowButton label="Закрыть" danger onClick={() => withWindow('close')}>
            <X className="size-4" />
          </WindowButton>
        </div>
      ) : (
        <span className="mr-3 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
          Браузерный предпросмотр
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
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex w-12 items-center justify-center text-muted-foreground transition-colors hover:text-foreground ${
        danger ? 'hover:bg-primary' : 'hover:bg-panel'
      }`}
    >
      {children}
    </button>
  )
}
