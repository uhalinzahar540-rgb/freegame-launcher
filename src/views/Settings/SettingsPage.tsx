import { useState, type ReactNode } from 'react'
import {
  Download,
  FolderOpen,
  Gamepad2,
  Globe,
  Monitor,
  RefreshCw,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react'
import { StatusDot } from '@/components/Sidebar'
import { ThemePicker } from '@/components/ThemePicker'
import { Badge, Cta, PageHeader, Switch } from '@/components/ui/primitives'
import { isLanguageCode, LANGUAGES, useT, type MessageKey } from '@/i18n'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { backend, errorMessage } from '@/services'
import { useLauncherStore } from '@/stores/launcher-store'
import type { Settings } from '@/types'

const SECTIONS: { id: string; label: MessageKey; icon: typeof Download }[] = [
  { id: 'general', label: 'settings.general', icon: SlidersHorizontal },
  { id: 'downloads', label: 'settings.downloads', icon: Download },
  { id: 'games', label: 'settings.games', icon: Gamepad2 },
  { id: 'interface', label: 'settings.interface', icon: Monitor },
  { id: 'sources', label: 'settings.sources', icon: Globe },
]

type SectionId = 'general' | 'downloads' | 'games' | 'interface' | 'sources'

export function SettingsPage() {
  const t = useT()
  const settings = useLauncherStore((s) => s.settings)
  const updateSettings = useLauncherStore((s) => s.updateSettings)
  const [section, setSection] = useState<SectionId>('general')

  if (!settings) {
    return <div className="p-8 text-sm text-muted-foreground">{t('settings.loading')}</div>
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => updateSettings({ [key]: value })

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <PageHeader title={t('settings.title')} description={t('settings.description')} />

      <div className="flex gap-6 max-lg:flex-col">
        <nav aria-label={t('settings.sections')} className="w-52 shrink-0 max-lg:w-full">
          <ul className="flex flex-col gap-1 max-lg:flex-row max-lg:overflow-x-auto">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSection(s.id as SectionId)}
                  aria-current={section === s.id ? 'page' : undefined}
                  className={cn(
                    'flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
                    section === s.id
                      ? 'bg-primary/15 text-foreground ring-1 ring-primary/40'
                      : 'text-muted-foreground hover:bg-panel hover:text-foreground',
                  )}
                >
                  <s.icon className={cn('size-4', section === s.id && 'text-primary')} aria-hidden />
                  {t(s.label)}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {section === 'general' && (
            <Card title={t('settings.general')}>
              <Row label={t('settings.language')} description={t('settings.languageDescription')}>
                <select
                  value={settings.language}
                  onChange={(e) => isLanguageCode(e.target.value) && set('language', e.target.value)}
                  aria-label={t('settings.language')}
                  className="h-9 min-w-44 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/70"
                >
                  {LANGUAGES.map((language) => (
                    <option key={language.code} value={language.code} lang={language.code}>
                      {language.native}
                      {language.native !== language.english ? ` — ${language.english}` : ''}
                    </option>
                  ))}
                </select>
              </Row>
              <ToggleRow
                label={t('settings.startup')}
                description={t('settings.startupDescription')}
                checked={settings.launchOnStartup}
                onChange={(v) => set('launchOnStartup', v)}
              />
              <ToggleRow
                label={t('settings.tray')}
                description={t('settings.trayDescription')}
                checked={settings.minimizeToTray}
                onChange={(v) => set('minimizeToTray', v)}
              />
              <ToggleRow
                label={t('settings.notifications')}
                description={t('settings.notificationsDescription')}
                checked={settings.notifications}
                onChange={(v) => set('notifications', v)}
              />
            </Card>
          )}

          {section === 'downloads' && (
            <Card title={t('settings.downloads')}>
              <FolderRow
                label={t('settings.downloadDir')}
                value={settings.downloadDir}
                onChange={(v) => set('downloadDir', v)}
              />
              <Row label={t('settings.speedLimit')} description={t('settings.speedLimitDescription')}>
                <NumberInput
                  value={settings.speedLimitKbps}
                  min={0}
                  max={1_000_000}
                  suffix={t('settings.kbps')}
                  onCommit={(v) => set('speedLimitKbps', v)}
                />
              </Row>
              <Row label={t('settings.concurrent')} description={t('settings.concurrentDescription')}>
                <NumberInput
                  value={settings.maxConcurrentDownloads}
                  min={1}
                  max={5}
                  onCommit={(v) => set('maxConcurrentDownloads', v)}
                />
              </Row>
              <ToggleRow
                label={t('settings.autoInstall')}
                description={t('settings.autoInstallDescription')}
                checked={settings.autoInstall}
                onChange={(v) => set('autoInstall', v)}
              />
            </Card>
          )}

          {section === 'games' && (
            <Card title={t('settings.games')}>
              <FolderRow
                label={t('settings.libraryDir')}
                description={t('settings.libraryDirDescription')}
                value={settings.libraryDir}
                onChange={(v) => set('libraryDir', v)}
              />
              <ToggleRow
                label={t('settings.verify')}
                description={t('settings.verifyDescription')}
                checked={settings.verifyAfterInstall}
                onChange={(v) => set('verifyAfterInstall', v)}
              />
              <ToggleRow
                label={t('settings.checkUpdates')}
                checked={settings.checkUpdatesOnStart}
                onChange={(v) => set('checkUpdatesOnStart', v)}
              />
              <ToggleRow
                label={t('settings.playtime')}
                checked={settings.showPlaytime}
                onChange={(v) => set('showPlaytime', v)}
              />
            </Card>
          )}

          {section === 'interface' && (
            <Card title={t('settings.interface')}>
              <div className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{t('settings.theme')}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('settings.themeDescription')}</p>
                </div>
                <ThemePicker value={settings.theme} onChange={(v) => set('theme', v)} label={t('settings.theme')} />
              </div>
              <ToggleRow
                label={t('settings.animations')}
                checked={settings.animations}
                onChange={(v) => set('animations', v)}
              />
              <Row label={t('settings.scale')} description={`${settings.uiScale}%`}>
                <input
                  type="range"
                  min={80}
                  max={130}
                  step={5}
                  value={settings.uiScale}
                  onChange={(e) => set('uiScale', Number(e.target.value))}
                  aria-label={t('settings.scale')}
                  className="w-48 accent-primary"
                />
              </Row>
              <Row label={t('settings.welcome')} description={t('settings.welcomeDescription')}>
                <Cta variant="secondary" size="sm" onClick={() => set('onboardingCompleted', false)}>
                  <Sparkles aria-hidden /> {t('settings.welcomeOpen')}
                </Cta>
              </Row>
            </Card>
          )}

          {section === 'sources' && <SourcesSection />}
        </div>
      </div>
    </div>
  )
}

function SourcesSection() {
  const t = useT()
  const sources = useLauncherStore((s) => s.sources)
  const settings = useLauncherStore((s) => s.settings)!
  const { setSourceEnabled, refreshSource, updateSettings } = useLauncherStore.getState()
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [catalogUrl, setCatalogUrl] = useState(settings.catalogUrl)

  return (
    <>
      <Card title={t('settings.connectedSources')}>
        {sources.map((source) => (
          <div key={source.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusDot status={source.status} />
                  <p className="text-sm font-semibold">{source.name}</p>
                  <Badge>{source.kind.toUpperCase()}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {t('store.gamesCount', { count: source.gameCount })}
                  </span>
                </div>
                {source.statusMessage && (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{source.statusMessage}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={source.capabilities.autoInstall ? 'success' : 'default'}>
                    {source.capabilities.autoInstall ? t('settings.capAutoInstall') : t('settings.capNoAutoInstall')}
                  </Badge>
                  {source.capabilities.updates && <Badge tone="success">{t('settings.capUpdates')}</Badge>}
                  {source.capabilities.openPage && <Badge>{t('settings.capPages')}</Badge>}
                  <Badge>{t('settings.synced', { when: formatRelative(source.lastSync) })}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Cta
                  size="sm"
                  variant="secondary"
                  disabled={!source.enabled || refreshing === source.id || source.kind === 'local'}
                  onClick={async () => {
                    setRefreshing(source.id)
                    await refreshSource(source.id)
                    setRefreshing(null)
                  }}
                >
                  <RefreshCw className={refreshing === source.id ? 'animate-spin' : ''} aria-hidden />
                  {t('settings.refresh')}
                </Cta>
                <Switch
                  checked={source.enabled}
                  onChange={(v) => setSourceEnabled(source.id, v)}
                  label={t('settings.sourceToggle', { name: source.name })}
                />
              </div>
            </div>
          </div>
        ))}
      </Card>

      <Card title={t('settings.extraCatalog')}>
        <div className="flex flex-col gap-2 py-1">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('settings.extraBefore')} <code className="font-mono">.sig</code> {t('settings.extraAfter')}
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={catalogUrl}
              onChange={(e) => setCatalogUrl(e.target.value)}
              placeholder="https://example.org/catalog.json"
              aria-label={t('settings.catalogUrl')}
              dir="ltr"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary/70"
            />
            <Cta
              variant="secondary"
              onClick={async () => {
                await updateSettings({ catalogUrl: catalogUrl.trim() })
                await refreshSource('opensource')
              }}
            >
              {t('common.save')}
            </Cta>
          </div>
        </div>
      </Card>
    </>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="manga-panel rounded-2xl border border-border bg-card">
      <h2 className="border-b border-border px-5 py-4 font-display text-sm font-semibold">{title}</h2>
      <div className="flex flex-col divide-y divide-border px-5 py-4">{children}</div>
    </section>
  )
}

function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Row label={label} description={description}>
      <Switch checked={checked} onChange={onChange} label={label} />
    </Row>
  )
}

function FolderRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description?: string
  value: string
  onChange: (v: string) => void
}) {
  const t = useT()
  const toast = useLauncherStore((s) => s.toast)
  return (
    <div className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="flex gap-2">
        <div
          className="flex h-10 min-w-0 flex-1 items-center rounded-lg border border-border bg-background px-3 font-mono text-xs"
          data-selectable
          dir="ltr"
        >
          <span className="truncate">{value}</span>
        </div>
        <Cta
          variant="secondary"
          onClick={async () => {
            try {
              const picked = await backend.pickFolder(label)
              if (picked) onChange(picked)
            } catch (error) {
              toast('error', t('common.pickFolderFailed'), errorMessage(error))
            }
          }}
        >
          <FolderOpen aria-hidden /> {t('common.change')}
        </Cta>
      </div>
    </div>
  )
}

function NumberInput({
  value,
  min,
  max,
  suffix,
  onCommit,
}: {
  value: number
  min: number
  max: number
  suffix?: string
  onCommit: (v: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const commit = () => {
    const n = Math.round(Number(draft))
    const clamped = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value
    setDraft(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }
  return (
    <label className="flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) commit()
        }}
        className="h-9 w-28 rounded-lg border border-border bg-background px-3 text-end text-sm tabular-nums outline-none focus:border-primary/70"
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </label>
  )
}
