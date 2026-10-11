import { useState } from 'react'
import { FileSearch, TriangleAlert } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Cta } from '@/components/ui/primitives'
import { backend, errorMessage } from '@/services'
import { useLauncherStore } from '@/stores/launcher-store'

function titleFromPath(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? ''
  return file.replace(/\.exe$/i, '').replace(/[_-]+/g, ' ').trim()
}

export function AddGameDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addManualGame = useLauncherStore((s) => s.addManualGame)
  const toast = useLauncherStore((s) => s.toast)
  const [path, setPath] = useState('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function browse() {
    try {
      const picked = await backend.pickExecutable()
      if (!picked) return
      setPath(picked)
      if (!title) setTitle(titleFromPath(picked))
    } catch (error) {
      toast('error', 'Не удалось выбрать файл', errorMessage(error))
    }
  }

  async function submit() {
    setSubmitting(true)
    const ok = await addManualGame(path, title.trim())
    setSubmitting(false)
    if (ok) {
      setPath('')
      setTitle('')
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Добавить установленную игру"
      description="Укажите исполняемый файл. Лаунчер не перемещает и не изменяет файлы игры."
      footer={
        <>
          <Cta variant="ghost" onClick={onClose}>
            Отмена
          </Cta>
          <Cta onClick={submit} disabled={!path || !title.trim() || submitting}>
            Добавить
          </Cta>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!backend.isDesktop && (
          <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>Доступ к файловой системе есть только у десктопной версии.</p>
          </div>
        )}
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Исполняемый файл (.exe)</p>
          <div className="flex gap-2">
            <div className="flex h-10 min-w-0 flex-1 items-center rounded-lg border border-border bg-background px-3 font-mono text-xs">
              <span className="truncate">{path || 'Файл не выбран'}</span>
            </div>
            <Cta variant="secondary" onClick={browse} disabled={!backend.isDesktop}>
              <FileSearch aria-hidden /> Обзор
            </Cta>
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Название</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Название игры"
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/70"
          />
        </label>
      </div>
    </Modal>
  )
}
