import type { Backend } from './backend'
import { createPreviewBackend } from './preview-backend'
import { createTauriBackend } from './tauri-backend'

export const APP_VERSION = '0.1.0'

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export const backend: Backend = isTauriRuntime()
  ? createTauriBackend(APP_VERSION)
  : createPreviewBackend(APP_VERSION)

export { DesktopOnlyError, errorMessage } from './backend'
