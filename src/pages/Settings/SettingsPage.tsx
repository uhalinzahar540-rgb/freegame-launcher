import { useState, type ReactNode } from 'react'
import { Download, FolderOpen, Gamepad2, Globe, Monitor, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { Badge, Cta, PageHeader, Switch } from '@/components/ui/primitives'
import { StatusDot } from '@/components/Sidebar'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { backend, errorMessage } from '@/services'
import { useLauncherStore } from '@/stores/launcher-store'
import type { Settings } from '@/types'

const SECTIONS = [
  { id: 'general', label: 'Общие', icon: SlidersHorizontal },
  { id: 'downloads', label: 'Загрузки', icon: Download },
  { id: 'games', label: 'Игры', icon: Gamepad2 },
  { id: 'interface', label: 'Интерфейс', icon: Monitor },
  { id: 'sources', label: 'Источники', icon: Globe },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

export function SettingsPage() {
  const settings = useLauncherStore((s) => s.settings)
  const updateSettings = useLauncherStore((s) => s.updateSettings)
  const [section, setSection] = useState<SectionId>('general')

  if (!settings) {
    return <div className="p-8 text-sm text-muted-foreground">Загрузка настроек…</div>
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => updateSettings({ [key]: value })

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <PageHeader title="Настройки" description="Изменения сохраняются автоматически в базе данных лаунчера." />

      <div className="flex gap-6 max-lg:flex-col">
        <nav aria-label="Разделы настроек" className="w-52 shrink-0 max-lg:w-full">
          <ul className="flex flex-col gap-1 max-lg:flex-row max-lg:overflow-x-auto">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSection(s.id)}
                  aria-current={section === s.id ? 'page' : undefined}
                  className={cn(
                    'flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
                    section === s.id
                      ? 'bg-primary/15 text-foreground ring-1 ring-primary/40'
                      : 'text-muted-foreground hover:bg-panel hover:text-foreground',
                  )}
                >
                  <s.icon className={cn('size-4', section === s.id && 'text-primary')} aria-hidden />
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {section === 'general' && (
            <Card title="Общие">
              <ToggleRow
                label="Запускать вместе с Windows"
                description="Лаунчер будет запускаться при входе в систему."
                checked={settings.launchOnStartup}
                onChange={(v) => set('launchOnStartup', v)}
              />
              <ToggleRow
                label="Сворачивать в трей"
                description="При закрытии окна лаунчер продолжит работу в области уведомлений, а загрузки не прервутся."
                checked={settings.minimizeToTray}
                onChange={(v) => set('minimizeToTray', v)}
              />
              <ToggleRow
                label="Уведомления"
                description="Сообщать о завершении загрузок, установок и ошибках."
                checked={settings.notifications}
                onChange={(v) => set('notifications', v)}
              />
              <Row label="Язык" description="Сейчас доступен только русский язык интерфейса.">
                <select
                  value={settings.language}
                  disabled
                  aria-label="Язык"
                  className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="ru">Русский</option>
                </select>
              </Row>
            </Card>
          )}

          {section === 'downloads' && (
            <Card title="Загрузки">
              <FolderRow label="Папка загрузок" value={settings.downloadDir} onChange={(v) => set('downloadDir', v)} />
              <Row
                label="Ограничение скорости"
                description="0 — без ограничений. Применяется ко всем активным загрузкам суммарно."
              >
                <NumberInput
                  value={settings.speedLimitKbps}
                  min={0}
                  max={1_000_000}
                  suffix="КБ/с"
                  onCommit={(v) => set('speedLimitKbps', v)}
                />
              </Row>
              <Row label="Одновременных загрузок" description="Остальные загрузки ожидают в очереди.">
                <NumberInput
                  value={settings.maxConcurrentDownloads}
                  min={1}
                  max={5}
                  onCommit={(v) => set('maxConcurrentDownloads', v)}
                />
              </Row>
              <ToggleRow
                label="Устанавливать автоматически"
                description="Распаковывать пакет сразу после успешной проверки SHA-256."
                checked={settings.autoInstall}
                onChange={(v) => set('autoInstall', v)}
              />
            </Card>
          )}

          {section === 'games' && (
            <Card title="Игры">
              <FolderRow
                label="Папка библиотеки"
                description="Новые игры устанавливаются сюда. Уже установленные игры не перемещаются."
                value={settings.libraryDir}
                onChange={(v) => set('libraryDir', v)}
              />
              <ToggleRow
                label="Проверять файлы после установки"
                description="Сохранять SHA-256 каждого файла для последующей проверки целостности."
                checked={settings.verifyAfterInstall}
                onChange={(v) => set('verifyAfterInstall', v)}
              />
              <ToggleRow
                label="Проверять обновления при запуске"
                checked={settings.checkUpdatesOnStart}
                onChange={(v) => set('checkUpdatesOnStart', v)}
              />
              <ToggleRow
                label="Показывать игровое время"
                checked={settings.showPlaytime}
                onChange={(v) => set('showPlaytime', v)}
              />
            </Card>
          )}

          {section === 'interface' && (
            <Card title="Интерфейс">
              <Row label="Тема" description="Фирменная красно-чёрная тема.">
                <Badge tone="primary">Красно-чёрная</Badge>
              </Row>
              <ToggleRow label="Анимации" checked={settings.animations} onChange={(v) => set('animations', v)} />
              <Row label="Масштаб интерфейса" description={`${settings.uiScale}%`}>
                <input
                  type="range"
                  min={80}
                  max={130}
                  step={5}
                  value={settings.uiScale}
                  onChange={(e) => set('uiScale', Number(e.target.value))}
                  aria-label="Масштаб интерфейса"
                  className="w-48 accent-primary"
                />
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
  const sources = useLauncherStore((s) => s.sources)
  const settings = useLauncherStore((s) => s.settings)!
  const { setSourceEnabled, refreshSource, updateSettings } = useLauncherStore.getState()
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [catalogUrl, setCatalogUrl] = useState(settings.catalogUrl)

  return (
    <>
      <Card title="Подключённые источники">
        {sources.map((source) => (
          <div key={source.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusDot status={source.status} />
                  <p className="text-sm font-semibold">{source.name}</p>
                  <Badge>{source.kind.toUpperCase()}</Badge>
                  <span className="text-xs text-muted-foreground">Игр: {source.gameCount}</span>
                </div>
                {source.statusMessage && (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{source.statusMessage}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={source.capabilities.autoInstall ? 'success' : 'default'}>
                    {source.capabilities.autoInstall ? 'Автоустановка' : 'Без автоустановки'}
                  </Badge>
                  {source.capabilities.updates && <Badge tone="success">Обновления</Badge>}
                  {source.capabilities.openPage && <Badge>Страницы игр</Badge>}
                  <Badge>Синхронизация: {formatRelative(source.lastSync)}</Badge>
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
                  Обновить
                </Cta>
                <Switch
                  checked={source.enabled}
                  onChange={(v) => setSourceEnabled(source.id, v)}
                  label={`Источник ${source.name}`}
                />
              </div>
            </div>
          </div>
        ))}
      </Card>

      <Card title="Дополнительный каталог">
        <div className="flex flex-col gap-2 py-1">
          <p className="text-xs leading-relaxed text-muted-foreground">
            URL JSON-манифеста в формате FreeGame (HTTPS). Если рядом опубликован файл подписи{' '}
            <code className="font-mono">.sig</code> (Ed25519), он проверяется открытым ключом сборки.
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={catalogUrl}
              onChange={(e) => setCatalogUrl(e.target.value)}
              placeholder="https://example.org/catalog.json"
              aria-label="URL каталога"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary/70"
            />
            <Cta
              variant="secondary"
              onClick={async () => {
                await updateSettings({ catalogUrl: catalogUrl.trim() })
                await refreshSource('opensource')
              }}
            >
              Сохранить
            </Cta>
          </div>
        </div>
      </Card>
    </>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card">
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
              toast('error', 'Не удалось выбрать папку', errorMessage(error))
            }
          }}
        >
          <FolderOpen aria-hidden /> Изменить
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
        className="h-9 w-28 rounded-lg border border-border bg-background px-3 text-right text-sm tabular-nums outline-none focus:border-primary/70"
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </label>
  )
}
