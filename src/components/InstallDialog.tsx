import { useEffect, useState } from 'react'
import { FolderOpen, HardDrive, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Cta } from '@/components/ui/primitives'
import { useT } from '@/i18n'
import { formatBytes } from '@/lib/format'
import { backend, errorMessage } from '@/services'
import { useLauncherStore } from '@/stores/launcher-store'
import type { Game } from '@/types'

/** Archives usually expand to more than their compressed size; keep headroom for staging. */
const EXTRACTION_FACTOR = 2.5

export function InstallDialog({ game, open, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  const t = useT()
  const settings = useLauncherStore((s) => s.settings)
  const install = useLauncherStore((s) => s.install)
  const toast = useLauncherStore((s) => s.toast)
  const [dir, setDir] = useState<string | null>(null)
  const [freeSpace, setFreeSpace] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const targetDir = dir ?? settings?.libraryDir ?? ''
  const pkg = game.package
  const required = pkg ? pkg.sizeBytes * EXTRACTION_FACTOR : 0
  const insufficient = freeSpace !== null && freeSpace < required

  useEffect(() => {
    if (!open || !targetDir || !backend.isDesktop) return
    let cancelled = false
    backend
      .getFreeSpace(targetDir)
      .then((value) => !cancelled && setFreeSpace(value))
      .catch(() => !cancelled && setFreeSpace(null))
    return () => {
      cancelled = true
    }
  }, [open, targetDir])

  async function chooseFolder() {
    try {
      const picked = await backend.pickFolder(t('install.folder'))
      if (picked) setDir(picked)
    } catch (error) {
      toast('error', t('common.pickFolderFailed'), errorMessage(error))
    }
  }

  async function confirm() {
    setSubmitting(true)
    const ok = await install(game.id, dir)
    setSubmitting(false)
    if (ok) onClose()
  }

  if (!pkg) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('install.title', { title: game.title })}
      description={t('install.description', { version: pkg.version, format: pkg.format.toUpperCase() })}
      footer={
        <>
          <Cta variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Cta>
          <Cta onClick={confirm} disabled={!backend.isDesktop || submitting || insufficient}>
            {submitting ? t('install.starting') : t('common.install')}
          </Cta>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!backend.isDesktop && (
          <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{t('install.browserWarning')}</p>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('install.folder')}</p>
          <div className="flex gap-2">
            <div
              className="flex h-10 min-w-0 flex-1 items-center rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground/90"
              data-selectable
            >
              <span className="truncate">{targetDir || t('install.notSet')}</span>
            </div>
            <Cta variant="secondary" onClick={chooseFolder} disabled={!backend.isDesktop}>
              <FolderOpen aria-hidden />
              {t('common.change')}
            </Cta>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <dt className="text-xs text-muted-foreground">{t('install.downloadSize')}</dt>
            <dd className="mt-1 font-semibold">{formatBytes(pkg.sizeBytes)}</dd>
          </div>
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HardDrive className="size-3.5" aria-hidden /> {t('install.freeSpace')}
            </dt>
            <dd className={`mt-1 font-semibold ${insufficient ? 'text-destructive' : ''}`}>
              {freeSpace === null ? t('install.unknown') : formatBytes(freeSpace)}
            </dd>
          </div>
        </dl>

        {insufficient && (
          <p className="text-sm text-destructive">{t('install.insufficient', { size: formatBytes(required) })}</p>
        )}

        <div className="flex gap-3 rounded-xl border border-border bg-background/60 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <p>
            {t('install.shaBefore')}{' '}
            <code className="font-mono text-foreground/80" data-selectable>
              {pkg.sha256.slice(0, 16)}…
            </code>{' '}
            {t('install.shaAfter')}
          </p>
        </div>
      </div>
    </Modal>
  )
}
