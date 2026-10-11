import { useState } from 'react'
import {
  Ban,
  Download,
  ExternalLink,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { useNavigate } from 'react-router'
import { InstallDialog } from '@/components/InstallDialog'
import { Cta, type CtaVariantProps } from '@/components/ui/primitives'
import { useGameState } from '@/lib/game-state'
import { cn } from '@/lib/utils'
import { backend } from '@/services'
import { useLauncherStore } from '@/stores/launcher-store'

export function GameActionButton({
  gameId,
  size = 'md',
  className,
}: {
  gameId: string
  size?: CtaVariantProps['size']
  className?: string
}) {
  const navigate = useNavigate()
  const state = useGameState(gameId)
  const [installOpen, setInstallOpen] = useState(false)
  const { launch, pauseDownload, resumeDownload, retryDownload, startUpdate } = useLauncherStore.getState()
  const { game, download, phase } = state

  const pct =
    download && download.totalBytes > 0 ? Math.floor((download.downloadedBytes / download.totalBytes) * 100) : 0

  const common = { size, className: cn(className) }

  const button = (() => {
    switch (phase) {
      case 'installable':
        return (
          <Cta {...common} variant="primary" onClick={() => setInstallOpen(true)}>
            <Download aria-hidden /> Установить
          </Cta>
        )
      case 'external':
        return (
          <Cta
            {...common}
            variant="outline"
            onClick={() => game?.pageUrl && backend.openExternal(game.pageUrl)}
            title="Автоматическая установка из этого источника не поддерживается"
          >
            <ExternalLink aria-hidden /> Открыть страницу
          </Cta>
        )
      case 'unavailable':
        return (
          <Cta {...common} variant="muted" disabled>
            <Ban aria-hidden /> Недоступно
          </Cta>
        )
      case 'queued':
        return (
          <Cta {...common} variant="secondary" onClick={() => navigate('/downloads')}>
            <LoaderCircle className="animate-spin" aria-hidden /> В очереди
          </Cta>
        )
      case 'downloading':
        return (
          <Cta
            {...common}
            variant="secondary"
            onClick={() => download && pauseDownload(download.id)}
            title="Приостановить загрузку"
            className={cn(common.className, 'relative overflow-hidden')}
          >
            <span
              className="absolute inset-y-0 left-0 bg-primary/30 transition-[width] duration-500"
              style={{ width: `${pct}%` }}
              aria-hidden
            />
            <Pause className="relative" aria-hidden />
            <span className="relative tabular-nums">Загружается {pct}%</span>
          </Cta>
        )
      case 'paused':
        return (
          <Cta {...common} variant="primary" onClick={() => download && resumeDownload(download.id)}>
            <Play aria-hidden /> Продолжить · {pct}%
          </Cta>
        )
      case 'verifying':
        return (
          <Cta {...common} variant="secondary" disabled>
            <ShieldCheck className="animate-pulse" aria-hidden /> Проверка
          </Cta>
        )
      case 'installing':
        return (
          <Cta {...common} variant="secondary" disabled>
            <LoaderCircle className="animate-spin" aria-hidden /> Установка
          </Cta>
        )
      case 'failed':
        return (
          <Cta
            {...common}
            variant="danger"
            onClick={() => download && retryDownload(download.id)}
            title={download?.error ?? ''}
          >
            <RotateCcw aria-hidden /> Повторить
          </Cta>
        )
      case 'running':
        return (
          <Cta {...common} variant="secondary" disabled>
            <span className="size-2 animate-pulse rounded-full bg-success" aria-hidden /> Запущена
          </Cta>
        )
      case 'update':
        return (
          <Cta {...common} variant="warning" onClick={() => startUpdate(gameId)}>
            <RefreshCw aria-hidden /> Обновить
          </Cta>
        )
      case 'missing':
        return game?.package ? (
          <Cta {...common} variant="danger" onClick={() => setInstallOpen(true)}>
            <TriangleAlert aria-hidden /> Переустановить
          </Cta>
        ) : (
          <Cta {...common} variant="muted" disabled title="Исполняемый файл не найден">
            <TriangleAlert aria-hidden /> Файл не найден
          </Cta>
        )
      case 'installed':
      default:
        return (
          <Cta {...common} variant="play" onClick={() => launch(gameId)}>
            <Play className="fill-current" aria-hidden /> Играть
          </Cta>
        )
    }
  })()

  return (
    <>
      {button}
      {game?.package && <InstallDialog game={game} open={installOpen} onClose={() => setInstallOpen(false)} />}
    </>
  )
}
