import { arrayMove } from '@dnd-kit/sortable'
import type { BinderItem } from '@shared/types'

export const INDENT_WIDTH = 18

export interface FlatNode extends BinderItem {
  depth: number
  childCount: number
}

function groupByParent(items: BinderItem[]): Map<string | null, BinderItem[]> {
  const byParent = new Map<string | null, BinderItem[]>()
  for (const it of items) {
    const arr = byParent.get(it.parentId) ?? []
    arr.push(it)
    byParent.set(it.parentId, arr)
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.position - b.position)
  return byParent
}

/** Depth-first flatten of the visible tree (children of collapsed folders omitted). */
export function flattenVisible(items: BinderItem[]): FlatNode[] {
  const byParent = groupByParent(items)
  const out: FlatNode[] = []
  const walk = (parentId: string | null, depth: number): void => {
    for (const child of byParent.get(parentId) ?? []) {
      const kids = byParent.get(child.id) ?? []
      out.push({ ...child, depth, childCount: kids.length })
      if (child.type === 'folder' && !child.collapsed) walk(child.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

export interface Projection {
  depth: number
  parentId: string | null
}

function dragDepth(offset: number): number {
  return Math.round(offset / INDENT_WIDTH)
}

/**
 * Compute the drop target (depth + parent) from the horizontal drag offset.
 * Faithful to the dnd-kit sortable-tree pattern, constrained so only folders
 * can be parents.
 */
export function getProjection(
  items: FlatNode[],
  activeId: string,
  overId: string,
  offsetLeft: number
): Projection {
  const overIndex = items.findIndex((i) => i.id === overId)
  const activeIndex = items.findIndex((i) => i.id === activeId)
  const activeItem = items[activeIndex]
  if (!activeItem || overIndex === -1) return { depth: 0, parentId: null }

  const newItems = arrayMove(items, activeIndex, overIndex)
  const previousItem = newItems[overIndex - 1]
  const nextItem = newItems[overIndex + 1]
  const projectedDepth = activeItem.depth + dragDepth(offsetLeft)

  // Only folders accept children, so nesting under a document is disallowed.
  const maxDepth = previousItem
    ? previousItem.type === 'folder'
      ? previousItem.depth + 1
      : previousItem.depth
    : 0
  const minDepth = nextItem ? nextItem.depth : 0

  let depth = projectedDepth
  if (projectedDepth >= maxDepth) depth = maxDepth
  else if (projectedDepth < minDepth) depth = minDepth

  const parentId = ((): string | null => {
    if (depth === 0 || !previousItem) return null
    if (depth === previousItem.depth) return previousItem.parentId
    if (depth > previousItem.depth) return previousItem.id
    const candidate = newItems
      .slice(0, overIndex)
      .reverse()
      .find((i) => i.depth === depth)
    return candidate?.parentId ?? null
  })()

  return { depth, parentId }
}

/**
 * Translate a drag result into a (newParentId, newIndex) move. newIndex is the
 * position among the target parent's children in the post-move flattened order.
 */
export function toMove(
  items: FlatNode[],
  activeId: string,
  overId: string,
  parentId: string | null
): { newParentId: string | null; newIndex: number } {
  const activeIndex = items.findIndex((i) => i.id === activeId)
  const overIndex = items.findIndex((i) => i.id === overId)
  const newOrder = arrayMove(items, activeIndex, overIndex)
  const activePos = newOrder.findIndex((i) => i.id === activeId)
  let newIndex = 0
  for (let i = 0; i < activePos; i++) {
    if (newOrder[i]!.parentId === parentId) newIndex++
  }
  return { newParentId: parentId, newIndex }
}
