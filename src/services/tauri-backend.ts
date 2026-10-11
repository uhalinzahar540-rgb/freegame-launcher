import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { openPath, openUrl } from '@tauri-apps/plugin-opener'
import { t } from '@/i18n'
import type { Backend } from './backend'
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

const EVENT_CHANNEL = 'fgl://event'

export function createTauriBackend(appVersion: string): Backend {
  return {
    isDesktop: true,
    appVersion,

    getCatalog: () => invoke<Game[]>('get_catalog'),
    getSources: () => invoke<SourceInfo[]>('get_sources'),
    setSourceEnabled: (sourceId, enabled) =>
      invoke<SourceInfo>('set_source_enabled', { sourceId, enabled }),
    refreshSource: (sourceId) => invoke<SourceInfo>('refresh_source', { sourceId }),

    getLibrary: () => invoke<Installation[]>('get_library'),
    addManualGame: (executablePath, title) =>
      invoke<Installation>('add_manual_game', { executablePath, title }),
    setFavorite: (gameId, favorite) => invoke<void>('set_favorite', { gameId, favorite }),
    uninstallGame: (gameId) => invoke<void>('uninstall_game', { gameId }),
    verifyGame: (gameId) => invoke<VerifyReport>('verify_game', { gameId }),
    getPlayStats: (gameId) => invoke<PlayStats>('get_play_stats', { gameId }),

    getDownloads: () => invoke<DownloadTask[]>('get_downloads'),
    startInstall: (gameId, installDir) =>
      invoke<DownloadTask>('start_install', { gameId, installDir }),
    pauseDownload: (id) => invoke<void>('pause_download', { id }),
    resumeDownload: (id) => invoke<void>('resume_download', { id }),
    cancelDownload: (id) => invoke<void>('cancel_download', { id }),
    retryDownload: (id) => invoke<void>('retry_download', { id }),
    clearFinishedDownloads: () => invoke<void>('clear_finished_downloads'),

    launchGame: (gameId) => invoke<void>('launch_game', { gameId }),
    getRunningGames: () => invoke<string[]>('get_running_games'),

    checkUpdates: () => invoke<UpdateInfo[]>('check_updates'),
    startUpdate: (gameId) => invoke<DownloadTask>('start_update', { gameId }),
    checkLauncherUpdate: () => invoke<LauncherUpdateInfo>('check_launcher_update'),

    getSettings: () => invoke<Settings>('get_settings'),
    updateSettings: (patch) => invoke<Settings>('update_settings', { patch }),
    getFreeSpace: (path) => invoke<number | null>('get_free_space', { path }),

    getNotifications: () => invoke<AppNotification[]>('get_notifications'),
    markNotificationsRead: () => invoke<void>('mark_notifications_read'),

    async pickFolder(title) {
      const result = await open({ directory: true, multiple: false, title })
      return typeof result === 'string' ? result : null
    },
    async pickExecutable() {
      const result = await open({
        directory: false,
        multiple: false,
        title: t('addGame.dialogTitle'),
        filters: [{ name: t('addGame.dialogFilter'), extensions: ['exe'] }],
      })
      return typeof result === 'string' ? result : null
    },
    openExternal: (url) => openUrl(url),
    openPath: (path) => openPath(path),
    openSteam: (appId, action) => invoke('steam_open', { appId, action }),
    browseSteam: (params) => invoke('steam_browse', { ...params }),
    getSteamGame: (appId) => invoke('steam_game', { appId }),

    async onEvent(handler) {
      return listen<BackendEvent>(EVENT_CHANNEL, (event) => handler(event.payload))
    },
  }
}
