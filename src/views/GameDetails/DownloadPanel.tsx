import { DownloadRow } from '@/views/Downloads/DownloadRow'
import type { DownloadTask } from '@/types'

export function DownloadPanel({ task }: { task: DownloadTask }) {
  return (
    <section aria-label="Текущая загрузка">
      <DownloadRow task={task} compact />
    </section>
  )
}
