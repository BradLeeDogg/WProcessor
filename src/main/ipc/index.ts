import { dialog, ipcMain, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import type {
  BinderCreateInput,
  BinderMoveInput,
  CreateProjectOptions
} from '@shared/api'
import type { DocumentContent, ProjectSettings } from '@shared/types'
import { projectService } from '../services/project'
import * as binder from '../services/binder'
import { countWords, emptyDoc, readDocument, writeDocument } from '../services/documents'
import { documentFile, snapshotFile } from '../services/paths'
import * as snapshots from '../services/snapshots'
import { createBackup, listBackups, pruneBackups } from '../services/backups'
import { getRecents, removeRecent } from '../services/recents'
import { searchProject } from '../services/search'
import { createCollection, listCollections, removeCollection } from '../services/collections'
import * as metadata from '../services/metadata'
import type { CollectionCriteria, MetaField, MetaFieldType } from '@shared/types'

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? undefined
}

/** Register every IPC channel. Called once, after the app is ready. */
export function registerIpc(): void {
  // --- app ------------------------------------------------------------------
  ipcMain.handle('app:health', () => ({ ok: true as const, pid: process.pid }))
  ipcMain.handle('app:getRecentProjects', () => getRecents())
  ipcMain.handle('app:removeRecentProject', (_e, path: string) => removeRecent(path))

  ipcMain.handle('app:pickNewProjectLocation', async () => {
    const win = focusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Choose where to create the project',
      properties: ['openDirectory', 'createDirectory']
    })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  ipcMain.handle('app:pickExistingProject', async () => {
    const win = focusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Open a .writeproject folder',
      properties: ['openDirectory']
    })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  // --- project --------------------------------------------------------------
  ipcMain.handle('project:create', (_e, opts: CreateProjectOptions) => projectService.create(opts))
  ipcMain.handle('project:open', (_e, path: string) => projectService.open(path))
  ipcMain.handle('project:close', () => projectService.close())
  ipcMain.handle('project:getMeta', () => projectService.getMeta())
  ipcMain.handle('project:updateSettings', (_e, patch: Partial<ProjectSettings>) =>
    projectService.updateSettings(patch)
  )

  // --- binder ---------------------------------------------------------------
  ipcMain.handle('binder:list', () => {
    const { db } = projectService.requireCurrent()
    return binder.listBinder(db)
  })

  ipcMain.handle('binder:create', async (_e, input: BinderCreateInput) => {
    const { db, paths } = projectService.requireCurrent()
    const item = binder.createItem(db, input)
    if (item.type === 'document') await writeDocument(paths.root, item.id, emptyDoc())
    return { item, tree: binder.listBinder(db) }
  })

  ipcMain.handle('binder:rename', (_e, id: string, title: string) => {
    const { db } = projectService.requireCurrent()
    binder.renameItem(db, id, title)
    return binder.listBinder(db)
  })

  ipcMain.handle('binder:updateSynopsis', (_e, id: string, synopsis: string) => {
    const { db } = projectService.requireCurrent()
    binder.setSynopsis(db, id, synopsis)
  })

  ipcMain.handle('binder:updateNotes', (_e, id: string, notes: string) => {
    const { db } = projectService.requireCurrent()
    binder.setNotes(db, id, notes)
  })

  ipcMain.handle('binder:setLabel', (_e, id: string, labelId: string | null) => {
    const { db } = projectService.requireCurrent()
    binder.setLabel(db, id, labelId)
  })

  ipcMain.handle('binder:setStatus', (_e, id: string, statusId: string | null) => {
    const { db } = projectService.requireCurrent()
    binder.setStatus(db, id, statusId)
  })

  ipcMain.handle('binder:setCollapsed', (_e, id: string, collapsed: boolean) => {
    const { db } = projectService.requireCurrent()
    binder.setCollapsed(db, id, collapsed)
  })

  ipcMain.handle('binder:remove', async (_e, id: string) => {
    const { db, paths } = projectService.requireCurrent()
    const { deletedDocumentIds, deletedSnapshotIds } = binder.removeItem(db, id)
    await Promise.all([
      ...deletedDocumentIds.map((did) => fs.rm(documentFile(paths.root, did), { force: true })),
      ...deletedSnapshotIds.map((sid) => fs.rm(snapshotFile(paths.root, sid), { force: true }))
    ])
    return binder.listBinder(db)
  })

  ipcMain.handle('binder:move', (_e, input: BinderMoveInput) => {
    const { db } = projectService.requireCurrent()
    binder.moveItem(db, input)
    return binder.listBinder(db)
  })

  // --- document -------------------------------------------------------------
  ipcMain.handle('document:read', (_e, id: string) => {
    const { paths } = projectService.requireCurrent()
    return readDocument(paths.root, id)
  })

  ipcMain.handle('document:write', async (_e, id: string, content: DocumentContent) => {
    const { db, paths } = projectService.requireCurrent()
    await writeDocument(paths.root, id, content)
    const wordCount = countWords(content)
    binder.setWordCount(db, id, wordCount)
    return { savedAt: Date.now(), wordCount }
  })

  // --- snapshots ------------------------------------------------------------
  ipcMain.handle('snapshot:create', (_e, itemId: string, name: string) => {
    const { db, paths } = projectService.requireCurrent()
    return snapshots.createSnapshot(db, paths.root, itemId, name)
  })

  ipcMain.handle('snapshot:list', (_e, itemId: string) => {
    const { db } = projectService.requireCurrent()
    return snapshots.listSnapshots(db, itemId)
  })

  ipcMain.handle('snapshot:read', (_e, snapshotId: string) => {
    const { paths } = projectService.requireCurrent()
    return snapshots.readSnapshot(paths.root, snapshotId)
  })

  ipcMain.handle('snapshot:restore', (_e, snapshotId: string) => {
    const { db, paths } = projectService.requireCurrent()
    return snapshots.restoreSnapshot(db, paths.root, snapshotId)
  })

  ipcMain.handle('snapshot:remove', (_e, snapshotId: string) => {
    const { db, paths } = projectService.requireCurrent()
    return snapshots.removeSnapshot(db, paths.root, snapshotId)
  })

  // --- backups --------------------------------------------------------------
  ipcMain.handle('backup:runNow', async () => {
    const { db, paths, meta } = projectService.requireCurrent()
    const info = await createBackup(paths.root, db)
    await pruneBackups(paths.root, meta.settings.maxAutomaticBackups)
    return info
  })

  ipcMain.handle('backup:list', () => {
    const { paths } = projectService.requireCurrent()
    return listBackups(paths.root)
  })

  // --- window (composition mode) -------------------------------------------
  ipcMain.handle('window:setFullScreen', (e, on: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    win?.setFullScreen(on)
    return win?.isFullScreen() ?? false
  })
  ipcMain.handle('window:isFullScreen', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    return win?.isFullScreen() ?? false
  })

  // --- search & collections -------------------------------------------------
  ipcMain.handle('search:run', (_e, criteria: CollectionCriteria) => {
    const { db, paths } = projectService.requireCurrent()
    return searchProject(db, paths.root, criteria)
  })
  ipcMain.handle('collection:list', () => {
    const { db } = projectService.requireCurrent()
    return listCollections(db)
  })
  ipcMain.handle('collection:create', (_e, name: string, criteria: CollectionCriteria) => {
    const { db } = projectService.requireCurrent()
    return createCollection(db, name, criteria)
  })
  ipcMain.handle('collection:remove', (_e, id: string) => {
    const { db } = projectService.requireCurrent()
    return removeCollection(db, id)
  })

  // --- metadata fields & values --------------------------------------------
  ipcMain.handle('metadata:listFields', () => {
    const { db } = projectService.requireCurrent()
    return metadata.listFields(db)
  })
  ipcMain.handle(
    'metadata:createField',
    (_e, name: string, type: MetaFieldType, options?: string[]) => {
      const { db } = projectService.requireCurrent()
      return metadata.createField(db, name, type, options ?? [])
    }
  )
  ipcMain.handle(
    'metadata:updateField',
    (_e, id: string, patch: Partial<Pick<MetaField, 'name' | 'type' | 'options'>>) => {
      const { db } = projectService.requireCurrent()
      return metadata.updateField(db, id, patch)
    }
  )
  ipcMain.handle('metadata:removeField', (_e, id: string) => {
    const { db } = projectService.requireCurrent()
    return metadata.removeField(db, id)
  })
  ipcMain.handle('metadata:getValues', (_e, itemId: string) => {
    const { db } = projectService.requireCurrent()
    return metadata.getValues(db, itemId)
  })
  ipcMain.handle('metadata:setValue', (_e, itemId: string, fieldId: string, value: string) => {
    const { db } = projectService.requireCurrent()
    metadata.setValue(db, itemId, fieldId, value)
  })
}
