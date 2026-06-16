import { useMemo, useRef, useState } from 'react'
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

      <div className="binder-tree">
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
  onSelect: () => void
  onToggle: () => void
  onStartRename: () => void
  onCommitRename: (title: string) => void
  onCancelRename: () => void
}

function BinderRow(props: RowProps): JSX.Element {
  const { node, depth, selected, renaming } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
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
      ref={setNodeRef}
      style={style}
      className={`binder-row ${selected ? 'selected' : ''}`}
      onClick={props.onSelect}
      {...attributes}
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
