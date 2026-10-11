import { useEffect, useMemo, useState } from 'react'
import { Search, SearchX, X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { GameCard, GameCardSkeleton } from '@/components/GameCard'
import { Cta, EmptyState, PageHeader } from '@/components/ui/primitives'
import { useT, type MessageKey } from '@/i18n'
import { compareText } from '@/lib/format'
import { sourceLabel } from '@/lib/game-state'
import { cn } from '@/lib/utils'
import { useLauncherStore } from '@/stores/launcher-store'
import type { SteamSort } from '@/types'
import { SteamBrowser } from './SteamBrowser'

type SortKey = 'popular' | 'title' | 'new' | 'updated' | 'size'

const STEAM_SORT: Record<SortKey, SteamSort> = {
  popular: 'relevance',
  title: 'title',
  new: 'new',
  updated: 'relevance',
  size: 'relevance',
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

const SORTS: { value: SortKey; label: MessageKey }[] = [
  { value: 'popular', label: 'catalog.sortPopular' },
  { value: 'title', label: 'catalog.sortTitle' },
  { value: 'new', label: 'catalog.sortNew' },
  { value: 'updated', label: 'catalog.sortUpdated' },
  { value: 'size', label: 'catalog.sortSize' },
]

export function CatalogPage() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const catalog = useLauncherStore((s) => s.catalog)
  const loading = useLauncherStore((s) => s.catalogLoading)

  const query = params.get('q') ?? ''
  const genre = params.get('genre')
  const source = params.get('source')
  const installableOnly = params.get('installable') === '1'
  const onSaleOnly = params.get('sale') === '1'
  const sort = (params.get('sort') as SortKey) || 'popular'
  const steamEnabled = useLauncherStore((s) => s.sources.find((x) => x.id === 'steam')?.enabled ?? false)
  const steamQuery = useDebounced(query, 400)
  // The full Steam catalog is paged by the store, so it replaces the bundled Steam snapshot here.
  const showSteam = steamEnabled && (!source || source === 'steam') && !installableOnly && !genre
  const showLocal = source !== 'steam'

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const genres = useMemo(() => Array.from(new Set(catalog.flatMap((g) => g.genres))).sort(), [catalog])
  const sources = useMemo(() => Array.from(new Set(catalog.map((g) => g.sourceId))), [catalog])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = catalog.filter((g) => {
      if (genre && !g.genres.includes(genre)) return false
      if (source && g.sourceId !== source) return false
      if (showSteam && g.sourceId === 'steam') return false
      if (installableOnly && !g.package) return false
      if (onSaleOnly && !(g.store?.price && g.store.price.discountPercent > 0)) return false
      if (!q) return true
      return (
        g.title.toLowerCase().includes(q) ||
        g.shortDescription.toLowerCase().includes(q) ||
        (g.developer ?? '').toLowerCase().includes(q) ||
        g.genres.some((x) => x.toLowerCase().includes(q))
      )
    })
    const sorted = [...filtered]
    switch (sort) {
      case 'title':
        sorted.sort((a, b) => compareText(a.title, b.title))
        break
      case 'new':
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        break
      case 'updated':
        sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        break
      case 'size':
        sorted.sort((a, b) => (b.package?.sizeBytes ?? 0) - (a.package?.sizeBytes ?? 0))
        break
      default:
        sorted.sort((a, b) => b.popularity - a.popularity)
    }
    return sorted
  }, [catalog, query, genre, source, installableOnly, onSaleOnly, sort, showSteam])

  const hasStore = steamEnabled || catalog.some((g) => g.store)
  const hasFilters = !!(query || genre || source || installableOnly || onSaleOnly)

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <PageHeader title={t('catalog.title')} description={t('catalog.description')} />

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-4">
        <div className="flex flex-wrap gap-3">
          <label className="group flex h-10 min-w-64 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:border-primary/70">
            <Search className="size-4 text-muted-foreground group-focus-within:text-primary" aria-hidden />
            <span className="sr-only">{t('catalog.search')}</span>
            <input
              value={query}
              onChange={(e) => update('q', e.target.value)}
              placeholder={t('catalog.searchPlaceholder')}
              className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">{t('common.sort')}</span>
            <select
              value={sort}
              onChange={(e) => update('sort', e.target.value === 'popular' ? null : e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/70"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.label)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">{t('catalog.source')}</span>
            <select
              value={source ?? ''}
              onChange={(e) => update('source', e.target.value || null)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/70"
            >
              <option value="">{t('catalog.allSources')}</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {sourceLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            aria-pressed={installableOnly}
            onClick={() => update('installable', installableOnly ? null : '1')}
            className={cn(
              'h-10 rounded-lg border px-3 text-sm font-medium transition-colors',
              installableOnly
                ? 'border-primary bg-primary/15 text-foreground'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            {t('catalog.installableOnly')}
          </button>
          {hasStore && (
            <button
              type="button"
              aria-pressed={onSaleOnly}
              onClick={() => update('sale', onSaleOnly ? null : '1')}
              className={cn(
                'h-10 rounded-lg border px-3 text-sm font-medium transition-colors',
                onSaleOnly
                  ? 'border-primary bg-primary/15 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {t('catalog.onSale')}
            </button>
          )}
        </div>

        {genres.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('catalog.genres')}>
            {genres.map((g) => {
              const active = g === genre
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update('genre', active ? null : g)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-all',
                    active
                      ? 'border-primary bg-primary text-primary-foreground shadow-glow'
                      : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                  )}
                >
                  {g}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {showLocal && (
        <section aria-labelledby={showSteam ? 'local-games' : undefined} className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <div className="flex items-baseline gap-3">
              {showSteam && (
                <h2 id="local-games" className="font-display text-xl font-bold text-foreground">
                  {t('catalog.localGames')}
                </h2>
              )}
              <p>
                {t('catalog.found')} <span className="font-semibold text-foreground tabular-nums">{results.length}</span>
              </p>
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={() => setParams(new URLSearchParams(), { replace: true })}
                className="flex items-center gap-1 hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden /> {t('catalog.reset')}
              </button>
            )}
          </div>

          {loading && catalog.length === 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <GameCardSkeleton key={i} />
              ))}
            </div>
          ) : results.length === 0 ? (
            showSteam ? null : (
              <EmptyState
                icon={<SearchX />}
                title={t('common.nothingFound')}
                description={t('catalog.emptyDescription')}
                action={
                  hasFilters ? (
                    <Cta variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                      {t('catalog.reset')}
                    </Cta>
                  ) : undefined
                }
              />
            )
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
              {results.map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
            </div>
          )}
        </section>
      )}

      {showSteam && <SteamBrowser query={steamQuery} sort={STEAM_SORT[sort]} onSale={onSaleOnly} />}
    </div>
  )
}
