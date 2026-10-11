import { Check } from 'lucide-react'
import { useT } from '@/i18n'
import { THEMES, type ThemeId } from '@/lib/themes'
import { cn } from '@/lib/utils'

export function ThemePicker({
  value,
  onChange,
  label,
}: {
  value: ThemeId
  onChange: (theme: ThemeId) => void
  label: string
}) {
  const t = useT()
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-3 sm:grid-cols-3">
      {THEMES.map((theme) => {
        const selected = theme.id === value
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(theme.id)}
            className={cn(
              'group flex flex-col overflow-hidden rounded-xl border text-start transition-all',
              selected
                ? 'manga-panel border-primary shadow-glow ring-1 ring-primary'
                : 'border-border hover:border-foreground/30',
            )}
          >
            <ThemePreview id={theme.id} swatch={theme.swatch} />
            <span className="flex items-start justify-between gap-3 bg-card p-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t(theme.name)}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t(theme.description)}</span>
              </span>
              <span
                className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                )}
                aria-hidden
              >
                {selected && <Check className="size-3" strokeWidth={3} />}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** A miniature mock of the launcher drawn with the theme's own colors, independent of the active theme. */
function ThemePreview({ id, swatch }: { id: ThemeId; swatch: (typeof THEMES)[number]['swatch'] }) {
  const isManga = id === 'manga'
  return (
    <span
      className="relative flex aspect-[16/9] w-full overflow-hidden border-b border-border"
      style={{ background: swatch.background }}
      aria-hidden
    >
      <span className="flex w-1/4 flex-col gap-1.5 p-2" style={{ background: swatch.sidebar }}>
        <span className="h-1.5 w-3/4 rounded-full" style={{ background: swatch.primary }} />
        <span className="h-1.5 w-2/3 rounded-full opacity-40" style={{ background: swatch.foreground }} />
        <span className="h-1.5 w-1/2 rounded-full opacity-40" style={{ background: swatch.foreground }} />
        {isManga && (
          <img
            src="/themes/manga/sidebar.png"
            alt=""
            className="mt-auto aspect-[3/4] w-full rounded-sm border object-cover object-top"
            style={{ borderColor: swatch.foreground }}
          />
        )}
      </span>
      <span className="flex flex-1 flex-col gap-2 p-2">
        <span
          className="relative h-1/2 w-full overflow-hidden rounded-md"
          style={{
            background: swatch.card,
            boxShadow: isManga ? `3px 3px 0 0 ${swatch.foreground}` : undefined,
            border: isManga ? `1px solid ${swatch.foreground}` : undefined,
          }}
        >
          {isManga && <span className="screentone absolute inset-0" />}
          <span
            className="absolute bottom-2 start-2 h-2.5 w-10 rounded-sm"
            style={{ background: swatch.primary }}
          />
        </span>
        <span className="grid flex-1 grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="rounded-sm" style={{ background: swatch.card }} />
          ))}
        </span>
      </span>
    </span>
  )
}
