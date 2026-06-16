import { randomUUID } from 'crypto'
import type { Collection, CollectionCriteria } from '@shared/types'
import type { DB } from './db'

interface CollectionRow {
  id: string
  name: string
  criteria_json: string
  created_at: number
}

function toCollection(r: CollectionRow): Collection {
  return { id: r.id, name: r.name, criteria: JSON.parse(r.criteria_json), createdAt: r.created_at }
}

export function listCollections(db: DB): Collection[] {
  const rows = db.prepare('SELECT * FROM collections ORDER BY created_at').all() as CollectionRow[]
  return rows.map(toCollection)
}

export function createCollection(db: DB, name: string, criteria: CollectionCriteria): Collection {
  const id = randomUUID()
  const createdAt = Date.now()
  db.prepare(
    'INSERT INTO collections (id, name, criteria_json, created_at) VALUES (?, ?, ?, ?)'
  ).run(id, name, JSON.stringify(criteria), createdAt)
  return { id, name, criteria, createdAt }
}

export function removeCollection(db: DB, id: string): Collection[] {
  db.prepare('DELETE FROM collections WHERE id = ?').run(id)
  return listCollections(db)
}
