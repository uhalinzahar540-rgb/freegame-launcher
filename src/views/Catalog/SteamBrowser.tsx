import { useEffect, useRef } from 'react'
import { RotateCw } from 'lucide-react'
import useSWRInfinite from 'swr/infinite'
import { GameCard, GameCardSkeleton } from '@/components/GameCard'
import { Cta } from '@/components/ui/primitives'
import { useT } from '@/i18n'
import { backend, errorMessage } from '@/services'
import { useLauncherStore } from '@/stores/launcher-store'
import type { SteamPage, SteamSort } from '@/types'

const PAGE_SIZE = 48

interface SteamBrowserProps {
  query: string
  sort: SteamSort
  onSale: boolean
}

/** Infinite grid over the full Steam store catalog (every game, paged by the store). */
export function SteamBrowser({ query, sort, onSale }: SteamBrowserProps) {
  const t = useT()
  const rememberSteamGames = useLauncherStore((s) => s.rememberSteamGames)
  const sentinel = useRef<HTMLDivElement>(null)

  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite<SteamPage>(
    (index, previous: SteamPage | null) => {
      if (previous && (previous.games.length === 0 || index * PAGE_SIZE >= previous.total)) return null
      return ['steam-browse', query.trim(), sort, onSale, index * PAGE_SIZE] as const
    },
    async ([, q, s, sale, start]: readonly [string, string, SteamSort, boolean, number]) => {
      const page = await backend.browseSteam({ query: q, start, sort: s, onSale: sale })
      rememberSteamGames(page.games)
      return page
    },
    { revalidateFirstPage: false, revalidateOnFocus: false, dedupingInterval: 60_000 },
  )

  const games = data?.flatMap((p) => p.games) ?? []
  const unique = games.filter((g, i) => games.findIndex((x) => x.id === g.id) === i)
  const total = data?.[0]?.total ?? 0
  const loadingMore = isValidating && (!data || data.length < size)
  const reachedEnd = !!data && (data[data.length - 1]?.games.length === 0 || games.length >= total)

  useEffect(() => {
    const node = sentinel.current
    if (!node || reachedEnd || error) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isValidating) void setSize((s) => s + 1)
      },
      { rootMargin: '800px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [reachedEnd, error, isValidating, setSize])

  return (
    <section aria-labelledby="steam-all" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="steam-all" className="font-display text-xl font-bold">
          {t('catalog.steamAll')}
        </h2>
        {data && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {t('catalog.steamCount', { count: total.toLocaleString() })}
          </p>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {unique.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
        {loadingMore && Array.from({ length: 8 }).map((_, i) => <GameCardSkeleton key={`s${i}`} />)}
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/60 p-6 text-center text-sm">
          <p className="text-muted-foreground">{t('catalog.steamError', { error: errorMessage(error) })}</p>
          <Cta variant="secondary" size="sm" onClick={() => void mutate()}>
            <RotateCw aria-hidden /> {t('catalog.retry')}
          </Cta>
        </div>
      ) : reachedEnd && unique.length > 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t('catalog.steamEnd')}</p>
      ) : (
        <div ref={sentinel} aria-hidden className="h-px" />
      )}
    </section>
  )
}
