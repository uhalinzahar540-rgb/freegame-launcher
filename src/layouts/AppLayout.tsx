import { useEffect, useRef } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { Outlet, useLocation } from 'react-router'
import { Sidebar } from '@/components/Sidebar'
import { TitleBar } from '@/components/TitleBar'
import { Toaster } from '@/components/Toaster'
import { useLauncherStore } from '@/stores/launcher-store'

export function AppLayout() {
  const location = useLocation()
  const scrollRef = useRef<HTMLElement>(null)
  const animations = useLauncherStore((s) => s.settings?.animations ?? true)
  const uiScale = useLauncherStore((s) => s.settings?.uiScale ?? 100)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [location.pathname])

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale / 100))
    document.documentElement.classList.toggle('reduce-motion', !animations)
  }, [uiScale, animations])

  return (
    <MotionConfig reducedMotion={animations ? 'user' : 'always'}>
      <div className="flex h-dvh flex-col bg-background">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main ref={scrollRef} className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="min-h-full"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
        <Toaster />
      </div>
    </MotionConfig>
  )
}
