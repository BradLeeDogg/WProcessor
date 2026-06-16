import { existsSync } from 'fs'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { projectService } from './services/project'
import { createItem, listBinder, moveItem, removeItem } from './services/binder'
import { countWords, emptyDoc, readDocument, writeDocument } from './services/documents'
import { createSnapshot, listSnapshots, restoreSnapshot } from './services/snapshots'
import { createBackup } from './services/backups'
import { searchProject } from './services/search'
import { createCollection, listCollections, removeCollection } from './services/collections'
import type { DocumentContent } from '@shared/types'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

/**
 * Exercises the storage/services stack against the real native sqlite + fs in
 * the Electron main runtime. Run with WP_SELFTEST=1. Not part of the shipped app.
 */
export async function runSelfTest(): Promise<void> {
  const loc = await fs.mkdtemp(join(tmpdir(), 'wp-selftest-'))
  console.log('Self-test workspace:', loc)

  const res = await projectService.create({
    title: 'Test Novel',
    type: 'novel',
    location: loc,
    structureOverlay: 'three-act'
  })
  assert(res.tree.length > 0, 'template created binder items')
  assert(res.labels.some((l) => l.kind === 'status'), 'statuses seeded')
  assert(res.tree.some((i) => i.title === 'Manuscript' && i.isSpecial), 'special Manuscript folder')
  assert(
    res.tree.some((i) => i.title.startsWith('Outline — Three-Act') || i.title.includes('Three')),
    'structure overlay applied'
  )

  const { db, paths } = projectService.requireCurrent()
  const doc = res.tree.find((i) => i.type === 'document')!
  assert(!!doc, 'project has at least one document')
  assert(existsSync(join(paths.documents, `${doc.id}.json`)), 'document file on disk')

  const content: DocumentContent = {
    version: 1,
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world from WProcessor.' }] }]
    }
  }
  await writeDocument(paths.root, doc.id, content)
  const read = await readDocument(paths.root, doc.id)
  assert(read !== null && countWords(read) === 4, 'document round-trips (4 words)')

  const created = createItem(db, { type: 'document', title: 'New Scene', parentId: null })
  assert(
    listBinder(db).some((i) => i.id === created.id),
    'createItem persists'
  )

  const snap = await createSnapshot(db, paths.root, doc.id, 'v1')
  assert(listSnapshots(db, doc.id).length === 1, 'snapshot recorded')
  await writeDocument(paths.root, doc.id, emptyDoc())
  const restored = await restoreSnapshot(db, paths.root, snap.id)
  assert(countWords(restored) === 4, 'snapshot restore brings content back')

  const folder = listBinder(db).find((i) => i.type === 'folder')!
  moveItem(db, { id: created.id, newParentId: folder.id, newIndex: 0 })
  assert(
    listBinder(db).find((i) => i.id === created.id)!.parentId === folder.id,
    'moveItem reparents'
  )

  const info = await createBackup(paths.root, db)
  assert(existsSync(info.path) && info.sizeBytes > 0, 'backup zip written')

  const hits = await searchProject(db, paths.root, { text: 'wprocessor' })
  assert(hits.some((h) => h.itemId === doc.id && h.matches >= 1), 'full-text search finds a match')
  const miss = await searchProject(db, paths.root, { text: 'zzqqxnotpresent' })
  assert(miss.length === 0, 'search returns nothing for absent text')

  const coll = createCollection(db, 'Mentions WProcessor', { text: 'wprocessor' })
  assert(listCollections(db).length === 1, 'collection saved')
  removeCollection(db, coll.id)
  assert(listCollections(db).length === 0, 'collection removed')

  removeItem(db, created.id)
  assert(
    !listBinder(db).some((i) => i.id === created.id),
    'removeItem deletes'
  )

  const savedPath = res.meta.path
  await projectService.close()
  const reopened = await projectService.open(savedPath)
  assert(reopened.tree.length > 0, 'project reopens with its tree')
  await projectService.close()

  await fs.rm(loc, { recursive: true, force: true })
  console.log('SELFTEST_OK: storage core verified end-to-end')
}
