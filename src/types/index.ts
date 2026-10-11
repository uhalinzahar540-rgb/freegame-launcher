import type { LanguageCode } from '@/i18n'
import type { ThemeId } from '@/lib/themes'

export type SourceKind = 'http' | 'local' | 'freetp'

export type SourceStatus = 'online' | 'limited' | 'offline' | 'error' | 'disabled' | 'unknown'

export interface SourceCapabilities {
  search: boolean
  metadata: boolean
  autoInstall: boolean
  openPage: boolean
  updates: boolean
}

export interface SourceInfo {
  id: string
  name: string
  kind: SourceKind
  homepage: string | null
  enabled: boolean
  status: SourceStatus
  statusMessage: string | null
  lastSync: string | null
  gameCount: number
  capabilities: SourceCapabilities
}

export interface SystemRequirements {
  os?: string | null
  cpu?: string | null
  ram?: string | null
  gpu?: string | null
  storage?: string | null
}

export type PackageFormat = 'zip' | '7z'

export interface GamePackage {
  version: string
  url: string
  sizeBytes: number
  sha256: string
  format: PackageFormat
  executable: string
}

export interface Game {
  id: string
  sourceId: string
  slug: string
  title: string
  developer: string | null
  shortDescription: string
  description: string
  genres: string[]
  coverUrl: string | null
  heroUrl: string | null
  screenshots: string[]
  pageUrl: string | null
  license: string | null
  releaseDate: string | null
  popularity: number
  requirements: SystemRequirements | null
  package: GamePackage | null
  createdAt: string
  updatedAt: string
}

export interface Installation {
  gameId: string
  title: string
  version: string | null
  installPath: string
  executable: string
  executableExists: boolean
  sizeBytes: number
  installedAt: string
  lastPlayedAt: string | null
  playtimeSeconds: number
  favorite: boolean
  manual: boolean
}

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'installing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface DownloadTask {
  id: string
  gameId: string
  title: string
  version: string
  kind: 'install' | 'update'
  status: DownloadStatus
  downloadedBytes: number
  totalBytes: number
  speedBps: number
  etaSeconds: number | null
  resumable: boolean
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface UpdateInfo {
  gameId: string
  title: string
  installedVersion: string | null
  availableVersion: string
  sizeBytes: number
  sourceId: string
}

export interface VerifyReport {
  gameId: string
  checkedFiles: number
  missing: string[]
  modified: string[]
  executableExists: boolean
  ok: boolean
}

export interface PlaySession {
  id: number
  gameId: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number
}

export interface PlayStats {
  gameId: string
  totalSeconds: number
  sessionCount: number
  sessions: PlaySession[]
}

export interface Settings {
  launchOnStartup: boolean
  minimizeToTray: boolean
  language: LanguageCode
  theme: ThemeId
  /** False until the first-run wizard (language + theme) is finished. */
  onboardingCompleted: boolean
  notifications: boolean
  downloadDir: string
  speedLimitKbps: number
  maxConcurrentDownloads: number
  autoInstall: boolean
  libraryDir: string
  verifyAfterInstall: boolean
  checkUpdatesOnStart: boolean
  showPlaytime: boolean
  animations: boolean
  uiScale: number
  catalogUrl: string
  launcherUpdateUrl: string
}

export type NotificationKind = 'info' | 'success' | 'warning' | 'error'

export interface AppNotification {
  id: number
  kind: NotificationKind
  title: string
  body: string
  gameId: string | null
  createdAt: string
  read: boolean
}

export interface LauncherUpdateInfo {
  currentVersion: string
  configured: boolean
  available: boolean
  version: string | null
  notes: string | null
  message: string | null
}

export type BackendEvent =
  | { type: 'download-progress'; task: DownloadTask }
  | { type: 'download-removed'; id: string }
  | { type: 'library-changed' }
  | { type: 'catalog-changed' }
  | { type: 'sources-changed' }
  | { type: 'game-running'; gameId: string; running: boolean }
  | { type: 'notification'; notification: AppNotification }
