import { useEffect, useState } from 'react'
import { Clock, History, TriangleAlert } from 'lucide-react'
import { useT } from '@/i18n'
import { formatBytes, formatDate, formatDuration, formatRelative } from '@/lib/format'
import { backend } from '@/services'
import { useLauncherStore } from '@/stores/launcher-store'
import type { Installation, PlayStats } from '@/types'

export function InstallationPanel({ installation }: { installation: Installation }) {
  const t = useT()
  const showPlaytime = useLauncherStore((s) => s.settings?.showPlaytime ?? true)
  const isRunning = useLauncherStore((s) => s.running.includes(installation.gameId))
  const [stats, setStats] = useState<PlayStats | null>(null)

  useEffect(() => {
    let cancelled = false
    backend
      .getPlayStats(installation.gameId)
      .then((value) => !cancelled && setStats(value))
      .catch(() => !cancelled && setStats(null))
    return () => {
      cancelled = true
    }
  }, [installation.gameId, installation.playtimeSeconds, isRunning])

  return (
    <section aria-labelledby="install-info" className="flex flex-col gap-4">
      <h2 id="install-info" className="font-display text-lg font-semibold">
        {t('installation.title')}
      </h2>

      {!installation.executableExists && (
        <div className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p>{t('installation.missingExe')}</p>
        </div>
      )}

      <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
        <Cell label={t('installation.path')} value={installation.installPath} mono />
        <Cell label={t('installation.executable')} value={installation.executable} mono />
        <Cell label={t('installation.size')} value={formatBytes(installation.sizeBytes)} />
        <Cell label={t('installation.installed')} value={formatDate(installation.installedAt)} />
        {showPlaytime && (
          <Cell label={t('installation.playtime')} value={formatDuration(installation.playtimeSeconds)} />
        )}
        <Cell label={t('installation.lastPlayed')} value={formatRelative(installation.lastPlayedAt)} />
      </dl>

      {showPlaytime && stats && stats.sessions.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <p className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
            <History className="size-4 text-primary" aria-hidden /> {t('installation.sessions')}
            <span className="ms-auto text-xs font-normal text-muted-foreground">
              {t('installation.total', { count: stats.sessionCount })}
            </span>
          </p>
          <ul>
            {stats.sessions.slice(0, 8).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 text-sm last:border-0"
              >
                <span className="text-muted-foreground">{formatRelative(s.startedAt)}</span>
                <span className="flex items-center gap-1.5 tabular-nums">
                  <Clock className="size-3.5 text-muted-foreground" aria-hidden />
                  {s.endedAt ? formatDuration(s.durationSeconds) : t('installation.playingNow')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Cell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-sm font-medium break-all ${mono ? 'font-mono text-xs' : ''}`} data-selectable>
        {value}
      </dd>
    </div>
  )
}
