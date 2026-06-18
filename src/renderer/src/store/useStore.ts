import { create } from 'zustand'
import type { BinderItem, ProjectMeta } from '@shared/types'
import type { LabelDef, OpenProjectResult } from '@shared/api'
import type { DocIssue } from '@shared/proofreader'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
export type FolderView = 'scrivenings' | 'corkboard' | 'outliner'

interface AppState {
  meta: ProjectMeta | null
  tree: BinderItem[]
  labels: LabelDef[]
  selectedId: string | null

  saveState: SaveState
  lastSavedAt: number | null
  docWordCount: number
  selectionWordCount: number

  /** Second pane document (split view); null = split closed. */
  splitId: string | null
  /** Full-screen composition mode active. */
  composition: boolean
  /** Total project words when the project was opened (session baseline). */
  sessionStartWords: number
  /** How a selected folder is presented. */
  folderView: FolderView

  openResult: (result: OpenProjectResult) => void
  closeProject: () => void
  setTree: (tree: BinderItem[]) => void
  setMeta: (meta: ProjectMeta) => void
  select: (id: string | null) => void
  setSaveState: (state: SaveState, at?: number) => void
  setDocWordCount: (n: number) => void
  setSelectionWordCount: (n: number) => void
  /** Insert content (plain text or HTML) at the cursor of the last-focused editor. */
  inserter: ((content: string) => boolean) | null
  setInserter: (fn: ((content: string) => boolean) | null) => void
  /** Insert a footnote at the cursor of the last-focused editor. */
  footnoteInserter: ((text: string) => boolean) | null
  setFootnoteInserter: (fn: ((text: string) => boolean) | null) => void
  /** The source currently open in the Research viewer (null = closed). */
  viewSourceId: string | null
  viewSource: (id: string) => void
  closeViewSource: () => void
  /** Proofreading issues for the active document + fix/jump bridges to its editor. */
  proofIssues: DocIssue[]
  proofApply: ((from: number, to: number, replacement: string) => void) | null
  proofFocus: ((from: number, to: number) => void) | null
  setProof: (
    issues: DocIssue[],
    apply: ((from: number, to: number, replacement: string) => void) | null,
    focus: ((from: number, to: number) => void) | null
  ) => void
  setSplit: (id: string | null) => void
  setComposition: (on: boolean) => void
  /** Update one item's cached word count (after a save) so totals stay live. */
  setItemWordCount: (id: string, n: number) => void
  setFolderView: (view: FolderView) => void
  /** Optimistically patch a binder item in the local tree (synopsis/label/etc). */
  patchItem: (id: string, patch: Partial<BinderItem>) => void
}

/** Sum of cached word counts across all documents. */
export function totalWords(tree: BinderItem[]): number {
  return tree.reduce((sum, it) => (it.type === 'document' ? sum + it.wordCount : sum), 0)
}

/** First selectable document in binder order, used to auto-open on project load. */
function firstDocument(tree: BinderItem[]): string | null {
  const byParent = new Map<string | null, BinderItem[]>()
  for (const it of tree) {
    const arr = byParent.get(it.parentId) ?? []
    arr.push(it)
    byParent.set(it.parentId, arr)
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.position - b.position)
  const stack = [...(byParent.get(null) ?? [])]
  while (stack.length) {
    const node = stack.shift()!
    if (node.type === 'document') return node.id
    stack.unshift(...(byParent.get(node.id) ?? []))
  }
  return null
}

export const useStore = create<AppState>((set) => ({
  meta: null,
  tree: [],
  labels: [],
  selectedId: null,
  saveState: 'idle',
  lastSavedAt: null,
  docWordCount: 0,
  selectionWordCount: 0,
  inserter: null,
  footnoteInserter: null,
  viewSourceId: null,
  proofIssues: [],
  proofApply: null,
  proofFocus: null,
  splitId: null,
  composition: false,
  sessionStartWords: 0,
  folderView: 'scrivenings',

  openResult: (result) =>
    set({
      meta: result.meta,
      tree: result.tree,
      labels: result.labels,
      selectedId: firstDocument(result.tree),
      saveState: 'idle',
      lastSavedAt: null,
      docWordCount: 0,
      selectionWordCount: 0,
      splitId: null,
      composition: false,
      sessionStartWords: totalWords(result.tree),
      folderView: 'scrivenings'
    }),
  closeProject: () =>
    set({
      meta: null,
      tree: [],
      labels: [],
      selectedId: null,
      saveState: 'idle',
      lastSavedAt: null,
      docWordCount: 0,
      selectionWordCount: 0,
      splitId: null,
      composition: false,
      sessionStartWords: 0
    }),
  setTree: (tree) => set({ tree }),
  setMeta: (meta) => set({ meta }),
  select: (id) => set({ selectedId: id, selectionWordCount: 0 }),
  setSaveState: (state, at) => set(at ? { saveState: state, lastSavedAt: at } : { saveState: state }),
  setDocWordCount: (n) => set({ docWordCount: n }),
  setSelectionWordCount: (n) => set({ selectionWordCount: n }),
  setInserter: (fn) => set({ inserter: fn }),
  setFootnoteInserter: (fn) => set({ footnoteInserter: fn }),
  viewSource: (id) => set({ viewSourceId: id }),
  closeViewSource: () => set({ viewSourceId: null }),
  setProof: (issues, apply, focus) =>
    set({ proofIssues: issues, proofApply: apply, proofFocus: focus }),
  setSplit: (id) => set({ splitId: id }),
  setComposition: (on) => set({ composition: on }),
  setItemWordCount: (id, n) =>
    set((s) => ({
      tree: s.tree.map((it) => (it.id === id ? { ...it, wordCount: n } : it))
    })),
  setFolderView: (view) => set({ folderView: view }),
  patchItem: (id, patch) =>
    set((s) => ({ tree: s.tree.map((it) => (it.id === id ? { ...it, ...patch } : it)) }))
}))
