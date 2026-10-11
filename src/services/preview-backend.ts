import { DesktopOnlyError, type Backend } from './backend'
import type { Game, GamePackage, Settings, SourceInfo, SystemRequirements } from '@/types'

interface CatalogFileGame {
  slug: string
  title: string
  developer?: string
  shortDescription: string
  description: string
  genres: string[]
  coverUrl?: string
  heroUrl?: string
  screenshots?: string[]
  pageUrl?: string
  license?: string
  releaseDate?: string
  popularity?: number
  requirements?: SystemRequirements
  package?: GamePackage
}

interface CatalogFile {
  sourceId: string
  updatedAt: string
  games: CatalogFileGame[]
}

const DEFAULT_SETTINGS: Settings = {
  launchOnStartup: false,
  minimizeToTray: true,
  language: 'ru',
  notifications: true,
  downloadDir: 'C:\\Users\\Player\\AppData\\Local\\FreeGameLauncher\\downloads',
  speedLimitKbps: 0,
  maxConcurrentDownloads: 2,
  autoInstall: true,
  libraryDir: 'C:\\Games\\FreeGame Library',
  verifyAfterInstall: true,
  checkUpdatesOnStart: true,
  showPlaytime: true,
  animations: true,
  uiScale: 100,
  catalogUrl: '',
  launcherUpdateUrl: '',
}

/**
 * Used when the UI runs in a regular browser (e.g. the v0 preview). It can read the
 * bundled catalog, but every filesystem/process operation is rejected explicitly
 * instead of being simulated.
 */
export function createPreviewBackend(appVersion: string): Backend {
  let settings: Settings = { ...DEFAULT_SETTINGS }
  let catalogCache: Game[] | null = null
  let catalogError: string | null = null
  const enabled: Record<string, boolean> = { opensource: true, local: true, freetp: true }

  async function loadCatalog(): Promise<Game[]> {
    if (catalogCache) return catalogCache
    try {
      const res = await fetch('/catalog/opensource.json')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const file = (await res.json()) as CatalogFile
      catalogCache = file.games.map((g) => ({
        id: `${file.sourceId}:${g.slug}`,
        sourceId: file.sourceId,
        slug: g.slug,
        title: g.title,
        developer: g.developer ?? null,
        shortDescription: g.shortDescription,
        description: g.description,
        genres: g.genres,
        coverUrl: g.coverUrl ?? null,
        heroUrl: g.heroUrl ?? g.coverUrl ?? null,
        screenshots: g.screenshots ?? [],
        pageUrl: g.pageUrl ?? null,
        license: g.license ?? null,
        releaseDate: g.releaseDate ?? null,
        popularity: g.popularity ?? 0,
        requirements: g.requirements ?? null,
        package: g.package ?? null,
        createdAt: file.updatedAt,
        updatedAt: g.releaseDate ? `${g.releaseDate}T00:00:00Z` : file.updatedAt,
      }))
      catalogError = null
      return catalogCache
    } catch (error) {
      catalogError = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  function sources(): SourceInfo[] {
    const count = catalogCache?.length ?? 0
    return [
      {
        id: 'opensource',
        name: 'Открытые игры',
        kind: 'http',
        homepage: null,
        enabled: enabled.opensource,
        status: !enabled.opensource ? 'disabled' : catalogError ? 'error' : 'online',
        statusMessage: catalogError
          ? `Каталог недоступен: ${catalogError}`
          : 'Встроенный каталог открытых игр с проверенными SHA-256.',
        lastSync: null,
        gameCount: enabled.opensource ? count : 0,
        capabilities: { search: true, metadata: true, autoInstall: true, openPage: true, updates: true },
      },
      {
        id: 'local',
        name: 'Локальные игры',
        kind: 'local',
        homepage: null,
        enabled: enabled.local,
        status: enabled.local ? 'limited' : 'disabled',
        statusMessage: 'Добавление игр с диска работает только в десктопной версии.',
        lastSync: null,
        gameCount: 0,
        capabilities: { search: true, metadata: false, autoInstall: false, openPage: false, updates: false },
      },
      {
        id: 'freetp',
        name: 'FreeTP',
        kind: 'freetp',
        homepage: 'https://freetp.org/',
        enabled: enabled.freetp,
        status: enabled.freetp ? 'limited' : 'disabled',
        statusMessage:
          'В браузере каталог недоступен (сайт не разрешает CORS). Десктопная версия читает публичную RSS-ленту; загрузка через FreeTP не поддерживается.',
        lastSync: null,
        gameCount: 0,
        capabilities: { search: true, metadata: true, autoInstall: false, openPage: true, updates: false },
      },
    ]
  }

  const desktopOnly = (action: string) => () => Promise.reject(new DesktopOnlyError(action))

  return {
    isDesktop: false,
    appVersion,

    async getCatalog() {
      if (!enabled.opensource) return []
      return loadCatalog()
    },
    async getSources() {
      await loadCatalog().catch(() => undefined)
      return sources()
    },
    async setSourceEnabled(sourceId, value) {
      enabled[sourceId] = value
      return sources().find((s) => s.id === sourceId)!
    },
    async refreshSource(sourceId) {
      if (sourceId === 'opensource') {
        catalogCache = null
        await loadCatalog().catch(() => undefined)
      }
      return sources().find((s) => s.id === sourceId)!
    },

    getLibrary: async () => [],
    addManualGame: desktopOnly('Добавление игры с диска'),
    setFavorite: desktopOnly('Избранное'),
    uninstallGame: desktopOnly('Удаление игры'),
    verifyGame: desktopOnly('Проверка файлов'),
    getPlayStats: async (gameId) => ({ gameId, totalSeconds: 0, sessionCount: 0, sessions: [] }),

    getDownloads: async () => [],
    startInstall: desktopOnly('Загрузка и установка'),
    pauseDownload: desktopOnly('Пауза загрузки'),
    resumeDownload: desktopOnly('Продолжение загрузки'),
    cancelDownload: desktopOnly('Отмена загрузки'),
    retryDownload: desktopOnly('Повтор загрузки'),
    clearFinishedDownloads: async () => undefined,

    launchGame: desktopOnly('Запуск игры'),
    getRunningGames: async () => [],

    checkUpdates: async () => [],
    startUpdate: desktopOnly('Обновление игры'),
    checkLauncherUpdate: async () => ({
      currentVersion: appVersion,
      configured: false,
      available: false,
      version: null,
      notes: null,
      message: 'Проверка обновлений лаунчера выполняется в десктопной версии.',
    }),

    getSettings: async () => settings,
    async updateSettings(patch) {
      settings = { ...settings, ...patch }
      return settings
    },
    getFreeSpace: async () => null,

    getNotifications: async () => [],
    markNotificationsRead: async () => undefined,

    pickFolder: desktopOnly('Выбор папки'),
    pickExecutable: desktopOnly('Выбор исполняемого файла'),
    async openExternal(url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    openPath: desktopOnly('Открытие папки'),

    onEvent: async () => () => undefined,
  }
}
