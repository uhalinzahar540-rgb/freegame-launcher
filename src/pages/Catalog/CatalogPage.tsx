import { useMemo } from 'react'
import { Search, SearchX, X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { GameCard, GameCardSkeleton } from '@/components/GameCard'
import { Cta, EmptyState, PageHeader } from '@/components/ui/primitives'
import { sourceLabel } from '@/lib/game-state'
import { cn } from '@/lib/utils'
import { useLauncherStore } from '@/stores/launcher-store'

type SortKey = 'popular' | 'title' | 'new' | 'updated' | 'size'

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'popular', label: 'По популярности' },
  { value: 'title', label: 'По названию' },
  { value: 'new', label: 'Недавно добавленные' },
  { value: 'updated', label: 'Недавно обновлённые' },
  { value: 'size', label: 'По размеру' },
]

export function CatalogPage() {
  const [params, setParams] = useSearchParams()
  const catalog = useLauncherStore((s) => s.catalog)
  const loading = useLauncherStore((s) => s.catalogLoading)

  const query = params.get('q') ?? ''
  const genre = params.get('genre')
  const source = params.get('source')
  const installableOnly = params.get('installable') === '1'
  const sort = (params.get('sort') as SortKey) || 'popular'

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
      if (installableOnly && !g.package) return false
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
        sorted.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
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
  }, [catalog, query, genre, source, installableOnly, sort])

  const hasFilters = !!(query || genre || source || installableOnly)

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <PageHeader
        title="Каталог"
        description="Игры из всех подключённых источников. Автоматическая установка доступна для пакетов с проверенной контрольной суммой."
      />

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-4">
        <div className="flex flex-wrap gap-3">
          <label className="group flex h-10 min-w-64 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:border-primary/70">
            <Search className="size-4 text-muted-foreground group-focus-within:text-primary" aria-hidden />
            <span className="sr-only">Поиск по каталогу</span>
            <input
              value={query}
              onChange={(e) => update('q', e.target.value)}
              placeholder="Название, жанр или разработчик"
              className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Сортировка</span>
            <select
              value={sort}
              onChange={(e) => update('sort', e.target.value === 'popular' ? null : e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/70"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Источник</span>
            <select
              value={source ?? ''}
              onChange={(e) => update('source', e.target.value || null)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/70"
            >
              <option value="">Все источники</option>
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
            Только с автоустановкой
          </button>
        </div>

        {genres.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Жанры">
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

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          Найдено: <span className="font-semibold text-foreground tabular-nums">{results.length}</span>
        </p>
        {hasFilters && (
          <button
            type="button"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
            className="flex items-center gap-1 hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden /> Сбросить фильтры
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
        <EmptyState
          icon={<SearchX />}
          title="Ничего не найдено"
          description="Попробуйте изменить запрос или сбросить фильтры."
          action={
            hasFilters ? (
              <Cta variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Сбросить фильтры
              </Cta>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {results.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      )}
    </div>
  )
}
