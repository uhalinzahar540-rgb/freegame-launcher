import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate } from 'react-router'
import { GameActionButton } from '@/components/GameActionButton'
import { Badge, Cta } from '@/components/ui/primitives'
import { useT } from '@/i18n'
import { formatBytes } from '@/lib/format'
import { sourceLabel } from '@/lib/game-state'
import { useTheme } from '@/lib/themes'
import { cn } from '@/lib/utils'
import type { Game } from '@/types'

const ROTATE_MS = 8000

export function HeroBanner({ games }: { games: Game[] }) {
  const t = useT()
  const theme = useTheme()
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const game = games[index % games.length]

  useEffect(() => {
    if (paused || games.length < 2) return
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % games.length), ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [paused, games.length])

  return (
    <section
      aria-label={t('hero.label')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="manga-panel group relative isolate overflow-hidden rounded-2xl border border-border bg-card"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.img
          key={game.id}
          src={game.heroUrl ?? undefined}
          alt=""
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="game-art absolute inset-0 -z-10 size-full object-cover"
        />
      </AnimatePresence>
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/80 to-transparent rtl:bg-gradient-to-l" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-transparent to-transparent" />
      {theme === 'manga' ? (
        <>
          <div className="screentone absolute inset-0 -z-10 opacity-60" aria-hidden />
          <img
            src="/themes/manga/sidebar.png"
            alt=""
            aria-hidden
            className="pointer-events-none absolute end-0 bottom-0 -z-10 hidden h-full w-auto object-cover opacity-90 [mask-image:linear-gradient(to_left,black_55%,transparent)] xl:block rtl:[mask-image:linear-gradient(to_right,black_55%,transparent)]"
          />
        </>
      ) : (
        <div className="absolute -bottom-24 -start-24 -z-10 size-96 rounded-full bg-primary/25 blur-3xl" aria-hidden />
      )}

      <div className="flex min-h-[380px] flex-col justify-end gap-5 p-8 lg:min-h-[440px] lg:p-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={game.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="flex max-w-xl flex-col gap-4"
          >
            <div className="flex flex-wrap gap-2">
              <Badge tone="primary">{sourceLabel(game.sourceId)}</Badge>
              {game.genres.slice(0, 3).map((g) => (
                <Badge key={g}>{g}</Badge>
              ))}
            </div>
            <h1 className="font-display text-4xl leading-tight font-bold tracking-tight text-balance lg:text-5xl">
              {game.title}
            </h1>
            <p className="text-pretty text-foreground/75 lg:text-lg">{game.shortDescription}</p>
            <div className="flex flex-wrap items-center gap-3">
              <GameActionButton gameId={game.id} size="lg" />
              <Cta variant="secondary" size="lg" onClick={() => navigate(`/game/${encodeURIComponent(game.id)}`)}>
                {t('hero.details')}
              </Cta>
              {game.package && (
                <span className="text-sm text-muted-foreground">
                  {t('hero.sizeVersion', { size: formatBytes(game.package.sizeBytes), version: game.package.version })}
                </span>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {games.length > 1 && (
          <div className="flex gap-2" role="tablist" aria-label={t('hero.pick')}>
            {games.map((g, i) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={g.title}
                onClick={() => setIndex(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === index ? 'w-10 bg-primary shadow-glow' : 'w-5 bg-foreground/25 hover:bg-foreground/50',
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
