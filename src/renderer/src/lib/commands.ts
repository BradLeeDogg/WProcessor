/**
 * Tiny in-renderer command bus. The native menu (main process) and global
 * keyboard shortcuts both dispatch high-level commands; whichever component owns
 * a command listens for it. Keeps shortcut/menu wiring in one place instead of
 * scattered keydown handlers.
 */
export type AppCommand =
  | 'find'
  | 'new-doc'
  | 'new-folder'
  | 'split-view'
  | 'split-doc'
  | 'merge-docs'
  | 'insert-image'
  | 'compose'
  | 'compile'
  | 'snapshot'
  | 'quick-open'
  | 'command-palette'
  | 'view-corkboard'
  | 'view-outliner'
  | 'view-scrivenings'
  | 'panel-sources'
  | 'panel-factcheck'
  | 'panel-transcripts'
  | 'panel-proofread'
  | 'panel-targets'
  | 'panel-inspector'
  | 'open-settings'
  | 'backup-now'
  | 'toggle-theme'
  | 'help'

export function runCommand(cmd: AppCommand): void {
  window.dispatchEvent(new CustomEvent('wp:cmd', { detail: cmd }))
}

export function onCommand(handler: (cmd: AppCommand) => void): () => void {
  const h = (e: Event): void => handler((e as CustomEvent<AppCommand>).detail)
  window.addEventListener('wp:cmd', h as EventListener)
  return () => window.removeEventListener('wp:cmd', h as EventListener)
}
