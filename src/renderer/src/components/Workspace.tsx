import { useEffect, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useStore } from '../store/useStore'
import { allDocuments } from '../lib/tree'
import { onCommand } from '../lib/commands'
import Binder from './Binder'
import Editor from './Editor'
import SplitPane from './SplitPane'
import SnapshotsPanel from './SnapshotsPanel'
import TargetsPanel from './TargetsPanel'
import FindPanel from './FindPanel'
import Inspector from './Inspector'
import SourcesPanel from './SourcesPanel'
import FactCheckPanel from './FactCheckPanel'
import TranscriptsPanel from './TranscriptsPanel'
import ProofreaderPanel from './ProofreaderPanel'
import ResearchViewer from './ResearchViewer'
import CompileDialog from './CompileDialog'
import SettingsDialog from './SettingsDialog'
import CompositionMode from './CompositionMode'
import QuickOpen from './QuickOpen'
import CommandPalette from './CommandPalette'
import HelpDialog from './HelpDialog'

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
  const viewSourceId = useStore((s) => s.viewSourceId)
  const setMeta = useStore((s) => s.setMeta)
  const setSplit = useStore((s) => s.setSplit)
  const composition = useStore((s) => s.composition)
  const setComposition = useStore((s) => s.setComposition)
  const setFolderView = useStore((s) => s.setFolderView)
  const select = useStore((s) => s.select)

  const [showSnapshots, setShowSnapshots] = useState(false)
  const [showTargets, setShowTargets] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [showInspector, setShowInspector] = useState(false)
  const [showSources, setShowSources] = useState(false)
  // Journalism types open the fact-check packet by default.
  const [showFactCheck, setShowFactCheck] = useState(() => !!meta?.settings.factCheckEnabled)
  const [showTranscripts, setShowTranscripts] = useState(false)
  const [showProof, setShowProof] = useState(false)
  const [showCompile, setShowCompile] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showQuickOpen, setShowQuickOpen] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)

  // First-run: show the welcome/help sheet once.
  useEffect(() => {
    if (!localStorage.getItem('wp-onboarded-v1')) {
      setShowHelp(true)
      localStorage.setItem('wp-onboarded-v1', '1')
    }
  }, [])

  // Workspace-owned menu/shortcut commands (ref keeps handler closures fresh).
  const cmdRef = useRef<(cmd: string) => void>(() => {})
  cmdRef.current = (cmd) => {
    if (useStore.getState().composition && cmd !== 'compose') return
    switch (cmd) {
      case 'quick-open':
        setShowQuickOpen(true)
        break
      case 'compose':
        setComposition(true)
        break
      case 'compile':
        setShowCompile(true)
        break
      case 'snapshot':
        setShowSnapshots(true)
        break
      case 'split-view':
        toggleSplit()
        break
      case 'view-corkboard':
        openCorkboard()
        break
      case 'view-outliner':
        setFolderView('outliner')
        break
      case 'view-scrivenings':
        setFolderView('scrivenings')
        break
      case 'command-palette':
        setShowPalette(true)
        break
      case 'help':
        setShowHelp(true)
        break
      case 'panel-inspector':
        setShowInspector((v) => !v)
        break
      case 'panel-sources':
        setShowSources((v) => !v)
        break
      case 'panel-factcheck':
        setShowFactCheck((v) => !v)
        break
      case 'panel-transcripts':
        setShowTranscripts((v) => !v)
        break
      case 'panel-proofread':
        setShowProof((v) => !v)
        break
      case 'panel-targets':
        setShowTargets((v) => !v)
        break
      case 'open-settings':
        setShowSettings(true)
        break
      case 'backup-now':
        void handleBackup()
        break
      case 'toggle-theme': {
        const next = useStore.getState().meta?.settings.theme === 'dark' ? 'paper' : 'dark'
        void window.api.project.updateSettings({ theme: next }).then(setMeta)
        break
      }
    }
  }
  useEffect(() => onCommand((cmd) => cmdRef.current(cmd)), [])

  // Keep Chromium's spell-check dictionary in sync with the project's dialect.
  useEffect(() => {
    void window.api.spellcheck.setDialect(meta?.settings.english === 'british' ? 'british' : 'american')
  }, [meta?.settings.english])

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

  // Open the corkboard for the most relevant folder: the selection if it's a
  // folder, else its parent folder, else the first top-level folder.
  const openCorkboard = (): void => {
    const sel = tree.find((t) => t.id === selectedId)
    const folderId =
      sel?.type === 'folder'
        ? sel.id
        : sel?.parentId ??
          tree.find((t) => t.type === 'folder' && t.parentId === null)?.id ??
          tree.find((t) => t.type === 'folder')?.id ??
          null
    if (!folderId) return
    select(folderId)
    setFolderView('corkboard')
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
          <button onClick={() => setShowQuickOpen(true)} title="Quick open (Ctrl/⌘ P)">
            Go to
          </button>
          <button className={splitId ? 'on' : ''} onClick={toggleSplit}>
            Split
          </button>
          <button onClick={() => setComposition(true)}>Compose</button>
          <button onClick={openCorkboard} title="Index cards for a folder">
            Corkboard
          </button>
          <button className={showInspector ? 'on' : ''} onClick={() => setShowInspector((v) => !v)}>
            Inspector
          </button>
          <button className={showSources ? 'on' : ''} onClick={() => setShowSources((v) => !v)}>
            Sources
          </button>
          <button className={showFactCheck ? 'on' : ''} onClick={() => setShowFactCheck((v) => !v)}>
            Fact-check
          </button>
          <button
            className={showTranscripts ? 'on' : ''}
            onClick={() => setShowTranscripts((v) => !v)}
          >
            Transcripts
          </button>
          <button className={showProof ? 'on' : ''} onClick={() => setShowProof((v) => !v)}>
            Proofread
          </button>
          <button className={showTargets ? 'on' : ''} onClick={() => setShowTargets((v) => !v)}>
            Targets
          </button>
          <button className={showSnapshots ? 'on' : ''} onClick={() => setShowSnapshots((v) => !v)}>
            Snapshots
          </button>
          <button onClick={handleBackup}>Back up now</button>
          <button title="Settings" onClick={() => setShowSettings(true)}>
            ⚙
          </button>
          <span className="sep" />
          <button className="primary topbar-compile" onClick={() => setShowCompile(true)}>
            Compile
          </button>
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
          {showSources && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="sources" order={7} defaultSize={26} minSize={18} maxSize={44} className="pane">
                <SourcesPanel onClose={() => setShowSources(false)} />
              </Panel>
            </>
          )}
          {showFactCheck && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="factcheck" order={8} defaultSize={28} minSize={20} maxSize={46} className="pane">
                <FactCheckPanel onClose={() => setShowFactCheck(false)} />
              </Panel>
            </>
          )}
          {showSnapshots && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="snapshots" order={9} defaultSize={24} minSize={16} maxSize={40} className="pane">
                <SnapshotsPanel onClose={() => setShowSnapshots(false)} />
              </Panel>
            </>
          )}
          {showTranscripts && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="transcripts" order={10} defaultSize={30} minSize={22} maxSize={48} className="pane">
                <TranscriptsPanel onClose={() => setShowTranscripts(false)} />
              </Panel>
            </>
          )}
          {showProof && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="proofread" order={11} defaultSize={26} minSize={18} maxSize={42} className="pane">
                <ProofreaderPanel onClose={() => setShowProof(false)} />
              </Panel>
            </>
          )}
          {viewSourceId && (
            <>
              <PanelResizeHandle className="resize-handle" />
              <Panel id="research" order={12} defaultSize={34} minSize={22} maxSize={55} className="pane">
                <ResearchViewer />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {composition && <CompositionMode />}
      {showCompile && <CompileDialog onClose={() => setShowCompile(false)} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {showQuickOpen && <QuickOpen onClose={() => setShowQuickOpen(false)} />}
      {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
    </div>
  )
}
