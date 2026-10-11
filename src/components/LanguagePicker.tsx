import { Check } from 'lucide-react'
import { LANGUAGES, type LanguageCode } from '@/i18n'
import { cn } from '@/lib/utils'

export function LanguagePicker({
  value,
  onChange,
  label,
}: {
  value: LanguageCode
  onChange: (language: LanguageCode) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {LANGUAGES.map((language) => {
        const selected = language.code === value
        return (
          <button
            key={language.code}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={language.code}
            dir={language.dir}
            onClick={() => onChange(language.code)}
            className={cn(
              'group flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-start transition-all',
              selected
                ? 'manga-panel border-primary bg-primary/10 shadow-glow'
                : 'border-border bg-card hover:border-foreground/30 hover:bg-panel',
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{language.native}</span>
              <span className="block truncate text-xs text-muted-foreground" lang="en" dir="ltr">
                {language.english}
              </span>
            </span>
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
              )}
              aria-hidden
            >
              {selected && <Check className="size-3" strokeWidth={3} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
