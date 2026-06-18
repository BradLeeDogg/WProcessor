import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BinderItem } from '@shared/types'
import { useStore } from '../store/useStore'
import { flattenVisible, getProjection, toMove, INDENT_WIDTH, type FlatNode } from '../lib/tree'
import { onCommand } from '../lib/commands'

const BASE_PAD = 8

function removeSubtree(flat: FlatNode[], id: string): FlatNode[] {
  const idx = flat.findIndex((i) => i.id === id)
  if (idx < 0) return flat
  const item = flat[idx]!
  const out = flat.slice()
  let i = idx + 1
  while (i < out.length && out[i]!.depth > item.depth) i++
  out.splice(idx + 1, i - (idx + 1))
  return out
}

export default function Binder(): JSX.Element {
  const tree = useStore((s) => s.tree)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const setTree = useStore((s) => s.setTree)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [offsetLeft, setOffsetLeft] = useState(0)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const flattened = useMemo(() => {
    const all = flattenVisible(tree)
    return activeId ? removeSubtree(all, activeId) : all
  }, [tree, activeId])

  const ids = useMemo(() => flattened.map((f) => f.id), [flattened])
  const projected =
    activeId && overId ? getProjection(flattened, activeId, overId, offsetLeft) : null
  const activeItem = flattened.find((f) => f.id === activeId) ?? null

  const selectedItem = tree.find((t) => t.id === selectedId) ?? null

  // Where new items go: inside a selected folder, else beside the selection.
  const newItemParent = (): string | null => {
    if (!selectedItem) return null
    return selectedItem.type === 'folder' ? selectedItem.id : selectedItem.parentId
  }

  const addItem = async (type: 'folder' | 'document'): Promise<void> => {
    const { item, tree: next } = await window.api.binder.create({
      type,
      title: type === 'folder' ? 'New Folder' : 'Untitled',
      parentId: newItemParent()
    })
    setTree(next)
    select(item.id)
    setRenamingId(item.id)
  }

  const importDoc = async (): Promise<void> => {
    const res = await window.api.importer.file(newItemParent())
    if (res) {
      setTree(res.tree)
      select(res.item.id)
    }
  }

  const importScriv = async (): Promise<void> => {
    const res = await window.api.importer.scrivener(newItemParent())
    if (res) {
      setTree(res.tree)
      select(res.rootId)
    }
  }

  const removeItem = async (item: BinderItem): Promise<void> => {
    const ok = window.confirm(
      `Delete “${item.title}”${item.type === 'folder' ? ' and everything inside it' : ''}? This can be recovered from a backup, but not undone here.`
    )
    if (!ok) return
    const next = await window.api.binder.remove(item.id)
    setTree(next)
    if (selectedId === item.id) select(null)
  }

  const commitRename = async (id: string, title: string): Promise<void> => {
    setRenamingId(null)
    const trimmed = title.trim()
    if (!trimmed) return
    setTree(await window.api.binder.rename(id, trimmed))
  }

  const toggleCollapse = async (item: FlatNode): Promise<void> => {
    await window.api.binder.setCollapsed(item.id, !item.collapsed)
    setTree(await window.api.binder.list())
  }

  // Menu/shortcut commands for binder actions (ref keeps closures fresh).
  const cmdRef = useRef<(cmd: string) => void>(() => {})
  cmdRef.current = (cmd) => {
    if (cmd === 'new-doc') void addItem('document')
    else if (cmd === 'new-folder') void addItem('folder')
  }
  useEffect(() => onCommand((cmd) => cmdRef.current(cmd)), [])

  // Roving focus: keep DOM focus on the selected row for keyboard nav + AT.
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  useEffect(() => {
    if (selectedId) rowRefs.current.get(selectedId)?.focus()
  }, [selectedId])

  const selectAt = (i: number): void => {
    const node = flattened[Math.max(0, Math.min(i, flattened.length - 1))]
    if (node) select(node.id)
  }
  const moveSibling = async (item: FlatNode, dir: 'up' | 'down'): Promise<void> => {
    const sibs = tree.filter((t) => t.parentId === item.parentId).sort((a, b) => a.position - b.position)
    const cur = sibs.findIndex((s) => s.id === item.id)
    const target = dir === 'up' ? cur - 1 : cur + 1
    if (target < 0 || target >= sibs.length) return
    setTree(await window.api.binder.move({ id: item.id, newParentId: item.parentId, newIndex: target }))
  }

  const onTreeKeyDown = (e: React.KeyboardEvent): void => {
    if (renamingId) return
    const idx = flattened.findIndex((f) => f.id === selectedId)
    const cur = idx >= 0 ? flattened[idx] : null
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
      if (cur) {
        e.preventDefault()
        void moveSibling(cur, e.key === 'ArrowUp' ? 'up' : 'down')
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        selectAt(idx + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        selectAt(idx < 0 ? 0 : idx - 1)
        break
      case 'ArrowRight':
        if (cur?.type === 'folder' && cur.collapsed) void toggleCollapse(cur)
        else if (cur) selectAt(idx + 1)
        break
      case 'ArrowLeft':
        if (cur?.type === 'folder' && !cur.collapsed) void toggleCollapse(cur)
        else if (cur?.parentId) select(cur.parentId)
        break
      case 'F2':
        if (cur) {
          e.preventDefault()
          setRenamingId(cur.id)
        }
        break
      case 'Delete':
      case 'Backspace':
        if (cur) {
          e.preventDefault()
          void removeItem(cur)
        }
        break
    }
  }

  const resetDrag = (): void => {
    setActiveId(null)
    setOverId(null)
    setOffsetLeft(0)
  }

  const onDragStart = ({ active }: DragStartEvent): void => {
    setActiveId(String(active.id))
    setOverId(String(active.id))
  }
  const onDragMove = ({ delta }: DragMoveEvent): void => setOffsetLeft(delta.x)
  const onDragOver = ({ over }: DragOverEvent): void => setOverId(over ? String(over.id) : null)
  const onDragEnd = async ({ active, over }: DragEndEvent): Promise<void> => {
    const a = String(active.id)
    const o = over ? String(over.id) : null
    const proj = o ? getProjection(flattened, a, o, offsetLeft) : null
    resetDrag()
    if (!o || !proj) return
    const { newParentId, newIndex } = toMove(flattened, a, o, proj.parentId)
    setTree(await window.api.binder.move({ id: a, newParentId, newIndex }))
  }

  return (
    <div className="binder">
      <div className="binder-toolbar">
        <button title="New folder" onClick={() => addItem('folder')}>
          ＋ Folder
        </button>
        <button title="New document" onClick={() => addItem('document')}>
          ＋ Doc
        </button>
        <button title="Import DOCX / Markdown / RTF / TXT" onClick={importDoc}>
          ⤓
        </button>
        <button title="Import Scrivener project (.scriv)" onClick={importScriv}>
          ⇲
        </button>
        <span className="spacer" />
        {selectedItem && (
          <button
            title="Delete selected"
            className="danger"
            onClick={() => removeItem(selectedItem)}
          >
            🗑
          </button>
        )}
      </div>

      <div className="binder-tree" role="tree" aria-label="Project binder" onKeyDown={onTreeKeyDown}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={resetDrag}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {flattened.map((node) => (
              <BinderRow
                key={node.id}
                node={node}
                depth={node.id === activeId && projected ? projected.depth : node.depth}
                selected={node.id === selectedId}
                renaming={node.id === renamingId}
                onRef={(el) => {
                  if (el) rowRefs.current.set(node.id, el)
                  else rowRefs.current.delete(node.id)
                }}
                onSelect={() => select(node.id)}
                onToggle={() => toggleCollapse(node)}
                onStartRename={() => setRenamingId(node.id)}
                onCommitRename={(title) => commitRename(node.id, title)}
                onCancelRename={() => setRenamingId(null)}
              />
            ))}
          </SortableContext>
          <DragOverlay>
            {activeItem ? <div className="binder-row drag-ghost">{activeItem.title}</div> : null}
          </DragOverlay>
        </DndContext>
        {flattened.length === 0 && <p className="muted binder-empty">No items yet.</p>}
      </div>
    </div>
  )
}

interface RowProps {
  node: FlatNode
  depth: number
  selected: boolean
  renaming: boolean
  onRef: (el: HTMLDivElement | null) => void
  onSelect: () => void
  onToggle: () => void
  onStartRename: () => void
  onCommitRename: (title: string) => void
  onCancelRename: () => void
}

function BinderRow(props: RowProps): JSX.Element {
  const { node, depth, selected, renaming } = props
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id
  })
  const inputRef = useRef<HTMLInputElement>(null)

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    paddingLeft: BASE_PAD + depth * INDENT_WIDTH,
    opacity: isDragging ? 0.4 : 1
  }

  return (
    <div
      ref={(el) => {
        setNodeRef(el)
        props.onRef(el)
      }}
      style={style}
      className={`binder-row ${selected ? 'selected' : ''}`}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={node.type === 'folder' ? !node.collapsed : undefined}
      tabIndex={selected ? 0 : -1}
      onClick={props.onSelect}
      {...listeners}
    >
      {node.type === 'folder' ? (
        <button
          className="caret"
          onClick={(e) => {
            e.stopPropagation()
            props.onToggle()
          }}
        >
          {node.collapsed ? '▸' : '▾'}
        </button>
      ) : (
        <span className="caret-spacer" />
      )}
      <span className="row-icon">{node.type === 'folder' ? '📁' : '📄'}</span>
      {renaming ? (
        <input
          ref={inputRef}
          autoFocus
          className="rename-input"
          defaultValue={node.title}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => props.onCommitRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') props.onCommitRename((e.target as HTMLInputElement).value)
            if (e.key === 'Escape') props.onCancelRename()
          }}
        />
      ) : (
        <span
          className="row-title"
          onDoubleClick={(e) => {
            e.stopPropagation()
            props.onStartRename()
          }}
        >
          {node.title}
        </span>
      )}
    </div>
  )
}
