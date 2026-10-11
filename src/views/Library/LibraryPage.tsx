import { useMemo, useState } from 'react'
import { Clock, FilePlus, Heart, Library, Search, TriangleAlert } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { GameActionButton } from '@/components/GameActionButton'
import { GameCover } from '@/components/GameCard'
import { Badge, Cta, EmptyState, PageHeader } from '@/components/ui/primitives'
import { useT } from '@/i18n'
import { compareText, formatBytes, formatDuration, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { backend } from '@/services'
import { useLauncherStore } from '@/stores/launcher-store'
import { AddGameDialog } from './AddGameDialog'

type SortKey = 'recent' | 'title' | 'playtime' | 'size' | 'installed'

export function LibraryPage() {
  const t = useT()
  const navigate = useNavigate()
  const library = useLauncherStore((s) => s.library)
  const catalog = useLauncherStore((s) => s.catalog)
  const showPlaytime = useLauncherStore((s) => s.settings?.showPlaytime ?? true)
  const setFavorite = useLauncherStore((s) => s.setFavorite)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const covers = useMemo(() => new Map(catalog.map((g) => [g.id, g.coverUrl])), [catalog])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = library.filter((i) => (!favoritesOnly || i.favorite) && (!q || i.title.toLowerCase().includes(q)))
    const sorted = [...list]
    switch (sort) {
      case 'title':
        sorted.sort((a, b) => compareText(a.title, b.title))
        break
      case 'playtime':
        sorted.sort((a, b) => b.playtimeSeconds - a.playtimeSeconds)
        break
      case 'size':
        sorted.sort((a, b) => b.sizeBytes - a.sizeBytes)
        break
      case 'installed':
        sorted.sort((a, b) => b.installedAt.localeCompare(a.installedAt))
        break
      default:
        sorted.sort((a, b) => (b.lastPlayedAt ?? b.installedAt).localeCompare(a.lastPlayedAt ?? a.installedAt))
    }
    return sorted
  }, [library, query, sort, favoritesOnly])

  const totalPlaytime = library.reduce((s, i) => s + i.playtimeSeconds, 0)
  const totalSize = library.reduce((s, i) => s + i.sizeBytes, 0)

  const summary = [
    t('library.summary', { count: library.length, size: formatBytes(totalSize) }),
    showPlaytime ? t('library.summaryPlaytime', { time: formatDuration(totalPlaytime) }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <PageHeader
        title={t('library.title')}
        description={library.length ? summary : t('library.descriptionEmpty')}
        actions={
          <Cta variant="secondary" onClick={() => setAddOpen(true)}>
            <FilePlus aria-hidden /> {t('library.add')}
          </Cta>
        }
      />

      {library.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <label className="group flex h-10 min-w-56 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 focus-within:border-primary/70">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">{t('library.search')}</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('library.search')}
              className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <select
            aria-label={t('common.sort')}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/70"
          >
            <option value="recent">{t('library.sortRecent')}</option>
            <option value="title">{t('catalog.sortTitle')}</option>
            <option value="playtime">{t('library.sortPlaytime')}</option>
            <option value="size">{t('catalog.sortSize')}</option>
            <option value="installed">{t('library.sortInstalled')}</option>
          </select>
          <button
            type="button"
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly((v) => !v)}
            className={cn(
              'flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
              favoritesOnly ? 'border-primary bg-primary/15' : 'border-border bg-card text-muted-foreground',
            )}
          >
            <Heart className={cn('size-4', favoritesOnly && 'fill-primary text-primary')} aria-hidden />{' '}
            {t('library.favorites')}
          </button>
        </div>
      )}

      {library.length === 0 ? (
        <EmptyState
          icon={<Library />}
          title={t('library.emptyTitle')}
          description={backend.isDesktop ? t('library.emptyDesktop') : t('library.emptyPreview')}
          action={<Cta onClick={() => navigate('/catalog')}>{t('common.openCatalog')}</Cta>}
        />
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t('common.nothingFound')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.gameId}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
            >
              <Link
                to={`/game/${encodeURIComponent(item.gameId)}`}
                className="w-32 shrink-0 overflow-hidden rounded-lg max-sm:w-20"
              >
                <GameCover src={covers.get(item.gameId) ?? null} title={item.title} className="aspect-video w-full" />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/game/${encodeURIComponent(item.gameId)}`}
                    className="truncate font-display text-sm font-semibold hover:text-primary-hover"
                  >
                    {item.title}
                  </Link>
                  {item.manual && <Badge>{t('library.manual')}</Badge>}
                  {!item.executableExists && (
                    <Badge tone="primary">
                      <TriangleAlert className="size-3" aria-hidden /> {t('library.filesMissing')}
                    </Badge>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                  {showPlaytime && (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" aria-hidden /> {formatDuration(item.playtimeSeconds)}
                    </span>
                  )}
                  <span>{t('library.lastLaunch', { when: formatRelative(item.lastPlayedAt) })}</span>
                  <span>{formatBytes(item.sizeBytes)}</span>
                  <span className="max-w-xs truncate font-mono" title={item.installPath}>
                    {item.installPath}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFavorite(item.gameId, !item.favorite)}
                aria-label={item.favorite ? t('common.favoriteRemove') : t('common.favoriteAdd')}
                aria-pressed={item.favorite}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:text-primary"
              >
                <Heart className={cn('size-4', item.favorite && 'fill-primary text-primary')} />
              </button>
              <GameActionButton gameId={item.gameId} size="sm" className="w-36" />
            </li>
          ))}
        </ul>
      )}

      <AddGameDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
