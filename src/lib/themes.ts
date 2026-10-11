import { create } from 'zustand'
import type { MessageKey } from '@/i18n'

export const THEMES = [
  {
    id: 'crimson',
    name: 'theme.crimson.name',
    description: 'theme.crimson.description',
    scheme: 'dark',
    swatch: { background: '#080808', sidebar: '#101010', card: '#1a1a1a', primary: '#e50914', foreground: '#ffffff' },
  },
  {
    id: 'manga',
    name: 'theme.manga.name',
    description: 'theme.manga.description',
    scheme: 'dark',
    swatch: { background: '#000000', sidebar: '#050505', card: '#141414', primary: '#fafafa', foreground: '#fafafa' },
  },
  {
    id: 'light',
    name: 'theme.light.name',
    description: 'theme.light.description',
    scheme: 'light',
    swatch: { background: '#ffffff', sidebar: '#f7f7f8', card: '#ececee', primary: '#111111', foreground: '#111111' },
  },
] as const satisfies readonly {
  id: string
  name: MessageKey
  description: MessageKey
  scheme: 'dark' | 'light'
  swatch: Record<'background' | 'sidebar' | 'card' | 'primary' | 'foreground', string>
}[]

export type ThemeId = (typeof THEMES)[number]['id']

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

export const useThemeStore = create<{ theme: ThemeId }>(() => ({ theme: 'crimson' }))

export function applyTheme(theme: ThemeId) {
  if (!isThemeId(theme)) return
  useThemeStore.setState({ theme })
  if (typeof document === 'undefined') return
  const config = THEMES.find((t) => t.id === theme)!
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', config.scheme === 'dark')
  root.style.colorScheme = config.scheme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', config.swatch.background)
}

export function useTheme(): ThemeId {
  return useThemeStore((s) => s.theme)
}
