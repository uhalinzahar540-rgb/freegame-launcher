import { useMemo } from 'react'
import { Info, LayoutGrid, WifiOff } from 'lucide-react'
import { Link } from 'react-router'
import { GameCard, GameCardSkeleton } from '@/components/GameCard'
import { SectionRow } from '@/components/SectionRow'
import { Cta, ctaVariants, EmptyState } from '@/components/ui/primitives'
import { backend } from '@/services'
import { useLauncherStore } from '@/stores/launcher-store'
import type { Game } from '@/types'
import { HeroBanner } from './HeroBanner'

const ROW_SIZE = 4

export function HomePage() {
  const catalog = useLauncherStore((s) => s.catalog)
  const library = useLauncherStore((s) => s.library)
  const loading = useLauncherStore((s) => s.catalogLoading)
  const error = useLauncherStore((s) => s.catalogError)
  const loadCatalog = useLauncherStore((s) => s.loadCatalog)

  const rows = useMemo(() => {
    const byId = new Map(catalog.map((g) => [g.id, g]))
    const fromLibrary = (sortKey: 'lastPlayedAt' | 'installedAt') =>
      [...library]
        .filter((i) => i[sortKey])
        .sort((a, b) => (b[sortKey] ?? '').localeCompare(a[sortKey] ?? ''))
        .map((i) => byId.get(i.gameId))
        .filter((g): g is Game => !!g)
        .slice(0, ROW_SIZE)

    const remote = catalog.filter((g) => g.sourceId !== 'local')
    return {
      featured: [...remote].filter((g) => g.heroUrl).sort((a, b) => b.popularity - a.popularity).slice(0, 4),
      continuePlaying: fromLibrary('lastPlayedAt'),
      popular: [...remote].sort((a, b) => b.popularity - a.popularity).slice(0, ROW_SIZE),
      recentlyAdded: [...remote].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, ROW_SIZE),
      recentlyUpdated: [...remote].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, ROW_SIZE),
      recentInstalls: fromLibrary('installedAt'),
      freetp: remote.filter((g) => g.sourceId === 'freetp').slice(0, ROW_SIZE),
    }
  }, [catalog, library])

  if (loading && catalog.length === 0) {
    return (
      <div className="flex flex-col gap-8 p-6 lg:p-8">
        <div className="aspect-[21/8] animate-shimmer rounded-2xl bg-[linear-gradient(90deg,#171717_0%,#232323_40%,#2b1414_50%,#232323_60%,#171717_100%)] bg-[length:200%_100%]" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <GameCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (error && catalog.length === 0) {
    return (
      <div className="p-6 lg:p-8">
        <EmptyState
          icon={<WifiOff />}
          title="Каталог недоступен"
          description={error}
          action={<Cta onClick={() => loadCatalog()}>Повторить</Cta>}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10 p-6 lg:p-8">
      {rows.featured.length > 0 && <HeroBanner games={rows.featured} />}

      {!backend.isDesktop && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Это браузерный предпросмотр интерфейса.</span> Каталог
            читается из встроенного манифеста, а загрузка, установка, запуск и учёт игрового времени выполняются
            Rust-ядром в Windows-приложении. Соберите его командой{' '}
            <code className="rounded bg-panel px-1.5 py-0.5 font-mono text-xs text-foreground">pnpm desktop:build</code>.
          </p>
        </div>
      )}

      {rows.continuePlaying.length > 0 && (
        <SectionRow title="Продолжить играть" href="/library">
          {rows.continuePlaying.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </SectionRow>
      )}

      <SectionRow title="Популярные игры" href="/catalog">
        {rows.popular.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </SectionRow>

      <SectionRow title="Недавно добавленные" href="/catalog?sort=new">
        {rows.recentlyAdded.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </SectionRow>

      <SectionRow title="Недавно обновлённые" href="/catalog?sort=updated">
        {rows.recentlyUpdated.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </SectionRow>

      {rows.recentInstalls.length > 0 && (
        <SectionRow title="Последние установки" href="/library">
          {rows.recentInstalls.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </SectionRow>
      )}

      {rows.freetp.length > 0 && (
        <SectionRow title="Новое на FreeTP" href="/catalog?source=freetp">
          {rows.freetp.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </SectionRow>
      )}

      <div className="flex justify-center pb-4">
        <Link to="/catalog" className={ctaVariants({ variant: 'secondary' })}>
          <LayoutGrid aria-hidden /> Открыть весь каталог
        </Link>
      </div>
    </div>
  )
}
