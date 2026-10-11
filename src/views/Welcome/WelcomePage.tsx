import { useState } from 'react'
import { ArrowLeft, ArrowRight, Gamepad2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { LanguagePicker } from '@/components/LanguagePicker'
import { Logo } from '@/components/Logo'
import { ThemePicker } from '@/components/ThemePicker'
import { TitleBar } from '@/components/TitleBar'
import { Cta } from '@/components/ui/primitives'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { useLauncherStore } from '@/stores/launcher-store'

const STEPS = ['language', 'theme'] as const

export function WelcomePage() {
  const t = useT()
  const settings = useLauncherStore((s) => s.settings)!
  const updateSettings = useLauncherStore((s) => s.updateSettings)
  const [stepIndex, setStepIndex] = useState(0)
  const step = STEPS[stepIndex]
  const isLast = stepIndex === STEPS.length - 1

  return (
    <div className="flex h-dvh flex-col bg-background">
      <TitleBar minimal />
      <div className="flex min-h-0 flex-1 gap-6 p-6 max-lg:flex-col lg:gap-10 lg:p-10">
        <WelcomeArt />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {t('welcome.step', { step: stepIndex + 1, total: STEPS.length })}
            </p>
            <div className="flex gap-1.5" aria-hidden>
              {STEPS.map((s, i) => (
                <span
                  key={s}
                  className={cn(
                    'h-1 rounded-full transition-all',
                    i === stepIndex ? 'w-8 bg-primary' : i < stepIndex ? 'w-4 bg-primary/60' : 'w-4 bg-border',
                  )}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pe-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.section
                key={step}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                aria-labelledby="welcome-step-title"
                className="flex flex-col gap-6 pb-2"
              >
                <header>
                  <h1
                    id="welcome-step-title"
                    className="font-display text-2xl font-bold tracking-tight text-balance md:text-3xl"
                  >
                    {step === 'language' ? t('welcome.languageTitle') : t('welcome.themeTitle')}
                  </h1>
                  <p className="mt-2 max-w-xl text-sm text-pretty text-muted-foreground">
                    {step === 'language' ? t('welcome.languageDescription') : t('welcome.themeDescription')}
                  </p>
                </header>

                {step === 'language' ? (
                  <LanguagePicker
                    value={settings.language}
                    onChange={(language) => updateSettings({ language })}
                    label={t('settings.language')}
                  />
                ) : (
                  <ThemePicker
                    value={settings.theme}
                    onChange={(theme) => updateSettings({ theme })}
                    label={t('settings.theme')}
                  />
                )}
              </motion.section>
            </AnimatePresence>
          </div>

          <footer className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-5">
            <Cta
              variant="ghost"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              className={cn(stepIndex === 0 && 'invisible')}
              aria-hidden={stepIndex === 0}
              tabIndex={stepIndex === 0 ? -1 : undefined}
            >
              <ArrowLeft className="rtl:rotate-180" aria-hidden /> {t('common.back')}
            </Cta>
            {isLast ? (
              <Cta size="lg" onClick={() => updateSettings({ onboardingCompleted: true })}>
                <Gamepad2 aria-hidden /> {t('welcome.finish')}
              </Cta>
            ) : (
              <Cta size="lg" onClick={() => setStepIndex((i) => i + 1)}>
                {t('common.next')} <ArrowRight className="rtl:rotate-180" aria-hidden />
              </Cta>
            )}
          </footer>
        </main>
      </div>
    </div>
  )
}

function WelcomeArt() {
  const t = useT()
  return (
    <aside className="manga-panel relative isolate flex shrink-0 flex-col justify-end overflow-hidden rounded-2xl border border-border bg-card max-lg:min-h-48 lg:w-[42%]">
      <img
        src="/themes/manga/welcome.png"
        alt=""
        className="absolute inset-0 -z-20 size-full object-cover object-[30%_center]"
      />
      <div className="art-tint absolute inset-0 -z-10" aria-hidden />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/40 to-transparent" aria-hidden />
      <div className="flex flex-col gap-3 p-6 text-white lg:p-8">
        <Logo className="size-12" />
        <p className="font-display text-2xl leading-tight font-bold text-balance lg:text-3xl">{t('welcome.greeting')}</p>
      </div>
    </aside>
  )
}
