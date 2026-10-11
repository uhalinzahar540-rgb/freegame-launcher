import type {
  AppNotification,
  BackendEvent,
  DownloadTask,
  Game,
  Installation,
  LauncherUpdateInfo,
  PlayStats,
  Settings,
  SourceInfo,
  UpdateInfo,
  VerifyReport,
} from '@/types'

export interface Backend {
  readonly isDesktop: boolean
  readonly appVersion: string

  getCatalog(): Promise<Game[]>
  getSources(): Promise<SourceInfo[]>
  setSourceEnabled(sourceId: string, enabled: boolean): Promise<SourceInfo>
  refreshSource(sourceId: string): Promise<SourceInfo>

  getLibrary(): Promise<Installation[]>
  addManualGame(executablePath: string, title: string): Promise<Installation>
  setFavorite(gameId: string, favorite: boolean): Promise<void>
  uninstallGame(gameId: string): Promise<void>
  verifyGame(gameId: string): Promise<VerifyReport>
  getPlayStats(gameId: string): Promise<PlayStats>

  getDownloads(): Promise<DownloadTask[]>
  startInstall(gameId: string, installDir: string | null): Promise<DownloadTask>
  pauseDownload(id: string): Promise<void>
  resumeDownload(id: string): Promise<void>
  cancelDownload(id: string): Promise<void>
  retryDownload(id: string): Promise<void>
  clearFinishedDownloads(): Promise<void>

  launchGame(gameId: string): Promise<void>
  getRunningGames(): Promise<string[]>

  checkUpdates(): Promise<UpdateInfo[]>
  startUpdate(gameId: string): Promise<DownloadTask>
  checkLauncherUpdate(): Promise<LauncherUpdateInfo>

  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  getFreeSpace(path: string): Promise<number | null>

  getNotifications(): Promise<AppNotification[]>
  markNotificationsRead(): Promise<void>

  pickFolder(title: string): Promise<string | null>
  pickExecutable(): Promise<string | null>
  openExternal(url: string): Promise<void>
  openPath(path: string): Promise<void>

  onEvent(handler: (event: BackendEvent) => void): Promise<() => void>
}

export class DesktopOnlyError extends Error {
  constructor(action = 'Это действие') {
    super(`${action} доступно только в десктопной версии FreeGame Launcher.`)
    this.name = 'DesktopOnlyError'
  }
}

export function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'Неизвестная ошибка'
}
