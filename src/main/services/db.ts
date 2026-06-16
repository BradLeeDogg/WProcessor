import Database from 'better-sqlite3'
import type { BinderItem } from '@shared/types'
import type { LabelDef } from '@shared/api'

export type DB = Database.Database

/**
 * Open (or create) the per-project SQLite database, applying pragmas tuned for
 * durability and running idempotent migrations. The DB holds structure and
 * metadata only — prose lives in individual files under documents/.
 */
export function openDatabase(dbPath: string): DB {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL') // crash-safe, allows concurrent readers
  db.pragma('synchronous = FULL') // metadata index for a life's work — favor safety
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

// Each block advances user_version by one; new databases run through all of them.
function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number
  if (current < 1) {
    db.exec(`
      CREATE TABLE meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE binder_items (
        id          TEXT PRIMARY KEY,
        parent_id   TEXT,
        position    INTEGER NOT NULL,
        type        TEXT NOT NULL,
        title       TEXT NOT NULL,
        synopsis    TEXT NOT NULL DEFAULT '',
        label_id    TEXT,
        status_id   TEXT,
        collapsed   INTEGER NOT NULL DEFAULT 0,
        is_special  INTEGER NOT NULL DEFAULT 0,
        word_count  INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX idx_binder_parent ON binder_items(parent_id, position);

      CREATE TABLE labels (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        color     TEXT NOT NULL,
        kind      TEXT NOT NULL,
        position  INTEGER NOT NULL
      );

      CREATE TABLE snapshots (
        id          TEXT PRIMARY KEY,
        item_id     TEXT NOT NULL,
        name        TEXT NOT NULL,
        word_count  INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX idx_snapshots_item ON snapshots(item_id, created_at DESC);
    `)
    db.pragma('user_version = 1')
  }
  if (current < 2) {
    db.exec(`
      CREATE TABLE collections (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        criteria_json TEXT NOT NULL,
        created_at    INTEGER NOT NULL
      );
    `)
    db.pragma('user_version = 2')
  }
  if (current < 3) {
    db.exec(`
      ALTER TABLE binder_items ADD COLUMN notes TEXT NOT NULL DEFAULT '';

      CREATE TABLE metadata_fields (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        type         TEXT NOT NULL,          -- 'text' | 'select' | 'number'
        options_json TEXT NOT NULL DEFAULT '[]',
        position     INTEGER NOT NULL
      );

      CREATE TABLE metadata_values (
        item_id  TEXT NOT NULL,
        field_id TEXT NOT NULL,
        value    TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (item_id, field_id)
      );
      CREATE INDEX idx_meta_values_item ON metadata_values(item_id);
    `)
    db.pragma('user_version = 3')
  }
}

// --- meta key/value helpers -------------------------------------------------

export function getMetaValue(db: DB, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setMetaValue(db: DB, key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}

// --- row mapping ------------------------------------------------------------

interface BinderRow {
  id: string
  parent_id: string | null
  position: number
  type: string
  title: string
  synopsis: string
  notes: string
  label_id: string | null
  status_id: string | null
  collapsed: number
  is_special: number
  word_count: number
  created_at: number
  updated_at: number
}

export function rowToBinderItem(r: BinderRow): BinderItem {
  return {
    id: r.id,
    parentId: r.parent_id,
    position: r.position,
    type: r.type as BinderItem['type'],
    title: r.title,
    synopsis: r.synopsis,
    notes: r.notes ?? '',
    labelId: r.label_id,
    statusId: r.status_id,
    collapsed: r.collapsed === 1,
    isSpecial: r.is_special === 1,
    wordCount: r.word_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function listBinder(db: DB): BinderItem[] {
  const rows = db
    .prepare('SELECT * FROM binder_items ORDER BY parent_id, position')
    .all() as BinderRow[]
  return rows.map(rowToBinderItem)
}

export function listLabels(db: DB): LabelDef[] {
  const rows = db.prepare('SELECT * FROM labels ORDER BY kind, position').all() as Array<{
    id: string
    name: string
    color: string
    kind: string
    position: number
  }>
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    kind: r.kind as LabelDef['kind'],
    position: r.position
  }))
}
