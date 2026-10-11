import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

export function SectionRow({
  title,
  href,
  children,
}: {
  title: string
  href?: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-3 font-display text-lg font-semibold">
          <span className="h-5 w-1 rounded-full bg-primary shadow-glow" aria-hidden />
          {title}
        </h2>
        {href && (
          <Link
            to={href}
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary-hover"
          >
            Все <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">{children}</div>
    </section>
  )
}
