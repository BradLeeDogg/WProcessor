import type {
  BinderItem,
  BinderItemType,
  BackupInfo,
  ClaimStatus,
  ClaimWithSources,
  Collection,
  CollectionCriteria,
  CompileRequest,
  DocumentContent,
  MetaField,
  MetaFieldType,
  MetaValues,
  ProjectMeta,
  ProjectSettings,
  ProjectType,
  RecentProject,
  SearchResult,
  Snapshot,
  Source,
  SourceKind
} from './types'

export interface ManualSourceInput {
  kind: SourceKind
  title: string
  url?: string | null
  locator?: string | null
  notes?: string
}

export type ClaimPatch = { text?: string; status?: ClaimStatus; needsQuoteCheck?: boolean }

export interface CreateProjectOptions {
  title: string
  type: ProjectType
  /** Parent directory to create `<title>.writeproject` inside. */
  location: string
  /** Apply an optional structure overlay appropriate to the project type. */
  structureOverlay?: StructureOverlay | null
}

export type StructureOverlay =
  // fiction beat sheets
  | 'three-act'
  | 'seven-point'
  | 'heros-journey'
  | 'save-the-cat'
  // nonfiction book
  | 'nf-narrative'
  | 'nf-argument'
  | 'nf-prescriptive'
  // journalism
  | 'news-inverted-pyramid'
  | 'feature-anatomy'
  // dissertation / thesis
  | 'diss-standard'
  | 'diss-imrad'

/** Display names for each overlay (shared by the launcher and the templates). */
export const OVERLAY_LABELS: Record<StructureOverlay, string> = {
  'three-act': 'Three-Act',
  'seven-point': 'Seven-Point',
  'heros-journey': "Hero's Journey",
  'save-the-cat': 'Save the Cat',
  'nf-narrative': 'Narrative Arc',
  'nf-argument': 'Argument',
  'nf-prescriptive': 'Prescriptive / How-To',
  'news-inverted-pyramid': 'Inverted Pyramid',
  'feature-anatomy': 'Feature Anatomy',
  'diss-standard': 'Standard (Abstract → Conclusion)',
  'diss-imrad': 'IMRaD'
}

/** Which overlays are offered for each project type (absent = none). */
export const OVERLAYS_BY_TYPE: Partial<Record<ProjectType, StructureOverlay[]>> = {
  novel: ['three-act', 'seven-point', 'heros-journey', 'save-the-cat'],
  novella: ['three-act', 'seven-point', 'heros-journey', 'save-the-cat'],
  'short-story': ['three-act', 'seven-point'],
  'nonfiction-book': ['nf-narrative', 'nf-argument', 'nf-prescriptive'],
  'journalism-short': ['news-inverted-pyramid', 'feature-anatomy'],
  'journalism-long': ['feature-anatomy', 'news-inverted-pyramid'],
  dissertation: ['diss-standard', 'diss-imrad']
}

/** Returned when a project opens — everything the renderer needs to render. */
export interface OpenProjectResult {
  meta: ProjectMeta
  tree: BinderItem[]
  labels: LabelDef[]
}

export interface LabelDef {
  id: string
  name: string
  color: string
  kind: 'label' | 'status'
  position: number
}

export interface BinderCreateInput {
  type: BinderItemType
  title: string
  parentId: string | null
  /** Insert at this sibling index; appended if omitted. */
  index?: number
}

export interface BinderMoveInput {
  id: string
  newParentId: string | null
  newIndex: number
}

/** The full preload bridge surface. Implemented by main IPC handlers. */
export interface WProcessorAPI {
  app: {
    health(): Promise<{ ok: true; pid: number }>
    getRecentProjects(): Promise<RecentProject[]>
    removeRecentProject(path: string): Promise<RecentProject[]>
    pickNewProjectLocation(): Promise<string | null>
    pickExistingProject(): Promise<string | null>
  }
  project: {
    create(opts: CreateProjectOptions): Promise<OpenProjectResult>
    open(path: string): Promise<OpenProjectResult>
    close(): Promise<void>
    getMeta(): Promise<ProjectMeta | null>
    updateSettings(patch: Partial<ProjectSettings>): Promise<ProjectMeta>
  }
  binder: {
    list(): Promise<BinderItem[]>
    create(input: BinderCreateInput): Promise<{ item: BinderItem; tree: BinderItem[] }>
    rename(id: string, title: string): Promise<BinderItem[]>
    updateSynopsis(id: string, synopsis: string): Promise<void>
    updateNotes(id: string, notes: string): Promise<void>
    setLabel(id: string, labelId: string | null): Promise<void>
    setStatus(id: string, statusId: string | null): Promise<void>
    setCollapsed(id: string, collapsed: boolean): Promise<void>
    remove(id: string): Promise<BinderItem[]>
    move(input: BinderMoveInput): Promise<BinderItem[]>
  }
  document: {
    read(id: string): Promise<DocumentContent | null>
    write(id: string, content: DocumentContent): Promise<{ savedAt: number; wordCount: number }>
  }
  snapshot: {
    create(itemId: string, name: string): Promise<Snapshot>
    list(itemId: string): Promise<Snapshot[]>
    read(snapshotId: string): Promise<DocumentContent | null>
    restore(snapshotId: string): Promise<DocumentContent>
    remove(snapshotId: string): Promise<Snapshot[]>
  }
  backup: {
    runNow(): Promise<BackupInfo>
    list(): Promise<BackupInfo[]>
  }
  window: {
    /** Toggle borderless full-screen (composition mode). Returns the new state. */
    setFullScreen(on: boolean): Promise<boolean>
    isFullScreen(): Promise<boolean>
  }
  search: {
    run(criteria: CollectionCriteria): Promise<SearchResult[]>
  }
  collection: {
    list(): Promise<Collection[]>
    create(name: string, criteria: CollectionCriteria): Promise<Collection>
    remove(id: string): Promise<Collection[]>
  }
  metadata: {
    listFields(): Promise<MetaField[]>
    createField(name: string, type: MetaFieldType, options?: string[]): Promise<MetaField>
    updateField(
      id: string,
      patch: Partial<Pick<MetaField, 'name' | 'type' | 'options'>>
    ): Promise<MetaField[]>
    removeField(id: string): Promise<MetaField[]>
    getValues(itemId: string): Promise<MetaValues>
    setValue(itemId: string, fieldId: string, value: string): Promise<void>
  }
  source: {
    list(): Promise<Source[]>
    capture(url: string): Promise<Source>
    createManual(input: ManualSourceInput): Promise<Source>
    /** Opens a file picker; returns the new source, or null if cancelled. */
    importFile(): Promise<Source | null>
    remove(id: string): Promise<Source[]>
  }
  factcheck: {
    listClaims(docId: string): Promise<ClaimWithSources[]>
    createClaim(docId: string, text: string): Promise<ClaimWithSources>
    updateClaim(id: string, patch: ClaimPatch): Promise<void>
    removeClaim(id: string): Promise<void>
    linkSource(claimId: string, sourceId: string): Promise<void>
    unlinkSource(claimId: string, sourceId: string): Promise<void>
    outstanding(): Promise<ClaimWithSources[]>
  }
  compile: {
    /** Build a manuscript .docx (save dialog). Returns paths, or null if cancelled. */
    docx(req: CompileRequest): Promise<{ docxPath: string; packetPath: string | null } | null>
    /** Build a manuscript .pdf (save dialog). Returns path, or null if cancelled. */
    pdf(req: CompileRequest): Promise<{ pdfPath: string } | null>
    /** Build an .epub (save dialog). Returns path, or null if cancelled. */
    epub(req: CompileRequest): Promise<{ epubPath: string } | null>
  }
  importer: {
    /** Pick a DOCX/Markdown/RTF/TXT file and import it as a new document. */
    file(parentId: string | null): Promise<{ item: BinderItem; tree: BinderItem[] } | null>
    /** Pick a Scrivener .scriv folder and import its structure (best-effort). */
    scrivener(
      parentId: string | null
    ): Promise<{ tree: BinderItem[]; imported: number; rootId: string } | null>
  }
}
