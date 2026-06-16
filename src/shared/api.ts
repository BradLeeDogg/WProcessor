import type {
  BinderItem,
  BinderItemType,
  BackupInfo,
  Collection,
  CollectionCriteria,
  DocumentContent,
  MetaField,
  MetaFieldType,
  MetaValues,
  ProjectMeta,
  ProjectSettings,
  ProjectType,
  RecentProject,
  SearchResult,
  Snapshot
} from './types'

export interface CreateProjectOptions {
  title: string
  type: ProjectType
  /** Parent directory to create `<title>.writeproject` inside. */
  location: string
  /** Apply an optional fiction structure overlay (novel/novella only). */
  structureOverlay?: StructureOverlay | null
}

export type StructureOverlay = 'three-act' | 'seven-point' | 'heros-journey' | 'save-the-cat'

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
}
