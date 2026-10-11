import { CircleCheck, Pause, Play, RotateCcw, X } from 'lucide-react'
import { Link } from 'react-router'
import { GameCover } from '@/components/GameCard'
import { Badge, Cta, ProgressBar } from '@/components/ui/primitives'
import { formatBytes, formatEta, formatRelative, formatSpeed } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLauncherStore } from '@/stores/launcher-store'
import type { DownloadStatus, DownloadTask } from '@/types'

const STATUS_LABEL: Record<DownloadStatus, string> = {
  queued: 'В очереди',
  downloading: 'Загружается',
  paused: 'Пауза',
  verifying: 'Проверка SHA-256',
  installing: 'Установка',
  completed: 'Готово',
  failed: 'Ошибка',
  cancelled: 'Отменено',
}

export function DownloadRow({ task, compact = false }: { task: DownloadTask; compact?: boolean }) {
  const cover = useLauncherStore((s) => s.catalog.find((g) => g.id === task.gameId)?.coverUrl ?? null)
  const { pauseDownload, resumeDownload, cancelDownload, retryDownload } = useLauncherStore.getState()

  const pct = task.totalBytes > 0 ? (task.downloadedBytes / task.totalBytes) * 100 : 0
  const isActive = task.status === 'downloading'
  const isBusy = task.status === 'verifying' || task.status === 'installing'
  const tone =
    task.status === 'failed'
      ? 'primary'
      : task.status === 'completed'
        ? 'success'
        : task.status === 'paused' || task.status === 'queued'
          ? 'muted'
          : task.status === 'installing' || task.status === 'verifying'
            ? 'warning'
            : 'primary'

  return (
    <article
      className={cn(
        'flex items-center gap-4 rounded-2xl border bg-card p-4 transition-colors',
        isActive ? 'border-primary/50 shadow-[0_0_40px_-16px_rgba(229,9,20,0.6)]' : 'border-border',
      )}
    >
      {!compact && (
        <Link
          to={`/game/${encodeURIComponent(task.gameId)}`}
          className="hidden w-36 shrink-0 overflow-hidden rounded-lg sm:block"
        >
          <GameCover src={cover} title={task.title} className="aspect-video w-full" />
        </Link>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-display text-sm font-semibold">{task.title}</h3>
          <Badge>{task.kind === 'update' ? 'Обновление' : 'Установка'}</Badge>
          <Badge tone={task.status === 'failed' ? 'primary' : task.status === 'completed' ? 'success' : 'default'}>
            {STATUS_LABEL[task.status]}
          </Badge>
          <span className="text-xs text-muted-foreground">v{task.version}</span>
        </div>

        {task.status !== 'completed' && task.status !== 'cancelled' && (
          <ProgressBar
            value={isBusy ? 100 : pct}
            tone={tone}
            animated={isActive || isBusy}
            label={`Прогресс загрузки ${task.title}`}
          />
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
          <span>
            <span className="text-foreground">{formatBytes(task.downloadedBytes)}</span> из{' '}
            {formatBytes(task.totalBytes)}
          </span>
          {isActive && (
            <>
              <span className="text-foreground">{formatSpeed(task.speedBps)}</span>
              <span>Осталось: {formatEta(task.etaSeconds)}</span>
            </>
          )}
          {task.status === 'paused' && !task.resumable && (
            <span className="text-warning">Сервер не поддерживает докачку — загрузка начнётся заново</span>
          )}
          {task.status === 'completed' && (
            <span className="flex items-center gap-1 text-success">
              <CircleCheck className="size-3.5" aria-hidden /> Установлено {formatRelative(task.updatedAt)}
            </span>
          )}
          {task.error && <span className="text-primary">{task.error}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {isActive && (
          <Cta size="icon" variant="secondary" aria-label="Пауза" title="Пауза" onClick={() => pauseDownload(task.id)}>
            <Pause aria-hidden />
          </Cta>
        )}
        {(task.status === 'paused' || task.status === 'queued') && (
          <Cta
            size="icon"
            variant="primary"
            aria-label="Продолжить"
            title="Продолжить"
            onClick={() => resumeDownload(task.id)}
          >
            <Play aria-hidden />
          </Cta>
        )}
        {task.status === 'failed' && (
          <Cta size="icon" variant="primary" aria-label="Повторить" title="Повторить" onClick={() => retryDownload(task.id)}>
            <RotateCcw aria-hidden />
          </Cta>
        )}
        {['queued', 'downloading', 'paused', 'failed'].includes(task.status) && (
          <Cta size="icon" variant="ghost" aria-label="Отменить" title="Отменить" onClick={() => cancelDownload(task.id)}>
            <X aria-hidden />
          </Cta>
        )}
      </div>
    </article>
  )
}
