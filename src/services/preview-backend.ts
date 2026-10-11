import { detectLanguage, isLanguageCode, t } from '@/i18n'
import { isThemeId } from '@/lib/themes'
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
  language: detectLanguage(),
  theme: 'crimson',
  onboardingCompleted: false,
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
 * The desktop build keeps settings in its JSON state file. In the browser preview there is no
 * database, so only the visual preferences chosen in the welcome wizard are kept
 * in localStorage — otherwise the wizard would reappear on every reload.
 */
const PREVIEW_PREFS_KEY = 'freegame-launcher:preview-prefs'
type PreviewPrefs = Pick<Settings, 'language' | 'theme' | 'onboardingCompleted'>

function loadPreviewPrefs(): Partial<PreviewPrefs> {
  try {
    const raw = window.localStorage.getItem(PREVIEW_PREFS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<PreviewPrefs>
    return {
      ...(isLanguageCode(parsed.language) && { language: parsed.language }),
      ...(isThemeId(parsed.theme) && { theme: parsed.theme }),
      ...(typeof parsed.onboardingCompleted === 'boolean' && { onboardingCompleted: parsed.onboardingCompleted }),
    }
  } catch {
    return {}
  }
}

function savePreviewPrefs({ language, theme, onboardingCompleted }: Settings) {
  try {
    window.localStorage.setItem(PREVIEW_PREFS_KEY, JSON.stringify({ language, theme, onboardingCompleted }))
  } catch {
    // Storage can be unavailable (private mode, sandboxed iframe); prefs then last for the session only.
  }
}

/**
 * Used when the UI runs in a regular browser (e.g. the v0 preview). It can read the
 * bundled catalog, but every filesystem/process operation is rejected explicitly
 * instead of being simulated.
 */
export function createPreviewBackend(appVersion: string): Backend {
  let settings: Settings = { ...DEFAULT_SETTINGS, ...loadPreviewPrefs() }
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
        name: t('source.opensource'),
        kind: 'http',
        homepage: null,
        enabled: enabled.opensource,
        status: !enabled.opensource ? 'disabled' : catalogError ? 'error' : 'online',
        statusMessage: catalogError
          ? t('preview.catalogUnavailable', { error: catalogError })
          : t('preview.opensourceStatus'),
        lastSync: null,
        gameCount: enabled.opensource ? count : 0,
        capabilities: { search: true, metadata: true, autoInstall: true, openPage: true, updates: true },
      },
      {
        id: 'local',
        name: t('source.localGames'),
        kind: 'local',
        homepage: null,
        enabled: enabled.local,
        status: enabled.local ? 'limited' : 'disabled',
        statusMessage: t('preview.localStatus'),
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
        statusMessage: t('preview.freetpStatus'),
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
    addManualGame: desktopOnly('addManualGame'),
    setFavorite: desktopOnly('setFavorite'),
    uninstallGame: desktopOnly('uninstallGame'),
    verifyGame: desktopOnly('verifyGame'),
    getPlayStats: async (gameId) => ({ gameId, totalSeconds: 0, sessionCount: 0, sessions: [] }),

    getDownloads: async () => [],
    startInstall: desktopOnly('startInstall'),
    pauseDownload: desktopOnly('pauseDownload'),
    resumeDownload: desktopOnly('resumeDownload'),
    cancelDownload: desktopOnly('cancelDownload'),
    retryDownload: desktopOnly('retryDownload'),
    clearFinishedDownloads: async () => undefined,

    launchGame: desktopOnly('launchGame'),
    getRunningGames: async () => [],

    checkUpdates: async () => [],
    startUpdate: desktopOnly('startUpdate'),
    checkLauncherUpdate: async () => ({
      currentVersion: appVersion,
      configured: false,
      available: false,
      version: null,
      notes: null,
      message: t('updates.launcherPreview'),
    }),

    getSettings: async () => settings,
    async updateSettings(patch) {
      settings = { ...settings, ...patch }
      savePreviewPrefs(settings)
      return settings
    },
    getFreeSpace: async () => null,

    getNotifications: async () => [],
    markNotificationsRead: async () => undefined,

    pickFolder: desktopOnly('pickFolder'),
    pickExecutable: desktopOnly('pickExecutable'),
    async openExternal(url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    openPath: desktopOnly('openPath'),

    onEvent: async () => () => undefined,
  }
}
