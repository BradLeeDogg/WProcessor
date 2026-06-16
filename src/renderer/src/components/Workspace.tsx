import { useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useStore } from '../store/useStore'
import { allDocuments } from '../lib/tree'
import Binder from './Binder'
import Editor from './Editor'
import SplitPane from './SplitPane'
import SnapshotsPanel from './SnapshotsPanel'
import TargetsPanel from './TargetsPanel'
import FindPanel from './FindPanel'
import Inspector from './Inspector'
import CompositionMode from './CompositionMode'

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
  const tree = useStore((s) => s.tree)
  const selectedId = useStore((s) => s.selectedId)
  const closeProject = useStore((s) => s.closeProject)
  const saveState = useStore((s) => s.saveState)
  const lastSavedAt = useStore((s) => s.lastSavedAt)
  const docWordCount = useStore((s) => s.docWordCount)
  const selectionWordCount = useStore((s) => s.selectionWordCount)
  const splitId = useStore((s) => s.splitId)
  const setSplit = useStore((s) => s.setSplit)
  const composition = useStore((s) => s.composition)
  const setComposition = useStore((s) => s.setComposition)

  const [showSnapshots, setShowSnapshots] = useState(false)
  const [showTargets, setShowTargets] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [showInspector, setShowInspector] = useState(false)
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

  const toggleSplit = (): void => {
    if (splitId) {
      setSplit(null)
      return
    }
    const selected = tree.find((t) => t.id === selectedId)
    const target = selected?.type === 'document' ? selected.id : allDocuments(tree)[0]?.id ?? null
    setSplit(target)
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
          <button className={showFind ? 'on' : ''} onClick={() => setShowFind((v) => !v)}>
            Find
          </button>
          <button className={splitId ? 'on' : ''} onClick={toggleSplit}>
            Split
          </button>
          <button onClick={() => setComposition(true)}>Compose</button>
          <button className={showInspector ? 'on' : ''} onClick={() => setShowInspector((v) => !v)}>
            Inspector
          </button>
          <button className={showTargets ? 'on' : ''} onClick={() => setShowTargets((v) => !v)}>
            Targets
          </button>
          <button className={showSnapshots ? 'on' : ''} onClick={() => setShowSnapshots((v) => !v)}>
            Snapshots
          </button>
          <button onClick={handleBackup}>Back up now</button>
        </div>
      </header>

      {backupMsg && <div className="toast">{backupMsg}</div>}

      <div className="workspace-body">
        <PanelGroup direction="horizontal" autoSaveId="wp-main-split">
          <Panel id="binder" order={1} defaultSize={22} minSize={14} maxSize={40} className="pane">
            <Binder />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel id="editor" order={2} minSize={25} className="pane">
            <Editor />
          </Panel>
          {splitId && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="split" order={3} defaultSize={38} minSize={20} className="pane">
                <SplitPane />
              </Panel>
            </>
          )}
          {showFind && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="find" order={4} defaultSize={24} minSize={16} maxSize={40} className="pane">
                <FindPanel onClose={() => setShowFind(false)} />
              </Panel>
            </>
          )}
          {showTargets && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="targets" order={5} defaultSize={22} minSize={16} maxSize={38} className="pane">
                <TargetsPanel onClose={() => setShowTargets(false)} />
              </Panel>
            </>
          )}
          {showInspector && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="inspector" order={6} defaultSize={24} minSize={18} maxSize={42} className="pane">
                <Inspector onClose={() => setShowInspector(false)} />
              </Panel>
            </>
          )}
          {showSnapshots && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="snapshots" order={7} defaultSize={24} minSize={16} maxSize={40} className="pane">
                <SnapshotsPanel onClose={() => setShowSnapshots(false)} />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {composition && <CompositionMode />}
    </div>
  )
}
