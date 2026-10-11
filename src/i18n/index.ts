import { create } from 'zustand'
import { ar } from './locales/ar'
import { de } from './locales/de'
import { en, type MessageKey, type Messages } from './locales/en'
import { es } from './locales/es'
import { fr } from './locales/fr'
import { hi } from './locales/hi'
import { ja } from './locales/ja'
import { ko } from './locales/ko'
import { pt } from './locales/pt'
import { ru } from './locales/ru'
import { tr } from './locales/tr'
import { uk } from './locales/uk'
import { zh } from './locales/zh'

export type { MessageKey } from './locales/en'

export const LANGUAGES = [
  { code: 'en', native: 'English', english: 'English', locale: 'en-US', dir: 'ltr' },
  { code: 'zh', native: '中文', english: 'Chinese', locale: 'zh-CN', dir: 'ltr' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', locale: 'hi-IN', dir: 'ltr' },
  { code: 'es', native: 'Español', english: 'Spanish', locale: 'es-ES', dir: 'ltr' },
  { code: 'ar', native: 'العربية', english: 'Arabic', locale: 'ar', dir: 'rtl' },
  { code: 'fr', native: 'Français', english: 'French', locale: 'fr-FR', dir: 'ltr' },
  { code: 'pt', native: 'Português', english: 'Portuguese', locale: 'pt-BR', dir: 'ltr' },
  { code: 'ru', native: 'Русский', english: 'Russian', locale: 'ru-RU', dir: 'ltr' },
  { code: 'de', native: 'Deutsch', english: 'German', locale: 'de-DE', dir: 'ltr' },
  { code: 'ja', native: '日本語', english: 'Japanese', locale: 'ja-JP', dir: 'ltr' },
  { code: 'ko', native: '한국어', english: 'Korean', locale: 'ko-KR', dir: 'ltr' },
  { code: 'tr', native: 'Türkçe', english: 'Turkish', locale: 'tr-TR', dir: 'ltr' },
  { code: 'uk', native: 'Українська', english: 'Ukrainian', locale: 'uk-UA', dir: 'ltr' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

const DICTIONARIES: Record<LanguageCode, Messages> = { en, zh, hi, es, ar, fr, pt, ru, de, ja, ko, tr, uk }

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && value in DICTIONARIES
}

export function detectLanguage(): LanguageCode {
  const candidates = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  for (const tag of candidates) {
    const base = tag?.toLowerCase().split('-')[0]
    if (isLanguageCode(base)) return base
  }
  return 'en'
}

interface I18nState {
  language: LanguageCode
}

export const useI18nStore = create<I18nState>(() => ({ language: detectLanguage() }))

export function setLanguage(language: LanguageCode) {
  if (!isLanguageCode(language)) return
  useI18nStore.setState({ language })
  if (typeof document !== 'undefined') {
    const meta = LANGUAGES.find((l) => l.code === language)!
    document.documentElement.lang = language
    document.documentElement.dir = meta.dir
  }
}

export function currentLanguage(): LanguageCode {
  return useI18nStore.getState().language
}

export function currentLocale(): string {
  const code = currentLanguage()
  return LANGUAGES.find((l) => l.code === code)!.locale
}

export type TranslateParams = Record<string, string | number>

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

export function translate(language: LanguageCode, key: MessageKey, params?: TranslateParams): string {
  const template = DICTIONARIES[language]?.[key] ?? en[key] ?? key
  return interpolate(template, params)
}

/** Non-reactive translation for stores, services and formatters. */
export function t(key: MessageKey, params?: TranslateParams): string {
  return translate(currentLanguage(), key, params)
}

export type Translator = typeof t

/** Reactive translation: components re-render when the language changes. */
export function useT(): Translator {
  const language = useI18nStore((s) => s.language)
  return (key, params) => translate(language, key, params)
}

export function useLanguage(): LanguageCode {
  return useI18nStore((s) => s.language)
}
