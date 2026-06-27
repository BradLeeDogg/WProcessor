import { app, clipboard, dialog, ipcMain, session, shell, BrowserWindow } from 'electron'
import { classifySourceFile } from '@shared/sourcefile'
import { promises as fs } from 'fs'
import { join } from 'path'
import type {
  BinderCreateInput,
  BinderMoveInput,
  CreateProjectOptions,
  StructureOverlay
} from '@shared/api'
import { OVERLAY_LABELS } from '@shared/api'
import type { DocumentContent, ProjectSettings } from '@shared/types'
import { projectService } from '../services/project'
import * as binder from '../services/binder'
import * as corkboard from '../services/corkboard'
import type { CardRect } from '../services/corkboard'
import * as thesaurus from '../services/thesaurus'
import { STRUCTURE_BEATS } from '../services/templates'
import { countWords, emptyDoc, readDocument, writeDocument } from '../services/documents'
import { documentFile, snapshotFile } from '../services/paths'
import * as snapshots from '../services/snapshots'
import { createBackup, listBackups, pruneBackups } from '../services/backups'
import { getRecents, removeRecent } from '../services/recents'
import { applyReplace, previewReplace, searchProject } from '../services/search'
import { createCollection, listCollections, removeCollection } from '../services/collections'
import * as metadata from '../services/metadata'
import * as sources from '../services/sources'
import * as pdfAnnotations from '../services/pdfannotations'
import type { PdfAnnotations } from '@shared/pdfannot'
import * as factcheck from '../services/factcheck'
import * as transcripts from '../services/transcripts'
import {
  compileToDocxFile,
  compileToEpubFile,
  compileToMarkdown,
  compileToPdfFile,
  compileToText
} from '../services/compile'
import { importFromFile, parseScrivener, type ScrivNode } from '../services/importer'
import { basename } from 'path'
import { writeFileAtomic } from '../services/atomic'
import { extname } from 'path'
import type {
  ClaimStatus,
  CollectionCriteria,
  CompileRequest,
  MetaField,
  MetaFieldType,
  SourceKind
} from '@shared/types'
import type { ManualSourceInput } from '@shared/api'

function factCheckPacketText(db: ReturnType<typeof projectService.requireCurrent>['db']): string {
  const titleOf = new Map(binder.listBinder(db).map((i) => [i.id, i.title]))
  const lines = ['FACT-CHECK PACKET', '='.repeat(40), '']
  for (const { docId, claims } of factcheck.buildPacket(db)) {
    lines.push(`## ${titleOf.get(docId) ?? docId}`)
    for (const c of claims) {
      lines.push(`  [${c.status}${c.needsQuoteCheck ? ', CHECK VS AUDIO' : ''}] ${c.text}`)
      for (const s of c.sources) {
        lines.push(`      - ${s.title}${s.url ? ` (${s.url})` : ''}${s.locator ? ` @ ${s.locator}` : ''}`)
      }
      if (c.sources.length === 0) lines.push('      - (no source linked)')
    }
    lines.push('')
  }
  return lines.join('\n')
}

function kindFromExt(file: string): SourceKind {
  const ext = extname(file).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image'
  return 'pdf'
}

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

  ipcMain.handle('corkboard:getLayout', () => {
    const { db } = projectService.requireCurrent()
    return corkboard.getCorkLayout(db)
  })
  ipcMain.handle('corkboard:setRect', (_e, id: string, rect: CardRect) => {
    const { db } = projectService.requireCurrent()
    return corkboard.setCorkRect(db, id, rect)
  })

  // Offline thesaurus — global (no open project required).
  ipcMain.handle('thesaurus:lookup', (_e, word: string) => thesaurus.lookup(word))

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

  // Delete = move to Trash (recoverable). Files stay on disk until purged.
  ipcMain.handle('binder:remove', (_e, id: string) => {
    const { db } = projectService.requireCurrent()
    binder.trashItem(db, id)
    return binder.listBinder(db)
  })
  ipcMain.handle('binder:restore', (_e, id: string) => {
    const { db } = projectService.requireCurrent()
    binder.restoreItem(db, id)
    return binder.listBinder(db)
  })
  ipcMain.handle('binder:listTrash', () => binder.listTrash(projectService.requireCurrent().db))
  const purge = async (id: string): Promise<void> => {
    const { db, paths } = projectService.requireCurrent()
    const { deletedDocumentIds, deletedSnapshotIds } = binder.removeItem(db, id)
    await Promise.all([
      ...deletedDocumentIds.map((did) => fs.rm(documentFile(paths.root, did), { force: true })),
      ...deletedSnapshotIds.map((sid) => fs.rm(snapshotFile(paths.root, sid), { force: true }))
    ])
  }
  ipcMain.handle('binder:purge', async (_e, id: string) => {
    await purge(id)
    return binder.listTrash(projectService.requireCurrent().db)
  })
  ipcMain.handle('binder:emptyTrash', async () => {
    const { db } = projectService.requireCurrent()
    for (const t of binder.listTrash(db)) await purge(t.id)
    return []
  })
  ipcMain.handle('binder:mergeWithPrevious', (_e, id: string) => {
    const { db, paths } = projectService.requireCurrent()
    return binder.mergeWithPrevious(db, paths.root, id)
  })

  ipcMain.handle('binder:move', (_e, input: BinderMoveInput) => {
    const { db } = projectService.requireCurrent()
    binder.moveItem(db, input)
    return binder.listBinder(db)
  })

  // Drop a structure outline (placeholder sections) into the existing project.
  ipcMain.handle('binder:applyOverlay', async (_e, overlay: StructureOverlay) => {
    const { db, paths } = projectService.requireCurrent()
    const beats = STRUCTURE_BEATS[overlay]
    if (!beats) throw new Error(`Unknown structure overlay: ${overlay}`)
    const folder = binder.createItemFull(db, {
      type: 'folder',
      title: `Outline — ${OVERLAY_LABELS[overlay]}`,
      parentId: null,
      synopsis: 'Structural placeholders. Keep, rearrange, or discard.'
    })
    for (const [title, synopsis] of beats) {
      const item = binder.createItemFull(db, { type: 'document', title, parentId: folder.id, synopsis })
      await writeDocument(paths.root, item.id, emptyDoc())
    }
    return { folderId: folder.id, tree: binder.listBinder(db) }
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
  ipcMain.handle('search:replacePreview', (_e, query: string, caseSensitive: boolean) => {
    const { db, paths } = projectService.requireCurrent()
    return previewReplace(db, paths.root, query, caseSensitive)
  })
  ipcMain.handle(
    'search:replaceApply',
    (_e, query: string, replacement: string, caseSensitive: boolean, itemIds: string[]) => {
      const { db, paths } = projectService.requireCurrent()
      return applyReplace(db, paths.root, query, replacement, caseSensitive, itemIds)
    }
  )
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

  // --- sources & research ---------------------------------------------------
  ipcMain.handle('source:list', () => {
    const { db } = projectService.requireCurrent()
    return sources.listSources(db)
  })
  ipcMain.handle('source:capture', (_e, url: string) => {
    const { db, paths } = projectService.requireCurrent()
    return sources.captureUrl(db, paths.root, url)
  })
  ipcMain.handle('source:createManual', (_e, input: ManualSourceInput) => {
    const { db } = projectService.requireCurrent()
    return sources.createSource(db, input)
  })
  ipcMain.handle('source:importFile', async () => {
    const { db, paths } = projectService.requireCurrent()
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: 'Import a source file',
      properties: ['openFile'],
      filters: [
        { name: 'Documents & Images', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (res.canceled || !res.filePaths[0]) return null
    const file = res.filePaths[0]
    const title = file.split(/[\\/]/).pop() ?? 'Asset'
    return sources.importFile(db, paths.root, file, kindFromExt(file), title)
  })
  ipcMain.handle('source:remove', (_e, id: string) => {
    const { db, paths } = projectService.requireCurrent()
    return sources.removeSource(db, paths.root, id)
  })
  ipcMain.handle('source:update', (_e, id: string, patch: Record<string, string>) => {
    const { db } = projectService.requireCurrent()
    return sources.updateSource(db, id, patch)
  })
  ipcMain.handle('source:open', async (_e, id: string) => {
    const { db, paths } = projectService.requireCurrent()
    const source = sources.getSource(db, id)
    if (!source) return null
    const type = classifySourceFile(source.filePath)
    if (!source.filePath || type === 'meta' || type === 'file') {
      return { type: type === 'meta' ? 'meta' : 'file', source }
    }
    const abs = join(paths.root, source.filePath)
    try {
      if (type === 'html') return { type, source, html: await fs.readFile(abs, 'utf8') }
      if (type === 'image' || type === 'pdf') {
        const ext = source.filePath.toLowerCase().split('.').pop()
        const mime =
          type === 'pdf' ? 'application/pdf'
          : ext === 'png' ? 'image/png'
          : ext === 'gif' ? 'image/gif'
          : ext === 'webp' ? 'image/webp'
          : ext === 'svg' ? 'image/svg+xml'
          : 'image/jpeg'
        const buf = await fs.readFile(abs)
        return { type, source, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
      }
      return { type, source }
    } catch {
      return { type: 'meta', source }
    }
  })
  ipcMain.handle('source:openExternal', async (_e, id: string) => {
    const { db, paths } = projectService.requireCurrent()
    const s = sources.getSource(db, id)
    if (s?.filePath) await shell.openPath(join(paths.root, s.filePath))
  })

  // --- PDF annotations (highlights + notes on a PDF source) -----------------
  ipcMain.handle('pdfAnnot:get', (_e, id: string) => {
    const { paths } = projectService.requireCurrent()
    return pdfAnnotations.getAnnotations(paths.root, id)
  })
  ipcMain.handle('pdfAnnot:save', (_e, id: string, data: PdfAnnotations) => {
    const { paths } = projectService.requireCurrent()
    return pdfAnnotations.saveAnnotations(paths.root, id, data)
  })
  ipcMain.handle('pdfAnnot:export', async (_e, id: string, data: PdfAnnotations) => {
    const { db, paths } = projectService.requireCurrent()
    const s = sources.getSource(db, id)
    if (!s?.filePath) return null
    const base = (s.title || 'annotated').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60)
    const res = await dialog.showSaveDialog(focusedWindow()!, {
      title: 'Export annotated PDF',
      defaultPath: `${base} (annotated).pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePath) return null
    await pdfAnnotations.exportAnnotatedPdf(paths.root, s.filePath, data, res.filePath)
    return res.filePath
  })

  // --- clipboard (rich copy: keeps italics when pasted into the editor/Word) --
  ipcMain.handle('clipboard:write', (_e, text: string, html: string) => {
    clipboard.write({ text, html })
  })

  // --- spell-check dialect (Chromium's en-US / en-GB dictionaries) -----------
  ipcMain.handle('spellcheck:setDialect', (_e, dialect: 'american' | 'british') => {
    session.defaultSession.setSpellCheckerLanguages([dialect === 'british' ? 'en-GB' : 'en-US'])
  })

  // --- interview transcripts ------------------------------------------------
  ipcMain.handle('transcript:list', () => transcripts.listTranscripts(projectService.requireCurrent().db))
  ipcMain.handle('transcript:get', (_e, id: string) =>
    transcripts.getTranscript(projectService.requireCurrent().db, id)
  )
  ipcMain.handle('transcript:create', (_e, title: string) =>
    transcripts.createTranscript(projectService.requireCurrent().db, title)
  )
  ipcMain.handle('transcript:rename', (_e, id: string, title: string) => {
    transcripts.renameTranscript(projectService.requireCurrent().db, id, title)
  })
  ipcMain.handle('transcript:remove', (_e, id: string) =>
    transcripts.removeTranscript(projectService.requireCurrent().db, id)
  )
  ipcMain.handle('transcript:parse', (_e, id: string, raw: string) =>
    transcripts.replaceSegments(projectService.requireCurrent().db, id, raw)
  )
  ipcMain.handle('transcript:addSegment', (_e, id: string) =>
    transcripts.addSegment(projectService.requireCurrent().db, id)
  )
  ipcMain.handle(
    'transcript:updateSegment',
    (_e, segmentId: string, patch: { speaker?: string; timestamp?: string; text?: string }) => {
      transcripts.updateSegment(projectService.requireCurrent().db, segmentId, patch)
    }
  )
  ipcMain.handle('transcript:removeSegment', (_e, segmentId: string) => {
    transcripts.removeSegment(projectService.requireCurrent().db, segmentId)
  })

  // --- fact-check packet ----------------------------------------------------
  ipcMain.handle('factcheck:listClaims', (_e, docId: string) => {
    const { db } = projectService.requireCurrent()
    return factcheck.listClaims(db, docId)
  })
  ipcMain.handle('factcheck:createClaim', (_e, docId: string, text: string) => {
    const { db } = projectService.requireCurrent()
    return factcheck.createClaim(db, docId, text)
  })
  ipcMain.handle(
    'factcheck:updateClaim',
    (_e, id: string, patch: { text?: string; status?: ClaimStatus; needsQuoteCheck?: boolean }) => {
      const { db } = projectService.requireCurrent()
      factcheck.updateClaim(db, id, patch)
    }
  )
  ipcMain.handle('factcheck:removeClaim', (_e, id: string) => {
    const { db } = projectService.requireCurrent()
    factcheck.removeClaim(db, id)
  })
  ipcMain.handle('factcheck:linkSource', (_e, claimId: string, sourceId: string) => {
    const { db } = projectService.requireCurrent()
    factcheck.linkSource(db, claimId, sourceId)
  })
  ipcMain.handle('factcheck:unlinkSource', (_e, claimId: string, sourceId: string) => {
    const { db } = projectService.requireCurrent()
    factcheck.unlinkSource(db, claimId, sourceId)
  })
  ipcMain.handle('factcheck:outstanding', () => {
    const { db } = projectService.requireCurrent()
    return factcheck.listOutstanding(db)
  })

  // --- compile / export -----------------------------------------------------
  ipcMain.handle('compile:docx', async (_e, req: CompileRequest) => {
    const { db, paths } = projectService.requireCurrent()
    const res = await dialog.showSaveDialog(focusedWindow()!, {
      title: 'Export manuscript',
      defaultPath: join(app.getPath('documents'), `${req.meta.title || 'Manuscript'}.docx`),
      filters: [{ name: 'Word Document', extensions: ['docx'] }]
    })
    if (res.canceled || !res.filePath) return null
    await compileToDocxFile(paths.root, req, res.filePath)
    let packetPath: string | null = null
    if (req.includeFactCheck) {
      packetPath = res.filePath.replace(/\.docx$/i, '') + ' — fact-check.txt'
      await writeFileAtomic(packetPath, factCheckPacketText(db))
    }
    return { docxPath: res.filePath, packetPath }
  })

  ipcMain.handle('compile:pdf', async (_e, req: CompileRequest) => {
    const { paths } = projectService.requireCurrent()
    const res = await dialog.showSaveDialog(focusedWindow()!, {
      title: 'Export manuscript as PDF',
      defaultPath: join(app.getPath('documents'), `${req.meta.title || 'Manuscript'}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePath) return null
    await compileToPdfFile(paths.root, req, res.filePath)
    return { pdfPath: res.filePath }
  })

  ipcMain.handle('compile:epub', async (_e, req: CompileRequest) => {
    const { paths } = projectService.requireCurrent()
    const res = await dialog.showSaveDialog(focusedWindow()!, {
      title: 'Export as ePub',
      defaultPath: join(app.getPath('documents'), `${req.meta.title || 'Manuscript'}.epub`),
      filters: [{ name: 'ePub', extensions: ['epub'] }]
    })
    if (res.canceled || !res.filePath) return null
    await compileToEpubFile(paths.root, req, res.filePath)
    return { epubPath: res.filePath }
  })

  ipcMain.handle('compile:markdown', async (_e, req: CompileRequest) => {
    const { paths } = projectService.requireCurrent()
    const res = await dialog.showSaveDialog(focusedWindow()!, {
      title: 'Export as Markdown',
      defaultPath: join(app.getPath('documents'), `${req.meta.title || 'Manuscript'}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (res.canceled || !res.filePath) return null
    await fs.writeFile(res.filePath, await compileToMarkdown(paths.root, req), 'utf8')
    return { path: res.filePath }
  })

  ipcMain.handle('compile:text', async (_e, req: CompileRequest) => {
    const { paths } = projectService.requireCurrent()
    const res = await dialog.showSaveDialog(focusedWindow()!, {
      title: 'Export as plain text',
      defaultPath: join(app.getPath('documents'), `${req.meta.title || 'Manuscript'}.txt`),
      filters: [{ name: 'Plain text', extensions: ['txt'] }]
    })
    if (res.canceled || !res.filePath) return null
    await fs.writeFile(res.filePath, await compileToText(paths.root, req), 'utf8')
    return { path: res.filePath }
  })

  // --- import ---------------------------------------------------------------
  ipcMain.handle('import:file', async (_e, parentId: string | null) => {
    const { db, paths } = projectService.requireCurrent()
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: 'Import a document',
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'md', 'markdown', 'rtf', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (res.canceled || !res.filePaths[0]) return null
    const { title, content } = await importFromFile(res.filePaths[0])
    const item = binder.createItem(db, { type: 'document', title, parentId })
    await writeDocument(paths.root, item.id, content)
    binder.setWordCount(db, item.id, countWords(content))
    return { item, tree: binder.listBinder(db) }
  })

  ipcMain.handle('import:scrivener', async (_e, parentId: string | null) => {
    const { db, paths } = projectService.requireCurrent()
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: 'Select a Scrivener project file (.scrivx)',
      properties: ['openFile'],
      filters: [
        { name: 'Scrivener project', extensions: ['scrivx'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (res.canceled || !res.filePaths[0]) return null
    const picked = res.filePaths[0]
    const nodes = await parseScrivener(picked)
    const container = binder.createItemFull(db, {
      type: 'folder',
      title: `Imported — ${basename(picked).replace(/\.scrivx?$/i, '')}`,
      parentId
    })
    let imported = 0
    const create = async (list: ScrivNode[], parent: string): Promise<void> => {
      for (const n of list) {
        const item = binder.createItemFull(db, {
          type: n.type,
          title: n.title,
          parentId: parent,
          synopsis: n.synopsis
        })
        if (n.type === 'document') {
          const content = n.content ?? emptyDoc()
          await writeDocument(paths.root, item.id, content)
          binder.setWordCount(db, item.id, countWords(content))
          imported++
        }
        if (n.children) await create(n.children, item.id)
      }
    }
    await create(nodes, container.id)
    return { tree: binder.listBinder(db), imported, rootId: container.id }
  })
}
