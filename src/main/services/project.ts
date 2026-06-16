import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'
import {
  DEFAULT_MANUSCRIPT,
  PROJECT_DIR_SUFFIX,
  type ProjectMeta,
  type ProjectSettings,
  type ProjectType
} from '@shared/types'
import type { CreateProjectOptions, OpenProjectResult } from '@shared/api'
import { type DB, getMetaValue, listBinder, listLabels, openDatabase, setMetaValue } from './db'
import { projectDirs, projectPaths, type ProjectPaths } from './paths'
import { pathExists } from './atomic'
import { createItemFull, setWordCount } from './binder'
import { countWords, docFromParagraphs, emptyDoc, writeDocument } from './documents'
import { factCheckDefault, getTemplate, type TemplateNode } from './templates'
import { addRecent } from './recents'
import { BackupScheduler } from './backups'

interface OpenProject {
  paths: ProjectPaths
  db: DB
  meta: ProjectMeta
  scheduler: BackupScheduler
}

const DEFAULT_STATUSES: Array<[string, string]> = [
  ['To Do', '#9aa0a6'],
  ['In Progress', '#d8a657'],
  ['First Draft', '#7daea3'],
  ['Revised', '#a9b665'],
  ['Final', '#89b482']
]

const DEFAULT_LABELS: Array<[string, string]> = [
  ['Concept', '#e07a5f'],
  ['Character', '#81b29a'],
  ['Setting', '#f2cc8f'],
  ['Theme', '#9d8189'],
  ['To Review', '#6d8ea0']
]

function defaultSettings(type: ProjectType): ProjectSettings {
  return {
    manuscript: { ...DEFAULT_MANUSCRIPT },
    factCheckEnabled: factCheckDefault(type),
    theme: 'paper',
    typewriterSound: false,
    autosaveDebounceMs: 800,
    backupIntervalMs: 15 * 60 * 1000,
    maxAutomaticBackups: 25
  }
}

function sanitizeFolderName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()
  return cleaned.length ? cleaned : 'Untitled'
}

/** Single open project per app instance (multi-window is a later enhancement). */
class ProjectService {
  private current: OpenProject | null = null

  requireCurrent(): OpenProject {
    if (!this.current) throw new Error('No project is open')
    return this.current
  }

  getMeta(): ProjectMeta | null {
    return this.current?.meta ?? null
  }

  private loadMeta(db: DB): ProjectMeta {
    const id = getMetaValue(db, 'project.id')
    const title = getMetaValue(db, 'project.title')
    const type = getMetaValue(db, 'project.type') as ProjectType | null
    const path = getMetaValue(db, 'project.path')
    const settingsRaw = getMetaValue(db, 'project.settings')
    const createdAt = Number(getMetaValue(db, 'project.createdAt') ?? Date.now())
    const updatedAt = Number(getMetaValue(db, 'project.updatedAt') ?? Date.now())
    if (!id || !title || !type || !path || !settingsRaw) {
      throw new Error('Project metadata is incomplete or corrupt')
    }
    return { id, title, type, path, settings: JSON.parse(settingsRaw), createdAt, updatedAt }
  }

  private persistMeta(db: DB, meta: ProjectMeta): void {
    setMetaValue(db, 'project.id', meta.id)
    setMetaValue(db, 'project.title', meta.title)
    setMetaValue(db, 'project.type', meta.type)
    setMetaValue(db, 'project.path', meta.path)
    setMetaValue(db, 'project.settings', JSON.stringify(meta.settings))
    setMetaValue(db, 'project.createdAt', String(meta.createdAt))
    setMetaValue(db, 'project.updatedAt', String(meta.updatedAt))
  }

  private seedLabels(db: DB): void {
    const insert = db.prepare(
      'INSERT INTO labels (id, name, color, kind, position) VALUES (?, ?, ?, ?, ?)'
    )
    db.transaction(() => {
      DEFAULT_STATUSES.forEach(([name, color], i) =>
        insert.run(randomUUID(), name, color, 'status', i)
      )
      DEFAULT_LABELS.forEach(([name, color], i) =>
        insert.run(randomUUID(), name, color, 'label', i)
      )
    })()
  }

  private applyTemplate(db: DB, root: string, nodes: TemplateNode[], parentId: string | null): void {
    for (const node of nodes) {
      const item = createItemFull(db, {
        type: node.type,
        title: node.title,
        parentId,
        synopsis: node.synopsis,
        isSpecial: node.isSpecial
      })
      if (node.type === 'document') {
        const content = node.body && node.body.length ? docFromParagraphs(node.body) : emptyDoc()
        // Documents are written synchronously-enough during creation; fire and
        // forget is unsafe here, so we await via a queued promise below.
        this.pendingWrites.push(
          writeDocument(root, item.id, content).then(() =>
            setWordCount(db, item.id, countWords(content))
          )
        )
      }
      if (node.children?.length) this.applyTemplate(db, root, node.children, item.id)
    }
  }

  private pendingWrites: Promise<unknown>[] = []

  private startScheduler(project: OpenProject): void {
    project.scheduler = new BackupScheduler(
      project.paths.root,
      project.db,
      project.meta.settings.backupIntervalMs,
      project.meta.settings.maxAutomaticBackups
    )
    project.scheduler.start()
  }

  async create(opts: CreateProjectOptions): Promise<OpenProjectResult> {
    await this.close()
    const folderName = `${sanitizeFolderName(opts.title)}${PROJECT_DIR_SUFFIX}`
    const root = join(opts.location, folderName)
    if (await pathExists(root)) {
      throw new Error(`A project already exists at ${root}`)
    }

    await fs.mkdir(root, { recursive: true })
    for (const dir of projectDirs(root)) await fs.mkdir(dir, { recursive: true })

    const paths = projectPaths(root)
    const db = openDatabase(paths.db)
    const ts = Date.now()
    const meta: ProjectMeta = {
      id: randomUUID(),
      title: opts.title.trim() || 'Untitled',
      type: opts.type,
      path: root,
      settings: defaultSettings(opts.type),
      createdAt: ts,
      updatedAt: ts
    }
    this.persistMeta(db, meta)
    this.seedLabels(db)

    this.pendingWrites = []
    this.applyTemplate(db, root, getTemplate(opts.type, opts.structureOverlay), null)
    await Promise.all(this.pendingWrites)
    this.pendingWrites = []

    const project = { paths, db, meta } as OpenProject
    this.startScheduler(project)
    this.current = project
    await addRecent({ path: root, title: meta.title, type: meta.type, lastOpenedAt: ts })

    return { meta, tree: listBinder(db), labels: listLabels(db) }
  }

  async open(path: string): Promise<OpenProjectResult> {
    await this.close()
    const paths = projectPaths(path)
    if (!(await pathExists(paths.db))) {
      throw new Error('Not a WProcessor project (project.db not found)')
    }
    // Ensure subdirectories exist (older/partial projects may be missing some).
    for (const dir of projectDirs(path)) await fs.mkdir(dir, { recursive: true })

    const db = openDatabase(paths.db)
    const meta = this.loadMeta(db)
    // Path may have changed if the folder was moved; keep it current.
    if (meta.path !== path) {
      meta.path = path
      meta.updatedAt = Date.now()
      this.persistMeta(db, meta)
    }

    const project = { paths, db, meta } as OpenProject
    this.startScheduler(project)
    this.current = project
    await addRecent({
      path,
      title: meta.title,
      type: meta.type,
      lastOpenedAt: Date.now()
    })

    return { meta, tree: listBinder(db), labels: listLabels(db) }
  }

  async close(): Promise<void> {
    if (!this.current) return
    this.current.scheduler?.stop()
    try {
      this.current.db.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      /* ignore */
    }
    this.current.db.close()
    this.current = null
  }

  updateSettings(patch: Partial<ProjectSettings>): ProjectMeta {
    const project = this.requireCurrent()
    const next: ProjectSettings = {
      ...project.meta.settings,
      ...patch,
      manuscript: { ...project.meta.settings.manuscript, ...(patch.manuscript ?? {}) }
    }
    project.meta.settings = next
    project.meta.updatedAt = Date.now()
    this.persistMeta(project.db, project.meta)

    // Reflect backup-cadence changes immediately.
    project.scheduler.stop()
    this.startScheduler(project)
    return project.meta
  }
}

export const projectService = new ProjectService()
