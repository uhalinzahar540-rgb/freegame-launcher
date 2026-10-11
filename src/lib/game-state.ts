import { useMemo } from 'react'
import { t } from '@/i18n'
import { useLauncherStore } from '@/stores/launcher-store'
import type { DownloadTask, Game, Installation, UpdateInfo } from '@/types'

export type GamePhase =
  | 'unavailable'
  | 'external'
  | 'installable'
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'installing'
  | 'failed'
  | 'installed'
  | 'update'
  | 'running'
  | 'missing'

export interface GameState {
  phase: GamePhase
  installation: Installation | null
  download: DownloadTask | null
  update: UpdateInfo | null
}

const ACTIVE_STATUSES = new Set(['queued', 'downloading', 'paused', 'verifying', 'installing', 'failed'])

export function resolveGameState(
  game: Game | undefined,
  installation: Installation | null,
  download: DownloadTask | null,
  update: UpdateInfo | null,
  isRunning: boolean,
): GameState {
  const base = { installation, download, update }
  if (isRunning) return { ...base, phase: 'running' }
  if (download && ACTIVE_STATUSES.has(download.status)) {
    return { ...base, phase: download.status as GamePhase }
  }
  if (installation) {
    if (!installation.executableExists) return { ...base, phase: 'missing' }
    if (update) return { ...base, phase: 'update' }
    return { ...base, phase: 'installed' }
  }
  if (!game) return { ...base, phase: 'unavailable' }
  if (game.package) return { ...base, phase: 'installable' }
  if (game.pageUrl) return { ...base, phase: 'external' }
  return { ...base, phase: 'unavailable' }
}

export function latestDownloadFor(downloads: Record<string, DownloadTask>, gameId: string): DownloadTask | null {
  let latest: DownloadTask | null = null
  for (const task of Object.values(downloads)) {
    if (task.gameId !== gameId) continue
    if (!latest || task.createdAt > latest.createdAt) latest = task
  }
  return latest
}

export function useGameState(gameId: string): GameState & { game: Game | undefined } {
  const game = useLauncherStore((s) => s.catalog.find((g) => g.id === gameId))
  const installation = useLauncherStore((s) => s.library.find((i) => i.gameId === gameId) ?? null)
  const downloads = useLauncherStore((s) => s.downloads)
  const update = useLauncherStore((s) => s.updates.find((u) => u.gameId === gameId) ?? null)
  const isRunning = useLauncherStore((s) => s.running.includes(gameId))

  return useMemo(() => {
    const download = latestDownloadFor(downloads, gameId)
    return { game, ...resolveGameState(game, installation, download, update, isRunning) }
  }, [game, installation, downloads, update, isRunning, gameId])
}

export function sourceLabel(sourceId: string): string {
  switch (sourceId) {
    case 'opensource':
      return t('source.opensource')
    case 'freetp':
      return 'FreeTP'
    case 'local':
      return t('source.local')
    default:
      return sourceId
  }
}
