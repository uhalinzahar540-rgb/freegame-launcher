import { currentLocale, t } from '@/i18n'

function numberFormat(fractionDigits: number) {
  return new Intl.NumberFormat(currentLocale(), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

export function formatBytes(bytes: number, fractionDigits = 1): string {
  const units = t('units.bytes').split('|')
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${units[0]}`
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${numberFormat(exponent === 0 ? 0 : fractionDigits).format(value)} ${units[exponent]}`
}

export function formatSpeed(bytesPerSecond: number): string {
  return t('units.perSecond', { value: formatBytes(bytesPerSecond) })
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return t('time.hm', { h: hours, m: minutes })
  if (minutes > 0) return t('time.m', { m: minutes })
  return t('time.s', { s: seconds })
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  if (seconds < 60) return t('time.s', { s: Math.ceil(seconds) })
  return formatDuration(seconds)
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

export function formatRelative(iso: string | null): string {
  if (!iso) return t('time.never')
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const diffSeconds = (date.getTime() - Date.now()) / 1000
  const abs = Math.abs(diffSeconds)
  if (abs < 60) return t('time.justNow')
  const relative = new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'auto' })
  if (abs < 3600) return relative.format(Math.round(diffSeconds / 60), 'minute')
  if (abs < 86400) return relative.format(Math.round(diffSeconds / 3600), 'hour')
  if (abs < 86400 * 30) return relative.format(Math.round(diffSeconds / 86400), 'day')
  return formatDate(iso)
}

export function compareText(a: string, b: string): number {
  return a.localeCompare(b, currentLocale())
}
