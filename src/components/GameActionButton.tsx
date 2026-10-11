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
import { useT } from '@/i18n'
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
  const t = useT()
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
            <Download aria-hidden /> {t('common.install')}
          </Cta>
        )
      case 'external':
        return (
          <Cta
            {...common}
            variant="outline"
            onClick={() => game?.pageUrl && backend.openExternal(game.pageUrl)}
            title={t('action.externalHint')}
          >
            <ExternalLink aria-hidden /> {t('action.openPage')}
          </Cta>
        )
      case 'unavailable':
        return (
          <Cta {...common} variant="muted" disabled>
            <Ban aria-hidden /> {t('action.unavailable')}
          </Cta>
        )
      case 'queued':
        return (
          <Cta {...common} variant="secondary" onClick={() => navigate('/downloads')}>
            <LoaderCircle className="animate-spin" aria-hidden /> {t('action.queued')}
          </Cta>
        )
      case 'downloading':
        return (
          <Cta
            {...common}
            variant="secondary"
            onClick={() => download && pauseDownload(download.id)}
            title={t('action.pauseHint')}
            className={cn(common.className, 'relative overflow-hidden')}
          >
            <span
              className="absolute inset-y-0 start-0 bg-primary/30 transition-[width] duration-500"
              style={{ width: `${pct}%` }}
              aria-hidden
            />
            <Pause className="relative" aria-hidden />
            <span className="relative tabular-nums">{t('action.downloading', { pct })}</span>
          </Cta>
        )
      case 'paused':
        return (
          <Cta {...common} variant="primary" onClick={() => download && resumeDownload(download.id)}>
            <Play aria-hidden /> {t('action.resume', { pct })}
          </Cta>
        )
      case 'verifying':
        return (
          <Cta {...common} variant="secondary" disabled>
            <ShieldCheck className="animate-pulse" aria-hidden /> {t('action.verifying')}
          </Cta>
        )
      case 'installing':
        return (
          <Cta {...common} variant="secondary" disabled>
            <LoaderCircle className="animate-spin" aria-hidden /> {t('action.installing')}
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
            <RotateCcw aria-hidden /> {t('common.retry')}
          </Cta>
        )
      case 'running':
        return (
          <Cta {...common} variant="secondary" disabled>
            <span className="size-2 animate-pulse rounded-full bg-success" aria-hidden /> {t('action.running')}
          </Cta>
        )
      case 'update':
        return (
          <Cta {...common} variant="warning" onClick={() => startUpdate(gameId)}>
            <RefreshCw aria-hidden /> {t('common.update')}
          </Cta>
        )
      case 'missing':
        return game?.package ? (
          <Cta {...common} variant="danger" onClick={() => setInstallOpen(true)}>
            <TriangleAlert aria-hidden /> {t('action.reinstall')}
          </Cta>
        ) : (
          <Cta {...common} variant="muted" disabled title={t('action.missingHint')}>
            <TriangleAlert aria-hidden /> {t('action.missing')}
          </Cta>
        )
      case 'installed':
      default:
        return (
          <Cta {...common} variant="play" onClick={() => launch(gameId)}>
            <Play className="fill-current" aria-hidden /> {t('common.play')}
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
