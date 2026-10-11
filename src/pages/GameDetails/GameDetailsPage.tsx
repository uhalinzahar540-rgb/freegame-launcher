import { useState } from 'react'
import {
  ArrowLeft,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  Heart,
  Info,
  Play,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { GameActionButton } from '@/components/GameActionButton'
import { GameCover } from '@/components/GameCard'
import { Modal } from '@/components/Modal'
import { Badge, Cta, EmptyState } from '@/components/ui/primitives'
import { formatBytes, formatDate } from '@/lib/format'
import { sourceLabel, useGameState } from '@/lib/game-state'
import { cn } from '@/lib/utils'
import { backend } from '@/services'
import { useLauncherStore } from '@/stores/launcher-store'
import { DownloadPanel } from './DownloadPanel'
import { InstallationPanel } from './InstallationPanel'

export function GameDetailsPage() {
  const { gameId = '' } = useParams()
  const id = decodeURIComponent(gameId)
  const navigate = useNavigate()
  const state = useGameState(id)
  const loading = useLauncherStore((s) => s.catalogLoading)
  const source = useLauncherStore((s) => s.sources.find((x) => x.id === state.game?.sourceId))
  const { verify, uninstall, setFavorite, launch } = useLauncherStore.getState()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const { game, installation, download, phase } = state

  if (!game && !installation) {
    return (
      <div className="p-6 lg:p-8">
        <EmptyState
          icon={<Gamepad2 />}
          title={loading ? 'Загрузка…' : 'Игра не найдена'}
          description={loading ? undefined : 'Возможно, источник отключён или игра удалена из каталога.'}
          action={
            <Cta variant="secondary" onClick={() => navigate('/catalog')}>
              В каталог
            </Cta>
          }
        />
      </div>
    )
  }

  const title = game?.title ?? installation?.title ?? ''
  const hero = game?.heroUrl ?? game?.coverUrl ?? null
  const requirements = game?.requirements
  const showDownload =
    download && ['queued', 'downloading', 'paused', 'verifying', 'installing', 'failed'].includes(download.status)

  async function runVerify() {
    setVerifying(true)
    await verify(id)
    setVerifying(false)
  }

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 -z-0 h-[480px] overflow-hidden" aria-hidden>
        {hero && <img src={hero} alt="" className="size-full scale-110 object-cover opacity-40 blur-2xl" />}
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
      </div>

      <div className="relative flex flex-col gap-8 p-6 lg:p-8">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Назад
        </button>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-2xl border border-border shadow-[0_30px_80px_-30px_rgba(229,9,20,0.5)]">
            <GameCover src={hero} title={title} className="aspect-video w-full" />
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              {game && <Badge tone="primary">{sourceLabel(game.sourceId)}</Badge>}
              {game?.genres.map((g) => (
                <Badge key={g}>{g}</Badge>
              ))}
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-balance lg:text-4xl">{title}</h1>
              {game?.developer && <p className="mt-2 text-sm text-muted-foreground">{game.developer}</p>}
            </div>
            {game?.shortDescription && <p className="text-pretty text-foreground/80">{game.shortDescription}</p>}

            <div className="flex flex-wrap items-center gap-2">
              <GameActionButton gameId={id} size="lg" />
              {phase === 'update' && (
                <Cta size="lg" variant="secondary" onClick={() => launch(id)}>
                  <Play className="fill-current" aria-hidden /> Играть
                </Cta>
              )}
              {installation && (
                <Cta
                  size="icon"
                  variant="secondary"
                  className="size-12"
                  aria-label={installation.favorite ? 'Убрать из избранного' : 'В избранное'}
                  aria-pressed={installation.favorite}
                  onClick={() => setFavorite(id, !installation.favorite)}
                >
                  <Heart className={cn(installation.favorite && 'fill-primary text-primary')} aria-hidden />
                </Cta>
              )}
            </div>

            {installation && (
              <div className="flex flex-wrap gap-2">
                <Cta size="sm" variant="secondary" onClick={runVerify} disabled={verifying || phase === 'running'}>
                  <ShieldCheck aria-hidden /> {verifying ? 'Проверка…' : 'Проверить файлы'}
                </Cta>
                <Cta size="sm" variant="secondary" onClick={() => backend.openPath(installation.installPath)}>
                  <FolderOpen aria-hidden /> Открыть папку
                </Cta>
                <Cta
                  size="sm"
                  variant="danger"
                  onClick={() => setConfirmRemove(true)}
                  disabled={phase === 'running'}
                >
                  <Trash2 aria-hidden /> Удалить
                </Cta>
              </div>
            )}

            {game && !game.package && !installation && (
              <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm">
                <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <p className="text-foreground/80">
                  {game.sourceId === 'freetp'
                    ? 'FreeTP не предоставляет API и разрешённых прямых ссылок, поэтому лаунчер показывает только описание. Подробности и файлы — на оригинальной странице сайта.'
                    : 'Источник не предоставляет пакет для автоматической установки.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {showDownload && download && <DownloadPanel task={download} />}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-8">
            {game?.description && (
              <section aria-labelledby="about">
                <h2 id="about" className="mb-3 font-display text-lg font-semibold">
                  Об игре
                </h2>
                <p className="leading-relaxed text-pretty whitespace-pre-line text-foreground/80" data-selectable>
                  {game.description}
                </p>
              </section>
            )}

            {game && game.screenshots.length > 0 && (
              <section aria-labelledby="shots">
                <h2 id="shots" className="mb-3 font-display text-lg font-semibold">
                  Скриншоты
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {game.screenshots.map((src, i) => (
                    <img
                      key={src}
                      src={src}
                      alt={`Скриншот ${i + 1} — ${title}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="aspect-video w-full rounded-xl border border-border object-cover"
                    />
                  ))}
                </div>
              </section>
            )}

            {requirements && (
              <section aria-labelledby="reqs">
                <h2 id="reqs" className="mb-3 font-display text-lg font-semibold">
                  Системные требования
                </h2>
                <dl className="grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2">
                  {(
                    [
                      ['ОС', requirements.os],
                      ['Процессор', requirements.cpu],
                      ['Память', requirements.ram],
                      ['Видеокарта', requirements.gpu],
                      ['Место на диске', requirements.storage],
                    ] as const
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className="border-b border-border p-4 last:border-0 sm:odd:border-r">
                        <dt className="text-xs text-muted-foreground">{k}</dt>
                        <dd className="mt-1 text-sm font-medium">{v}</dd>
                      </div>
                    ))}
                </dl>
              </section>
            )}

            {installation && <InstallationPanel installation={installation} />}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-4 font-display text-sm font-semibold">Информация</h2>
              <dl className="flex flex-col gap-3 text-sm">
                <InfoRow label="Источник" value={source?.name ?? (game ? sourceLabel(game.sourceId) : 'Локальная')} />
                {game?.package && <InfoRow label="Версия" value={game.package.version} />}
                {installation?.version && <InfoRow label="Установлена версия" value={installation.version} />}
                {game?.package && <InfoRow label="Размер загрузки" value={formatBytes(game.package.sizeBytes)} />}
                {game?.package && <InfoRow label="Формат пакета" value={game.package.format.toUpperCase()} />}
                {game?.license && <InfoRow label="Лицензия" value={game.license} />}
                {game?.releaseDate && <InfoRow label="Дата выпуска" value={formatDate(game.releaseDate)} />}
                <InfoRow
                  label="Автоустановка"
                  value={game?.package ? 'Поддерживается' : 'Не поддерживается'}
                  tone={game?.package ? 'success' : 'muted'}
                />
              </dl>
              {game?.package && (
                <div className="mt-4 rounded-lg border border-border bg-background/60 p-3">
                  <p className="text-[11px] text-muted-foreground">SHA-256</p>
                  <p className="mt-1 font-mono text-[11px] break-all text-foreground/80" data-selectable>
                    {game.package.sha256}
                  </p>
                </div>
              )}
              {game?.pageUrl && (
                <Cta
                  variant="secondary"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={() => backend.openExternal(game.pageUrl!)}
                >
                  <ExternalLink aria-hidden />
                  {game.sourceId === 'freetp' ? 'Открыть на FreeTP' : 'Официальная страница'}
                </Cta>
              )}
            </div>
          </aside>
        </div>
      </div>

      <Modal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={`Удалить ${title}?`}
        description={
          installation?.manual
            ? 'Игра будет убрана из библиотеки. Файлы на диске останутся нетронутыми.'
            : 'Папка игры будет удалена с диска. Сохранения внутри папки игры также будут удалены.'
        }
        footer={
          <>
            <Cta variant="ghost" onClick={() => setConfirmRemove(false)}>
              Отмена
            </Cta>
            <Cta
              onClick={async () => {
                const ok = await uninstall(id)
                if (ok) setConfirmRemove(false)
              }}
            >
              <Trash2 aria-hidden /> Удалить
            </Cta>
          </>
        }
      >
        {installation && (
          <p className="rounded-lg border border-border bg-background p-3 font-mono text-xs break-all" data-selectable>
            {installation.installPath}
          </p>
        )}
      </Modal>
    </div>
  )
}

function InfoRow({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'muted' }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'text-right font-medium',
          tone === 'success' && 'text-success',
          tone === 'muted' && 'text-muted-foreground',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
