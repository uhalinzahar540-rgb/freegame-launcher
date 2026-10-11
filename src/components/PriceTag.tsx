import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import type { StoreInfo } from '@/types'

export function PriceTag({
  store,
  size = 'sm',
  className,
}: {
  store: StoreInfo
  size?: 'sm' | 'lg'
  className?: string
}) {
  const t = useT()
  const { price } = store
  if (!price && !store.isFree) return null

  const discounted = !!price && price.discountPercent > 0
  return (
    <span
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-md border border-white/15 bg-black/70 font-medium text-white backdrop-blur',
        size === 'lg' ? 'text-sm' : 'text-[11px]',
        className,
      )}
    >
      {discounted && (
        <span className={cn('flex items-center bg-success font-bold text-black', size === 'lg' ? 'px-2' : 'px-1.5')}>
          {`-${price.discountPercent}%`}
        </span>
      )}
      <span className={cn('flex items-center gap-1.5 tabular-nums', size === 'lg' ? 'px-2.5 py-1' : 'px-2 py-0.5')}>
        {discounted && (
          <s className="text-white/55">
            <span className="sr-only">{t('details.price')}: </span>
            {price.initialFormatted}
          </s>
        )}
        <span>{price ? price.finalFormatted : t('game.free')}</span>
      </span>
    </span>
  )
}
