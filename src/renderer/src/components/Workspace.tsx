import { useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useStore } from '../store/useStore'
import Binder from './Binder'
import Editor from './Editor'
import SnapshotsPanel from './SnapshotsPanel'

function saveLabel(state: string, at: number | null): string {
  switch (state) {
    case 'saving':
      return 'Saving…'
    case 'saved':
      return at ? `Saved ${new Date(at).toLocaleTimeString()}` : 'Saved'
    case 'error':
      return 'Save failed'
    default:
      return ''
  }
}

export default function Workspace(): JSX.Element {
  const meta = useStore((s) => s.meta)
  const closeProject = useStore((s) => s.closeProject)
  const saveState = useStore((s) => s.saveState)
  const lastSavedAt = useStore((s) => s.lastSavedAt)
  const docWordCount = useStore((s) => s.docWordCount)
  const selectionWordCount = useStore((s) => s.selectionWordCount)

  const [showSnapshots, setShowSnapshots] = useState(false)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)

  const handleClose = async (): Promise<void> => {
    await window.api.project.close()
    closeProject()
  }

  const handleBackup = async (): Promise<void> => {
    setBackupMsg('Backing up…')
    try {
      const info = await window.api.backup.runNow()
      setBackupMsg(`Backed up · ${info.fileName}`)
    } catch {
      setBackupMsg('Backup failed')
    }
    setTimeout(() => setBackupMsg(null), 4000)
  }

  return (
    <div className="workspace">
      <header className="topbar">
        <div className="topbar-left">
          <button className="link" onClick={handleClose} title="Close project">
            ‹ Projects
          </button>
          <span className="project-title">{meta?.title}</span>
        </div>
        <div className="topbar-right">
          <span className="wordcount">
            {docWordCount.toLocaleString()} words
            {selectionWordCount > 0 && ` · ${selectionWordCount.toLocaleString()} selected`}
          </span>
          <span className={`savestate ${saveState}`}>{saveLabel(saveState, lastSavedAt)}</span>
          <span className="sep" />
          <button onClick={() => setShowSnapshots((v) => !v)}>Snapshots</button>
          <button onClick={handleBackup}>Back up now</button>
        </div>
      </header>

      {backupMsg && <div className="toast">{backupMsg}</div>}

      <div className="workspace-body">
        <PanelGroup direction="horizontal" autoSaveId="wp-main-split">
          <Panel defaultSize={22} minSize={14} maxSize={40} className="pane">
            <Binder />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel minSize={30} className="pane">
            <Editor />
          </Panel>
          {showSnapshots && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel defaultSize={24} minSize={16} maxSize={40} className="pane">
                <SnapshotsPanel onClose={() => setShowSnapshots(false)} />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  )
}
