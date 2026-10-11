import { create } from 'zustand'
import { currentLanguage, detectLanguage, isLanguageCode, setLanguage, t } from '@/i18n'
import { applyTheme, isThemeId } from '@/lib/themes'
import { backend, errorMessage } from '@/services'
import type {
  AppNotification,
  BackendEvent,
  DownloadTask,
  Game,
  Installation,
  NotificationKind,
  Settings,
  SourceInfo,
  SteamAction,
  UpdateInfo,
  VerifyReport,
} from '@/types'

export interface Toast {
  id: number
  kind: NotificationKind
  title: string
  body?: string
}

interface LauncherState {
  initialized: boolean
  /** True once the settings request has settled (successfully or not). */
  settingsResolved: boolean
  catalog: Game[]
  catalogLoading: boolean
  catalogError: string | null
  sources: SourceInfo[]
  library: Installation[]
  downloads: Record<string, DownloadTask>
  running: string[]
  settings: Settings | null
  notifications: AppNotification[]
  updates: UpdateInfo[]
  updatesCheckedAt: string | null
  checkingUpdates: boolean
  toasts: Toast[]

  init(): Promise<void>
  loadCatalog(): Promise<void>
  loadLibrary(): Promise<void>
  loadSources(): Promise<void>
  loadDownloads(): Promise<void>

  install(gameId: string, installDir: string | null): Promise<boolean>
  pauseDownload(id: string): Promise<void>
  resumeDownload(id: string): Promise<void>
  cancelDownload(id: string): Promise<void>
  retryDownload(id: string): Promise<void>
  clearFinishedDownloads(): Promise<void>

  launch(gameId: string): Promise<void>
  openSteam(appId: number, action: SteamAction): Promise<void>
  uninstall(gameId: string): Promise<boolean>
  verify(gameId: string): Promise<VerifyReport | null>
  setFavorite(gameId: string, favorite: boolean): Promise<void>
  addManualGame(executablePath: string, title: string): Promise<boolean>

  checkUpdates(silent?: boolean): Promise<void>
  startUpdate(gameId: string): Promise<void>

  updateSettings(patch: Partial<Settings>): Promise<void>
  setSourceEnabled(sourceId: string, enabled: boolean): Promise<void>
  refreshSource(sourceId: string): Promise<void>
  markNotificationsRead(): Promise<void>

  toast(kind: NotificationKind, title: string, body?: string): void
  dismissToast(id: number): void
}

let toastCounter = 0
let unsubscribe: (() => void) | null = null

/**
 * Older desktop databases (and the Rust core until it learns the new fields) may return
 * settings without language/theme/onboarding values, so fill in safe defaults here.
 */
function normalizeSettings(raw: Settings | null): Settings | null {
  if (!raw) return null
  return {
    ...raw,
    language: isLanguageCode(raw.language) ? raw.language : detectLanguage(),
    theme: isThemeId(raw.theme) ? raw.theme : 'crimson',
    onboardingCompleted: raw.onboardingCompleted === true,
  }
}

function applyAppearance(settings: Settings | null) {
  if (!settings) return
  setLanguage(settings.language)
  applyTheme(settings.theme)
}

export const useLauncherStore = create<LauncherState>((set, get) => {
  async function attempt<T>(action: () => Promise<T>, failureTitle: () => string): Promise<T | undefined> {
    try {
      return await action()
    } catch (error) {
      get().toast('error', failureTitle(), errorMessage(error))
      return undefined
    }
  }

  function upsertDownload(task: DownloadTask) {
    set((state) => ({ downloads: { ...state.downloads, [task.id]: task } }))
  }

  function handleEvent(event: BackendEvent) {
    switch (event.type) {
      case 'download-progress': {
        const previous = get().downloads[event.task.id]
        upsertDownload(event.task)
        if (event.task.status === 'completed' && previous?.status !== 'completed') {
          void get().loadLibrary()
          set((state) => ({ updates: state.updates.filter((u) => u.gameId !== event.task.gameId) }))
        }
        break
      }
      case 'download-removed':
        set((state) => {
          const next = { ...state.downloads }
          delete next[event.id]
          return { downloads: next }
        })
        break
      case 'library-changed':
        void get().loadLibrary()
        break
      case 'catalog-changed':
        void get().loadCatalog()
        break
      case 'sources-changed':
        void get().loadSources()
        break
      case 'game-running':
        set((state) => ({
          running: event.running
            ? Array.from(new Set([...state.running, event.gameId]))
            : state.running.filter((id) => id !== event.gameId),
        }))
        if (!event.running) void get().loadLibrary()
        break
      case 'notification':
        set((state) => ({ notifications: [event.notification, ...state.notifications].slice(0, 100) }))
        if (get().settings?.notifications !== false) {
          get().toast(event.notification.kind, event.notification.title, event.notification.body)
        }
        break
    }
  }

  return {
    initialized: false,
    settingsResolved: false,
    catalog: [],
    catalogLoading: true,
    catalogError: null,
    sources: [],
    library: [],
    downloads: {},
    running: [],
    settings: null,
    notifications: [],
    updates: [],
    updatesCheckedAt: null,
    checkingUpdates: false,
    toasts: [],

    async init() {
      if (get().initialized) return
      set({ initialized: true })
      unsubscribe?.()
      unsubscribe = await backend.onEvent(handleEvent)

      const [rawSettings, running, notifications] = await Promise.all([
        backend.getSettings().catch(() => null),
        backend.getRunningGames().catch(() => []),
        backend.getNotifications().catch(() => []),
      ])
      const settings = normalizeSettings(rawSettings)
      applyAppearance(settings)
      set({ settings, running, notifications, settingsResolved: true })

      await Promise.all([get().loadCatalog(), get().loadLibrary(), get().loadSources(), get().loadDownloads()])

      if (settings?.checkUpdatesOnStart && backend.isDesktop) void get().checkUpdates(true)
    },

    async loadCatalog() {
      set({ catalogLoading: true })
      try {
        const catalog = await backend.getCatalog()
        set({ catalog, catalogError: null })
      } catch (error) {
        set({ catalogError: errorMessage(error) })
      } finally {
        set({ catalogLoading: false })
      }
    },
    async loadLibrary() {
      const library = await attempt(() => backend.getLibrary(), () => t('store.loadLibrary'))
      if (library) set({ library })
    },
    async loadSources() {
      const sources = await attempt(() => backend.getSources(), () => t('store.loadSources'))
      if (sources) set({ sources })
    },
    async loadDownloads() {
      const list = await attempt(() => backend.getDownloads(), () => t('store.loadDownloads'))
      if (list) set({ downloads: Object.fromEntries(list.map((d) => [d.id, d])) })
    },

    async install(gameId, installDir) {
      const task = await attempt(() => backend.startInstall(gameId, installDir), () => t('store.install'))
      if (!task) return false
      upsertDownload(task)
      return true
    },
    async pauseDownload(id) {
      await attempt(() => backend.pauseDownload(id), () => t('store.pause'))
    },
    async resumeDownload(id) {
      await attempt(() => backend.resumeDownload(id), () => t('store.resume'))
    },
    async cancelDownload(id) {
      await attempt(() => backend.cancelDownload(id), () => t('store.cancel'))
    },
    async retryDownload(id) {
      await attempt(() => backend.retryDownload(id), () => t('store.retry'))
    },
    async clearFinishedDownloads() {
      await attempt(() => backend.clearFinishedDownloads(), () => t('store.clear'))
      await get().loadDownloads()
    },

    async launch(gameId) {
      const ok = await attempt(() => backend.launchGame(gameId).then(() => true), () => t('store.launch'))
      if (ok) set((state) => ({ running: Array.from(new Set([...state.running, gameId])) }))
    },
    async openSteam(appId, action) {
      await attempt(() => backend.openSteam(appId, action).then(() => true), () => t('store.launch'))
    },
    async uninstall(gameId) {
      const ok = await attempt(() => backend.uninstallGame(gameId).then(() => true), () => t('store.uninstall'))
      if (!ok) return false
      await get().loadLibrary()
      get().toast('success', t('store.uninstalled'))
      return true
    },
    async verify(gameId) {
      const report = await attempt(() => backend.verifyGame(gameId), () => t('store.verifyFailed'))
      if (!report) return null
      if (report.ok) {
        get().toast('success', t('store.verifyOk'), t('store.verifyOkBody', { count: report.checkedFiles }))
      } else {
        get().toast(
          'warning',
          t('store.verifyProblems'),
          t('store.verifyProblemsBody', { missing: report.missing.length, modified: report.modified.length }),
        )
      }
      await get().loadLibrary()
      return report
    },
    async setFavorite(gameId, favorite) {
      const ok = await attempt(
        () => backend.setFavorite(gameId, favorite).then(() => true),
        () => t('store.favorite'),
      )
      if (ok) {
        set((state) => ({
          library: state.library.map((i) => (i.gameId === gameId ? { ...i, favorite } : i)),
        }))
      }
    },
    async addManualGame(executablePath, title) {
      const installation = await attempt(
        () => backend.addManualGame(executablePath, title),
        () => t('store.addGame'),
      )
      if (!installation) return false
      await Promise.all([get().loadLibrary(), get().loadCatalog()])
      get().toast('success', t('store.gameAdded'), installation.title)
      return true
    },

    async checkUpdates(silent = false) {
      set({ checkingUpdates: true })
      try {
        const updates = await backend.checkUpdates()
        set({ updates, updatesCheckedAt: new Date().toISOString() })
        if (!silent) {
          get().toast(
            updates.length ? 'info' : 'success',
            updates.length ? t('store.updatesAvailable', { count: updates.length }) : t('store.allUpToDate'),
          )
        }
      } catch (error) {
        if (!silent) get().toast('error', t('store.updatesFailed'), errorMessage(error))
      } finally {
        set({ checkingUpdates: false })
      }
    },
    async startUpdate(gameId) {
      const task = await attempt(() => backend.startUpdate(gameId), () => t('store.updateStart'))
      if (task) upsertDownload(task)
    },

    async updateSettings(patch) {
      const previous = get().settings
      const languageChanged = !!patch.language && patch.language !== currentLanguage()
      const optimistic = previous ? { ...previous, ...patch } : null
      if (optimistic) {
        set({ settings: optimistic })
        applyAppearance(optimistic)
      }
      const saved = normalizeSettings(
        (await attempt(() => backend.updateSettings(patch), () => t('store.settings'))) ?? null,
      )
      // Keep the optimistic value for fields the backend did not echo back (e.g. an older Rust core).
      const next = saved ? { ...saved, ...patch } : previous
      set({ settings: next })
      applyAppearance(next)
      if (languageChanged) {
        void get().loadSources()
        void get().loadCatalog()
      }
    },
    async setSourceEnabled(sourceId, enabled) {
      const source = await attempt(() => backend.setSourceEnabled(sourceId, enabled), () => t('store.sourceToggle'))
      if (!source) return
      set((state) => ({ sources: state.sources.map((s) => (s.id === sourceId ? source : s)) }))
      await get().loadCatalog()
    },
    async refreshSource(sourceId) {
      const source = await attempt(() => backend.refreshSource(sourceId), () => t('store.sourceRefresh'))
      if (!source) return
      set((state) => ({ sources: state.sources.map((s) => (s.id === sourceId ? source : s)) }))
      await get().loadCatalog()
      if (source.status === 'error' || source.status === 'offline') {
        get().toast('warning', t('store.sourceNotUpdated', { name: source.name }), source.statusMessage ?? undefined)
      } else {
        get().toast(
          'success',
          t('store.sourceUpdated', { name: source.name }),
          t('store.gamesCount', { count: source.gameCount }),
        )
      }
    },
    async markNotificationsRead() {
      await attempt(() => backend.markNotificationsRead(), () => t('store.notifications'))
      set((state) => ({ notifications: state.notifications.map((n) => ({ ...n, read: true })) }))
    },

    toast(kind, title, body) {
      const id = ++toastCounter
      set((state) => ({ toasts: [...state.toasts, { id, kind, title, body }].slice(-4) }))
      window.setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 4500)
    },
    dismissToast(id) {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    },
  }
})
