import { randomUUID } from 'crypto'
import type { MetaField, MetaFieldType, MetaValues } from '@shared/types'
import type { DB } from './db'

interface FieldRow {
  id: string
  name: string
  type: string
  options_json: string
  position: number
}

function toField(r: FieldRow): MetaField {
  return {
    id: r.id,
    name: r.name,
    type: r.type as MetaFieldType,
    options: JSON.parse(r.options_json),
    position: r.position
  }
}

export function listFields(db: DB): MetaField[] {
  const rows = db.prepare('SELECT * FROM metadata_fields ORDER BY position').all() as FieldRow[]
  return rows.map(toField)
}

export function createField(
  db: DB,
  name: string,
  type: MetaFieldType,
  options: string[] = []
): MetaField {
  const id = randomUUID()
  const pos = (
    db.prepare('SELECT COALESCE(MAX(position) + 1, 0) AS p FROM metadata_fields').get() as {
      p: number
    }
  ).p
  db.prepare(
    'INSERT INTO metadata_fields (id, name, type, options_json, position) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, type, JSON.stringify(options), pos)
  return { id, name, type, options, position: pos }
}

export function updateField(
  db: DB,
  id: string,
  patch: Partial<Pick<MetaField, 'name' | 'type' | 'options'>>
): MetaField[] {
  const cur = db.prepare('SELECT * FROM metadata_fields WHERE id = ?').get(id) as FieldRow | undefined
  if (cur) {
    db.prepare('UPDATE metadata_fields SET name = ?, type = ?, options_json = ? WHERE id = ?').run(
      patch.name ?? cur.name,
      patch.type ?? cur.type,
      patch.options ? JSON.stringify(patch.options) : cur.options_json,
      id
    )
  }
  return listFields(db)
}

export function removeField(db: DB, id: string): MetaField[] {
  db.prepare('DELETE FROM metadata_fields WHERE id = ?').run(id)
  db.prepare('DELETE FROM metadata_values WHERE field_id = ?').run(id)
  return listFields(db)
}

export function getValues(db: DB, itemId: string): MetaValues {
  const rows = db
    .prepare('SELECT field_id, value FROM metadata_values WHERE item_id = ?')
    .all(itemId) as Array<{ field_id: string; value: string }>
  const out: MetaValues = {}
  for (const r of rows) out[r.field_id] = r.value
  return out
}

export function setValue(db: DB, itemId: string, fieldId: string, value: string): void {
  if (value === '') {
    db.prepare('DELETE FROM metadata_values WHERE item_id = ? AND field_id = ?').run(itemId, fieldId)
    return
  }
  db.prepare(
    `INSERT INTO metadata_values (item_id, field_id, value) VALUES (?, ?, ?)
     ON CONFLICT(item_id, field_id) DO UPDATE SET value = excluded.value`
  ).run(itemId, fieldId, value)
}

/** Default fields seeded for narrative-driven project types. */
export function seedDefaultFields(db: DB, names: Array<[string, MetaFieldType]>): void {
  names.forEach(([name, type], i) => {
    db.prepare(
      'INSERT INTO metadata_fields (id, name, type, options_json, position) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), name, type, '[]', i)
  })
}
