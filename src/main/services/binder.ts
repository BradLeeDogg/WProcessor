import { randomUUID } from 'crypto'
import type { BinderItem } from '@shared/types'
import type { BinderCreateInput, BinderMoveInput } from '@shared/api'
import { type DB, listBinder, rowToBinderItem } from './db'

function now(): number {
  return Date.now()
}

function getItem(db: DB, id: string): BinderItem | null {
  const row = db.prepare('SELECT * FROM binder_items WHERE id = ?').get(id) as
    | Parameters<typeof rowToBinderItem>[0]
    | undefined
  return row ? rowToBinderItem(row) : null
}

/** Sibling ids under a parent, in position order (optionally excluding one). */
function siblingIds(db: DB, parentId: string | null, excludeId?: string): string[] {
  const rows = db
    .prepare(
      `SELECT id FROM binder_items WHERE parent_id IS ? ORDER BY position`
    )
    .all(parentId) as Array<{ id: string }>
  return rows.map((r) => r.id).filter((id) => id !== excludeId)
}

/** Rewrite a sibling list's positions to 0..n-1 in the given order. */
function writePositions(db: DB, ids: string[]): void {
  const stmt = db.prepare('UPDATE binder_items SET position = ? WHERE id = ?')
  ids.forEach((id, i) => stmt.run(i, id))
}

/** Collect an item and all of its descendants (the item id is included). */
function collectSubtree(db: DB, id: string): string[] {
  const out: string[] = []
  const queue = [id]
  const childStmt = db.prepare('SELECT id FROM binder_items WHERE parent_id = ?')
  while (queue.length) {
    const current = queue.shift()!
    out.push(current)
    for (const row of childStmt.all(current) as Array<{ id: string }>) queue.push(row.id)
  }
  return out
}

export function createItem(db: DB, input: BinderCreateInput): BinderItem {
  const id = randomUUID()
  const ts = now()
  const txn = db.transaction(() => {
    const siblings = siblingIds(db, input.parentId)
    const index = Math.max(0, Math.min(input.index ?? siblings.length, siblings.length))
    siblings.splice(index, 0, id)
    db.prepare(
      `INSERT INTO binder_items (id, parent_id, position, type, title, synopsis, collapsed, is_special, word_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '', 0, 0, 0, ?, ?)`
    ).run(id, input.parentId, index, input.type, input.title, ts, ts)
    writePositions(db, siblings)
  })
  txn()
  return getItem(db, id)!
}

/** Create an item with explicit synopsis/special flags (used by templates). */
export function createItemFull(
  db: DB,
  args: {
    type: 'folder' | 'document'
    title: string
    parentId: string | null
    synopsis?: string
    isSpecial?: boolean
  }
): BinderItem {
  const item = createItem(db, { type: args.type, title: args.title, parentId: args.parentId })
  if (args.synopsis || args.isSpecial) {
    db.prepare('UPDATE binder_items SET synopsis = ?, is_special = ? WHERE id = ?').run(
      args.synopsis ?? '',
      args.isSpecial ? 1 : 0,
      item.id
    )
  }
  return getItem(db, item.id)!
}

export function renameItem(db: DB, id: string, title: string): void {
  db.prepare('UPDATE binder_items SET title = ?, updated_at = ? WHERE id = ?').run(title, now(), id)
}

export function setSynopsis(db: DB, id: string, synopsis: string): void {
  db.prepare('UPDATE binder_items SET synopsis = ?, updated_at = ? WHERE id = ?').run(
    synopsis,
    now(),
    id
  )
}

export function setLabel(db: DB, id: string, labelId: string | null): void {
  db.prepare('UPDATE binder_items SET label_id = ?, updated_at = ? WHERE id = ?').run(
    labelId,
    now(),
    id
  )
}

export function setStatus(db: DB, id: string, statusId: string | null): void {
  db.prepare('UPDATE binder_items SET status_id = ?, updated_at = ? WHERE id = ?').run(
    statusId,
    now(),
    id
  )
}

export function setCollapsed(db: DB, id: string, collapsed: boolean): void {
  db.prepare('UPDATE binder_items SET collapsed = ? WHERE id = ?').run(collapsed ? 1 : 0, id)
}

export function setWordCount(db: DB, id: string, count: number): void {
  db.prepare('UPDATE binder_items SET word_count = ? WHERE id = ?').run(count, id)
}

/** Delete an item and its subtree. Returns ids whose files on disk must be removed. */
export function removeItem(
  db: DB,
  id: string
): { deletedDocumentIds: string[]; deletedSnapshotIds: string[] } {
  const target = getItem(db, id)
  if (!target) return { deletedDocumentIds: [], deletedSnapshotIds: [] }
  let deletedDocumentIds: string[] = []
  const deletedSnapshotIds: string[] = []
  const txn = db.transaction(() => {
    const subtree = collectSubtree(db, id)
    deletedDocumentIds = subtree.filter((sid) => getItem(db, sid)?.type === 'document')
    const snapStmt = db.prepare('SELECT id FROM snapshots WHERE item_id = ?')
    const del = db.prepare('DELETE FROM binder_items WHERE id = ?')
    const delSnaps = db.prepare('DELETE FROM snapshots WHERE item_id = ?')
    for (const sid of subtree) {
      for (const r of snapStmt.all(sid) as Array<{ id: string }>) deletedSnapshotIds.push(r.id)
      delSnaps.run(sid)
      del.run(sid)
    }
    // Re-compact the former parent's siblings.
    writePositions(db, siblingIds(db, target.parentId))
  })
  txn()
  return { deletedDocumentIds, deletedSnapshotIds }
}

export function moveItem(db: DB, input: BinderMoveInput): void {
  const { id, newParentId, newIndex } = input
  const item = getItem(db, id)
  if (!item) throw new Error('Cannot move: item not found')

  // Guard against creating a cycle (moving a node into its own subtree).
  if (newParentId !== null) {
    const subtree = new Set(collectSubtree(db, id))
    if (subtree.has(newParentId)) throw new Error('Cannot move an item into its own descendant')
  }

  const txn = db.transaction(() => {
    const oldParentId = item.parentId
    const target = siblingIds(db, newParentId, id)
    const index = Math.max(0, Math.min(newIndex, target.length))
    target.splice(index, 0, id)

    db.prepare('UPDATE binder_items SET parent_id = ?, updated_at = ? WHERE id = ?').run(
      newParentId,
      now(),
      id
    )
    writePositions(db, target)
    if (oldParentId !== newParentId) {
      writePositions(db, siblingIds(db, oldParentId, id))
    }
  })
  txn()
}

export { listBinder }
