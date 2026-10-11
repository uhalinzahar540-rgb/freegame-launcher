import { useT } from '@/i18n'
import { DownloadRow } from '@/views/Downloads/DownloadRow'
import type { DownloadTask } from '@/types'

export function DownloadPanel({ task }: { task: DownloadTask }) {
  const t = useT()
  return (
    <section aria-label={t('download.current')}>
      <DownloadRow task={task} compact />
    </section>
  )
}
