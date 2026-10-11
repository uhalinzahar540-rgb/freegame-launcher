const BYTE_UNITS = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']

export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б'
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(exponent === 0 ? 0 : fractionDigits).replace('.', ',')} ${BYTE_UNITS[exponent]}`
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/с`
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours} ч ${minutes} мин`
  if (minutes > 0) return `${minutes} мин`
  return `${seconds} с`
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  if (seconds < 60) return `${Math.ceil(seconds)} с`
  return formatDuration(seconds)
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date)
}

const relativeFormatter = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' })

export function formatRelative(iso: string | null): string {
  if (!iso) return 'никогда'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const diffSeconds = (date.getTime() - Date.now()) / 1000
  const abs = Math.abs(diffSeconds)
  if (abs < 60) return 'только что'
  if (abs < 3600) return relativeFormatter.format(Math.round(diffSeconds / 60), 'minute')
  if (abs < 86400) return relativeFormatter.format(Math.round(diffSeconds / 3600), 'hour')
  if (abs < 86400 * 30) return relativeFormatter.format(Math.round(diffSeconds / 86400), 'day')
  return formatDate(iso)
}
