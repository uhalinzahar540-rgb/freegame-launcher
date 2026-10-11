import { Gamepad2 } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { GameActionButton } from '@/components/GameActionButton'
import { Badge } from '@/components/ui/primitives'
import { sourceLabel, useGameState } from '@/lib/game-state'
import { cn } from '@/lib/utils'
import type { Game } from '@/types'

export function GameCover({ src, title, className }: { src: string | null; title: string; className?: string }) {
  if (!src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-gradient-to-br from-panel via-card to-primary-deep/40 text-muted-foreground',
          className,
        )}
      >
        <Gamepad2 className="size-10" aria-hidden />
        <span className="sr-only">{title}</span>
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={`Обложка ${title}`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={cn('object-cover', className)}
    />
  )
}

export function GameCard({ game, className }: { game: Game; className?: string }) {
  const { phase } = useGameState(game.id)
  const installed = phase === 'installed' || phase === 'update' || phase === 'running'

  return (
    <motion.article
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-[border-color,box-shadow] duration-300 hover:border-primary/60 hover:shadow-[0_12px_40px_-12px_rgba(229,9,20,0.55)]',
        className,
      )}
    >
      <Link to={`/game/${encodeURIComponent(game.id)}`} className="relative block aspect-video overflow-hidden">
        <GameCover
          src={game.coverUrl}
          title={game.title}
          className="size-full transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent" />
        <div className="absolute top-2 left-2 flex gap-1.5">
          <Badge className="bg-black/60 backdrop-blur">{sourceLabel(game.sourceId)}</Badge>
          {installed && <Badge tone="success" className="bg-black/60 backdrop-blur">Установлена</Badge>}
          {phase === 'update' && <Badge tone="warning" className="bg-black/60 backdrop-blur">Обновление</Badge>}
        </div>
        <span className="sr-only">Открыть страницу {game.title}</span>
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4 pt-1">
        <div className="min-w-0">
          <h3 className="truncate font-display text-sm font-semibold">
            <Link to={`/game/${encodeURIComponent(game.id)}`} className="hover:text-primary-hover">
              {game.title}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {game.genres.slice(0, 2).join(' · ') || 'Без жанра'}
          </p>
        </div>
        <GameActionButton gameId={game.id} size="sm" className="mt-auto w-full" />
      </div>
    </motion.article>
  )
}

export function GameCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="aspect-video animate-shimmer bg-[linear-gradient(90deg,#171717_0%,#232323_40%,#2b1414_50%,#232323_60%,#171717_100%)] bg-[length:200%_100%]" />
      <div className="flex flex-col gap-2 p-4">
        <div className="h-4 w-2/3 rounded bg-panel" />
        <div className="h-3 w-1/3 rounded bg-panel" />
        <div className="mt-2 h-8 rounded-lg bg-panel" />
      </div>
    </div>
  )
}
