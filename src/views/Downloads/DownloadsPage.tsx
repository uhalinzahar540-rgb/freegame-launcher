import { useMemo } from 'react'
import { Download, Gauge, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Cta, EmptyState, PageHeader } from '@/components/ui/primitives'
import { useT } from '@/i18n'
import { formatSpeed } from '@/lib/format'
import { backend } from '@/services'
import { useLauncherStore } from '@/stores/launcher-store'
import { DownloadRow } from './DownloadRow'

const ACTIVE = new Set(['queued', 'downloading', 'paused', 'verifying', 'installing', 'failed'])

export function DownloadsPage() {
  const t = useT()
  const navigate = useNavigate()
  const downloads = useLauncherStore((s) => s.downloads)
  const settings = useLauncherStore((s) => s.settings)
  const clearFinished = useLauncherStore((s) => s.clearFinishedDownloads)

  const { active, finished, totalSpeed } = useMemo(() => {
    const list = Object.values(downloads).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return {
      active: list.filter((d) => ACTIVE.has(d.status)),
      finished: list.filter((d) => !ACTIVE.has(d.status)),
      totalSpeed: list.filter((d) => d.status === 'downloading').reduce((sum, d) => sum + d.speedBps, 0),
    }
  }, [downloads])

  return (
    <div className="flex flex-col gap-8 p-6 lg:p-8">
      <PageHeader
        title={t('downloads.title')}
        description={t('downloads.description')}
        actions={
          finished.length > 0 && (
            <Cta variant="secondary" size="sm" onClick={() => clearFinished()}>
              <Trash2 aria-hidden /> {t('downloads.clear')}
            </Cta>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t('downloads.speed')} value={formatSpeed(totalSpeed)} highlight={totalSpeed > 0} />
        <Stat
          label={t('downloads.limit')}
          value={
            settings?.speedLimitKbps
              ? t('units.kbps', { value: settings.speedLimitKbps })
              : t('downloads.unlimited')
          }
        />
        <Stat label={t('downloads.concurrent')} value={String(settings?.maxConcurrentDownloads ?? '—')} />
      </div>

      <section aria-labelledby="active-dl" className="flex flex-col gap-3">
        <h2 id="active-dl" className="flex items-center gap-2 font-display text-lg font-semibold">
          <Gauge className="size-5 text-primary" aria-hidden /> {t('downloads.active')}
        </h2>
        {active.length === 0 ? (
          <EmptyState
            icon={<Download />}
            title={t('downloads.emptyTitle')}
            description={backend.isDesktop ? t('downloads.emptyDesktop') : t('downloads.emptyPreview')}
            action={<Cta onClick={() => navigate('/catalog')}>{t('downloads.goCatalog')}</Cta>}
          />
        ) : (
          active.map((task) => <DownloadRow key={task.id} task={task} />)
        )}
      </section>

      {finished.length > 0 && (
        <section aria-labelledby="done-dl" className="flex flex-col gap-3">
          <h2 id="done-dl" className="font-display text-lg font-semibold">
            {t('downloads.history')}
          </h2>
          {finished.map((task) => (
            <DownloadRow key={task.id} task={task} />
          ))}
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-xl font-semibold tabular-nums ${highlight ? 'text-primary-hover' : ''}`}>
        {value}
      </p>
    </div>
  )
}
