import { useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BinderItem } from '@shared/types'
import type { LabelDef } from '@shared/api'
import { useStore } from '../store/useStore'
import { childrenOf } from '../lib/tree'

interface Props {
  folderId: string
}

/**
 * Index cards, one per child of the folder, showing the synopsis. Dragging a
 * card reorders it — and that order writes straight back into the binder. A
 * header carries the folder's own synopsis (so a chapter's summary travels with
 * it), plus a button to add fresh cards while outlining.
 */
export default function Corkboard({ folderId }: Props): JSX.Element {
  const tree = useStore((s) => s.tree)
  const labels = useStore((s) => s.labels)
  const setTree = useStore((s) => s.setTree)
  const patchItem = useStore((s) => s.patchItem)
  const folder = useMemo(() => tree.find((t) => t.id === folderId), [tree, folderId])
  const cards = useMemo(() => childrenOf(tree, folderId), [tree, folderId])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onDragEnd = async ({ active, over }: DragEndEvent): Promise<void> => {
    if (!over || active.id === over.id) return
    const ids = cards.map((c) => c.id)
    const newIndex = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))).indexOf(
      String(active.id)
    )
    setTree(await window.api.binder.move({ id: String(active.id), newParentId: folderId, newIndex }))
  }

  const addCard = async (): Promise<void> => {
    const { tree: next } = await window.api.binder.create({
      type: 'document',
      title: 'Untitled',
      parentId: folderId
    })
    setTree(next)
  }

  return (
    <div className="corkboard">
      {folder && (
        <div className="corkboard-head">
          <textarea
            key={folder.id}
            className="corkboard-synopsis"
            defaultValue={folder.synopsis}
            placeholder={`Synopsis for “${folder.title}”…`}
            onBlur={(e) => {
              void window.api.binder.updateSynopsis(folder.id, e.target.value)
              patchItem(folder.id, { synopsis: e.target.value })
            }}
          />
          <button className="cork-add" onClick={addCard} title="Add a new card to this folder">
            ＋ Add card
          </button>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="editor-empty">
          <p>No cards yet.</p>
          <p className="muted">Use “＋ Add card” to start outlining this folder.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={cards.map((c) => c.id)} strategy={rectSortingStrategy}>
            <div className="corkboard-grid">
              {cards.map((card) => (
                <Card key={card.id} item={card} labels={labels} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

function Card({ item, labels }: { item: BinderItem; labels: LabelDef[] }): JSX.Element {
  const select = useStore((s) => s.select)
  const patchItem = useStore((s) => s.patchItem)
  const [editing, setEditing] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id
  })

  const statuses = labels.filter((l) => l.kind === 'status')
  const labelDefs = labels.filter((l) => l.kind === 'label')
  const statusColor = statuses.find((s) => s.id === item.statusId)?.color
  const labelColor = labelDefs.find((l) => l.id === item.labelId)?.color

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderTopColor: statusColor ?? 'var(--rule-strong)'
  }

  const commitTitle = (value: string): void => {
    setEditing(false)
    const title = value.trim()
    if (!title || title === item.title) return
    void window.api.binder.rename(item.id, title)
    patchItem(item.id, { title })
  }

  return (
    <div ref={setNodeRef} style={style} className="card">
      <div className="card-grab">
        <span className="card-icon" {...attributes} {...listeners} title="Drag to reorder">
          {item.type === 'folder' ? '📁' : '📄'}
        </span>
        {editing ? (
          <input
            autoFocus
            className="card-title-input"
            defaultValue={item.title}
            onBlur={(e) => commitTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle((e.target as HTMLInputElement).value)
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span
            className="card-title"
            title="Click to open · double-click to rename"
            onClick={() => select(item.id)}
            onDoubleClick={() => setEditing(true)}
          >
            {item.title}
          </span>
        )}
        {labelColor && <span className="card-label-dot" style={{ background: labelColor }} />}
      </div>
      <textarea
        className="card-synopsis"
        defaultValue={item.synopsis}
        placeholder="Synopsis…"
        onBlur={(e) => {
          void window.api.binder.updateSynopsis(item.id, e.target.value)
          patchItem(item.id, { synopsis: e.target.value })
        }}
      />
      <div className="card-footer">
        <select
          value={item.statusId ?? ''}
          onChange={(e) => {
            const v = e.target.value || null
            void window.api.binder.setStatus(item.id, v)
            patchItem(item.id, { statusId: v })
          }}
        >
          <option value="">No status</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={item.labelId ?? ''}
          onChange={(e) => {
            const v = e.target.value || null
            void window.api.binder.setLabel(item.id, v)
            patchItem(item.id, { labelId: v })
          }}
        >
          <option value="">No label</option>
          {labelDefs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
