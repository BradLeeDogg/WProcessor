import { create } from 'zustand'
import type { BinderItem, ProjectMeta } from '@shared/types'
import type { LabelDef, OpenProjectResult } from '@shared/api'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface AppState {
  meta: ProjectMeta | null
  tree: BinderItem[]
  labels: LabelDef[]
  selectedId: string | null

  saveState: SaveState
  lastSavedAt: number | null
  docWordCount: number
  selectionWordCount: number

  openResult: (result: OpenProjectResult) => void
  closeProject: () => void
  setTree: (tree: BinderItem[]) => void
  setMeta: (meta: ProjectMeta) => void
  select: (id: string | null) => void
  setSaveState: (state: SaveState, at?: number) => void
  setDocWordCount: (n: number) => void
  setSelectionWordCount: (n: number) => void
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

  openResult: (result) =>
    set({
      meta: result.meta,
      tree: result.tree,
      labels: result.labels,
      selectedId: firstDocument(result.tree),
      saveState: 'idle',
      lastSavedAt: null,
      docWordCount: 0,
      selectionWordCount: 0
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
      selectionWordCount: 0
    }),
  setTree: (tree) => set({ tree }),
  setMeta: (meta) => set({ meta }),
  select: (id) => set({ selectedId: id, selectionWordCount: 0 }),
  setSaveState: (state, at) => set(at ? { saveState: state, lastSavedAt: at } : { saveState: state }),
  setDocWordCount: (n) => set({ docWordCount: n }),
  setSelectionWordCount: (n) => set({ selectionWordCount: n })
}))
