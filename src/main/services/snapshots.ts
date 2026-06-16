import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import type { DocumentContent, Snapshot } from '@shared/types'
import type { DB } from './db'
import { snapshotFile } from './paths'
import { readJson, writeJsonAtomic } from './atomic'
import { countWords, emptyDoc, readDocument, writeDocument } from './documents'
import { setWordCount } from './binder'

interface SnapshotRow {
  id: string
  item_id: string
  name: string
  word_count: number
  created_at: number
}

function rowToSnapshot(r: SnapshotRow): Snapshot {
  return {
    id: r.id,
    itemId: r.item_id,
    name: r.name,
    wordCount: r.word_count,
    createdAt: r.created_at
  }
}

/** Capture the current content of a document as a named, restorable snapshot. */
export async function createSnapshot(
  db: DB,
  root: string,
  itemId: string,
  name: string
): Promise<Snapshot> {
  const content = (await readDocument(root, itemId)) ?? emptyDoc()
  const id = randomUUID()
  const createdAt = Date.now()
  const wordCount = countWords(content)
  await writeJsonAtomic(snapshotFile(root, id), content)
  db.prepare(
    'INSERT INTO snapshots (id, item_id, name, word_count, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, itemId, name, wordCount, createdAt)
  return { id, itemId, name, wordCount, createdAt }
}

export function listSnapshots(db: DB, itemId: string): Snapshot[] {
  const rows = db
    .prepare('SELECT * FROM snapshots WHERE item_id = ? ORDER BY created_at DESC')
    .all(itemId) as SnapshotRow[]
  return rows.map(rowToSnapshot)
}

export async function readSnapshot(root: string, snapshotId: string): Promise<DocumentContent | null> {
  return readJson<DocumentContent>(snapshotFile(root, snapshotId))
}

/** Roll a document back to a snapshot. The current content is overwritten. */
export async function restoreSnapshot(
  db: DB,
  root: string,
  snapshotId: string
): Promise<DocumentContent> {
  const row = db.prepare('SELECT * FROM snapshots WHERE id = ?').get(snapshotId) as
    | SnapshotRow
    | undefined
  if (!row) throw new Error('Snapshot not found')
  const content = await readJson<DocumentContent>(snapshotFile(root, snapshotId))
  if (!content) throw new Error('Snapshot file missing')
  await writeDocument(root, row.item_id, content)
  setWordCount(db, row.item_id, countWords(content))
  return content
}

export async function removeSnapshot(
  db: DB,
  root: string,
  snapshotId: string
): Promise<Snapshot[]> {
  const row = db.prepare('SELECT item_id FROM snapshots WHERE id = ?').get(snapshotId) as
    | { item_id: string }
    | undefined
  db.prepare('DELETE FROM snapshots WHERE id = ?').run(snapshotId)
  await fs.rm(snapshotFile(root, snapshotId), { force: true })
  return row ? listSnapshots(db, row.item_id) : []
}
