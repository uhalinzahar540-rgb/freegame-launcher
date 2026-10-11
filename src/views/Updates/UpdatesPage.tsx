import { useState } from 'react'
import { ArrowRight, CircleCheck, RefreshCw, Rocket } from 'lucide-react'
import { GameCover } from '@/components/GameCard'
import { Cta, EmptyState, PageHeader } from '@/components/ui/primitives'
import { useT } from '@/i18n'
import { formatBytes, formatRelative } from '@/lib/format'
import { backend, errorMessage } from '@/services'
import { useLauncherStore } from '@/stores/launcher-store'
import type { LauncherUpdateInfo } from '@/types'

export function UpdatesPage() {
  const t = useT()
  const updates = useLauncherStore((s) => s.updates)
  const checkedAt = useLauncherStore((s) => s.updatesCheckedAt)
  const checking = useLauncherStore((s) => s.checkingUpdates)
  const catalog = useLauncherStore((s) => s.catalog)
  const { checkUpdates, startUpdate, toast } = useLauncherStore.getState()
  const [launcherInfo, setLauncherInfo] = useState<LauncherUpdateInfo | null>(null)
  const [checkingLauncher, setCheckingLauncher] = useState(false)

  async function checkLauncher() {
    setCheckingLauncher(true)
    try {
      setLauncherInfo(await backend.checkLauncherUpdate())
    } catch (error) {
      toast('error', t('updates.launcherFailed'), errorMessage(error))
    } finally {
      setCheckingLauncher(false)
    }
  }

  return (
    <div className="flex flex-col gap-8 p-6 lg:p-8">
      <PageHeader
        title={t('updates.title')}
        description={t('updates.description')}
        actions={
          <Cta onClick={() => checkUpdates()} disabled={checking}>
            <RefreshCw className={checking ? 'animate-spin' : ''} aria-hidden />
            {checking ? t('common.checking') : t('updates.check')}
          </Cta>
        }
      />

      <section aria-labelledby="game-updates" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="game-updates" className="font-display text-lg font-semibold">
            {t('updates.games')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {checkedAt ? t('updates.checkedAt', { when: formatRelative(checkedAt) }) : t('updates.neverChecked')}
          </p>
        </div>

        {updates.length === 0 ? (
          <EmptyState
            icon={<CircleCheck />}
            title={checkedAt ? t('store.allUpToDate') : t('updates.checkPrompt')}
            description={backend.isDesktop ? t('updates.descriptionDesktop') : t('updates.descriptionPreview')}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {updates.map((u) => {
              const cover = catalog.find((g) => g.id === u.gameId)?.coverUrl ?? null
              return (
                <li key={u.gameId} className="flex items-center gap-4 rounded-xl border border-warning/30 bg-card p-3">
                  <div className="w-28 shrink-0 overflow-hidden rounded-lg">
                    <GameCover src={cover} title={u.title} className="aspect-video w-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold">{u.title}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                      {u.installedVersion ?? '—'}{' '}
                      <ArrowRight className="size-3 text-warning rtl:rotate-180" aria-hidden />
                      <span className="font-semibold text-warning">{u.availableVersion}</span>
                      <span>· {formatBytes(u.sizeBytes)}</span>
                    </p>
                  </div>
                  <Cta variant="warning" size="sm" onClick={() => startUpdate(u.gameId)}>
                    <RefreshCw aria-hidden /> {t('common.update')}
                  </Cta>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="launcher-update" className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <Rocket className="size-5" aria-hidden />
            </div>
            <div>
              <h2 id="launcher-update" className="font-display text-sm font-semibold">
                FreeGame Launcher
              </h2>
              <p className="text-xs text-muted-foreground">
                {t('updates.installedVersion', { version: backend.appVersion })}
              </p>
            </div>
          </div>
          <Cta variant="secondary" size="sm" onClick={checkLauncher} disabled={checkingLauncher}>
            <RefreshCw className={checkingLauncher ? 'animate-spin' : ''} aria-hidden /> {t('updates.checkShort')}
          </Cta>
        </div>
        {launcherInfo && (
          <p
            className={`mt-4 rounded-lg border p-3 text-sm ${
              launcherInfo.available
                ? 'border-warning/30 bg-warning/10 text-warning'
                : 'border-border bg-background/60 text-muted-foreground'
            }`}
          >
            {launcherInfo.available
              ? `${t('updates.available', { version: launcherInfo.version ?? '' })} ${launcherInfo.notes ?? ''}`
              : (launcherInfo.message ?? t('updates.latest'))}
          </p>
        )}
      </section>
    </div>
  )
}
