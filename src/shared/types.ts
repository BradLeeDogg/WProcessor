// Core data model shared across the main and renderer processes.
// Canonical document content is TipTap/ProseMirror JSON — see DocumentContent.

/** Project archetypes that drive starter templates and enabled workflows. */
export type ProjectType =
  | 'novel'
  | 'novella'
  | 'short-story'
  | 'nonfiction-book'
  | 'journalism-short'
  | 'journalism-long'
  | 'dissertation'

/** A node in the binder tree. Folders organize; documents hold prose. */
export type BinderItemType = 'folder' | 'document'

export interface BinderItem {
  id: string
  parentId: string | null
  /** Sort order among siblings (0-based). */
  position: number
  type: BinderItemType
  title: string
  synopsis: string
  notes: string
  labelId: string | null
  statusId: string | null
  /** Whether this folder is collapsed in the binder UI. */
  collapsed: boolean
  /** True for template-created structural folders (e.g. Manuscript, Research). */
  isSpecial: boolean
  createdAt: number
  updatedAt: number
  /** Cached word count for outliner/targets; recomputed on save. */
  wordCount: number
}

/** ProseMirror/TipTap document JSON. Opaque to the storage layer. */
export interface ProseMirrorNode {
  type: string
  attrs?: Record<string, unknown>
  content?: ProseMirrorNode[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
}

export interface DocumentContent {
  /** Schema/format version for forward migration. */
  version: number
  /** Root ProseMirror doc node. */
  doc: ProseMirrorNode
}

/** Manuscript "paper" defaults — also the default export layout. */
export interface ManuscriptDefaults {
  fontFamily: string
  fontSizePt: number
  /** 1 = single, 2 = double. */
  lineSpacing: number
  marginInches: number
  pageSize: 'us-letter' | 'a4'
}

export interface ProjectSettings {
  manuscript: ManuscriptDefaults
  /** Journalism types turn this on by default. */
  factCheckEnabled: boolean
  theme: 'paper' | 'dark'
  typewriterSound: boolean
  autosaveDebounceMs: number
  backupIntervalMs: number
  maxAutomaticBackups: number
  /** Writing targets & deadline (null = unset). */
  projectWordTarget?: number | null
  sessionWordTarget?: number | null
  deadline?: string | null
}

export interface ProjectMeta {
  id: string
  title: string
  type: ProjectType
  /** Absolute path to the .writeproject folder. */
  path: string
  settings: ProjectSettings
  createdAt: number
  updatedAt: number
}

export interface RecentProject {
  path: string
  title: string
  type: ProjectType
  lastOpenedAt: number
}

export interface Snapshot {
  id: string
  /** Binder item this snapshot belongs to (document-level). */
  itemId: string
  name: string
  createdAt: number
  wordCount: number
}

export interface BackupInfo {
  fileName: string
  path: string
  createdAt: number
  sizeBytes: number
}

/** Filter that drives both ad-hoc search and saved collections. */
export interface CollectionCriteria {
  text?: string
  labelId?: string | null
  statusId?: string | null
}

export interface SearchResult {
  itemId: string
  title: string
  snippet: string
  matches: number
}

/** A saved, reusable, dynamic grouping evaluated from its criteria. */
export interface Collection {
  id: string
  name: string
  criteria: CollectionCriteria
  createdAt: number
}

export type MetaFieldType = 'text' | 'select' | 'number'

/** A user-definable, project-level metadata field (e.g. POV, Setting). */
export interface MetaField {
  id: string
  name: string
  type: MetaFieldType
  options: string[]
  position: number
}

/** Per-item metadata: fieldId -> value. */
export type MetaValues = Record<string, string>

export const DEFAULT_MANUSCRIPT: ManuscriptDefaults = {
  fontFamily: 'Times New Roman',
  fontSizePt: 12,
  lineSpacing: 2,
  marginInches: 1,
  pageSize: 'us-letter'
}

export const PROJECT_DIR_SUFFIX = '.writeproject'
export const DOCUMENT_CONTENT_VERSION = 1
