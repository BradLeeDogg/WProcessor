import { existsSync } from 'fs'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { projectService } from './services/project'
import { createItem, createItemFull, listBinder, moveItem, removeItem, setNotes } from './services/binder'
import * as meta from './services/metadata'
import { countWords, docFromParagraphs, emptyDoc, readDocument, writeDocument, type BodyLine } from './services/documents'
import { createSnapshot, listSnapshots, restoreSnapshot } from './services/snapshots'
import { createBackup } from './services/backups'
import { applyReplace, previewReplace, searchProject } from './services/search'
import { createCollection, listCollections, removeCollection } from './services/collections'
import { createSource, extractReadable, listSources, updateSource } from './services/sources'
import { buildBibliography, formatCitation, inTextCitation } from '@shared/citations'
import { createClaim, linkSource, listClaims, listOutstanding, updateClaim } from './services/factcheck'
import {
  compileToDocxBuffer,
  compileToEpubBuffer,
  compileToHtml,
  compileToMarkdown,
  compileToPdfBuffer,
  compileToText
} from './services/compile'
import { cycleElement, enterElement, SCREENPLAY_ELEMENTS } from '@shared/screenplay'
import { acceptAllChanges, hasTrackedChanges, rejectAllChanges } from '@shared/trackchanges'
import { proofread, type Issue } from '@shared/proofreader'
import { AME_TO_BRE, BRE_TO_AME } from '@shared/dialect'
import { findRanges } from '@shared/find'
import { smartQuoteFor } from '@shared/smartquotes'
import { countInDoc, replaceInDoc } from '@shared/replace'
import { analyze } from '@shared/analysis'
import { mergeDocs, docLines } from '@shared/docops'
import { diffLines } from '@shared/diff'
import { classifySourceFile } from '@shared/sourcefile'
import { imageSize, fitWidth } from '@shared/imagesize'
import { trashItem, restoreItem, listTrash, mergeWithPrevious } from './services/binder'
import { classifyPdfBlocks, htmlToProseMirror, markdownToProseMirror, parseScrivener, pdfTextToParagraphs } from './services/importer'
import { getCorkLayout, setCorkRect } from './services/corkboard'
import * as thesaurus from './services/thesaurus'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { exportAnnotatedPdf, getAnnotations, saveAnnotations } from './services/pdfannotations'
import { getTemplate, STRUCTURE_BEATS } from './services/templates'
import {
  addSegment,
  createTranscript,
  getTranscript,
  listTranscripts,
  removeSegment,
  removeTranscript,
  replaceSegments,
  updateSegment
} from './services/transcripts'
import { extractPlainText } from './services/documents'
import { COMPILE_PRESETS, defaultPresetFor } from '@shared/presets'
import type { DocumentContent, ProseMirrorNode, Source } from '@shared/types'
import { DOCUMENT_CONTENT_VERSION } from '@shared/types'

const log: string[] = []
function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  log.push(`  ✓ ${msg}`)
  console.log(`  ✓ ${msg}`)
}

/**
 * Exercises the storage/services stack against the real native sqlite + fs in
 * the Electron main runtime. Run with WP_SELFTEST=1. Not part of the shipped app.
 */
export async function runSelfTest(): Promise<void> {
  const resultFile = process.env['WP_SELFTEST_OUT'] || join(tmpdir(), 'wp-selftest.log')
  try {
    await runChecks()
    log.push(`SELFTEST_OK (${log.length} assertions)`)
  } catch (err) {
    log.push(`SELFTEST_FAILED: ${err instanceof Error ? err.message : String(err)}`)
    await fs.writeFile(resultFile, log.join('\n')).catch(() => undefined)
    throw err
  }
  await fs.writeFile(resultFile, log.join('\n')).catch(() => undefined)
}

async function runChecks(): Promise<void> {
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
  // Per-type overlays (nonfiction / journalism / dissertation) each yield a labeled outline.
  assert(
    getTemplate('nonfiction-book', 'nf-argument').some((n) => n.title === 'Outline — Argument'),
    'nonfiction overlay inserts a labeled outline'
  )
  assert(
    getTemplate('journalism-short', 'feature-anatomy').some((n) => n.title === 'Outline — Feature Anatomy'),
    'journalism overlay inserts a labeled outline'
  )
  assert(
    getTemplate('dissertation', 'diss-imrad').some((n) => n.title === 'Outline — IMRaD'),
    'dissertation overlay inserts a labeled outline'
  )
  // Technical writing + SOP project types and their overlays.
  assert(
    getTemplate('technical').some((n) => n.title === 'Documentation' && n.isSpecial),
    'technical template has a special Documentation folder'
  )
  assert(
    getTemplate('sop').some((n) => n.title === 'SOP' && n.isSpecial),
    'SOP template has a special SOP folder'
  )
  assert(
    getTemplate('technical', 'tech-api').some((n) => n.title === 'Outline — API Reference'),
    'technical overlay inserts a labeled outline'
  )
  assert(
    getTemplate('sop', 'sop-standard').some((n) => n.title === 'Outline — Standard SOP'),
    'SOP overlay inserts a labeled outline'
  )
  assert(
    defaultPresetFor('technical') === 'technical' &&
      defaultPresetFor('sop') === 'technical' &&
      !!COMPILE_PRESETS['technical'],
    'technical/SOP map to the technical compile preset'
  )
  // College essay / research paper / thesis types, citation presets, and outlines.
  assert(
    getTemplate('college-essay').some((n) => n.title === 'Essay' && n.isSpecial),
    'college-essay template has a special Essay folder'
  )
  assert(
    getTemplate('academic-paper').some((n) => n.title === 'Paper' && n.isSpecial),
    'academic-paper template has a special Paper folder'
  )
  assert(
    getTemplate('thesis').some((n) => n.title === 'Chapters' && n.isSpecial),
    'thesis template has a special Chapters folder'
  )
  assert(
    getTemplate('college-essay', 'essay-5-paragraph').some(
      (n) => n.title === 'Outline — Five-Paragraph Essay'
    ),
    'college-essay overlay inserts a labeled outline'
  )
  assert(
    getTemplate('academic-paper', 'paper-research').some(
      (n) => n.title === 'Outline — Research Paper'
    ),
    'academic-paper overlay inserts a labeled outline'
  )
  assert(
    getTemplate('thesis', 'thesis-standard').some((n) => n.title === 'Outline — Standard Thesis'),
    'thesis overlay inserts a labeled outline'
  )
  assert(
    defaultPresetFor('college-essay') === 'mla' &&
      defaultPresetFor('academic-paper') === 'apa' &&
      defaultPresetFor('thesis') === 'chicago',
    'academic types default to MLA / APA / Chicago'
  )
  // The academic types seed style-correct example content the writer types
  // over: sample headers/title pages, body prose with in-text citations, and a
  // citation-list page — with the right block formatting (centered titles,
  // flush-left header lines).
  {
    type TNode = { title: string; body?: Array<string | BodyLine>; children?: TNode[] }
    const flatten = (nodes: TNode[]): TNode[] =>
      nodes.flatMap((n) => [n, ...(n.children ? flatten(n.children) : [])])
    const text = (p: string | BodyLine): string => (typeof p === 'string' ? p : p.text)
    const docNamed = (type: Parameters<typeof getTemplate>[0], title: string): TNode | undefined =>
      flatten(getTemplate(type) as TNode[]).find((n) => n.title === title)
    const bodyHas = (type: Parameters<typeof getTemplate>[0], title: string, needle: string): boolean =>
      !!docNamed(type, title)?.body?.some((p) => text(p).includes(needle))
    const line = (
      type: Parameters<typeof getTemplate>[0],
      title: string,
      needle: string
    ): BodyLine | undefined => {
      const found = docNamed(type, title)?.body?.find((p) => text(p).includes(needle))
      return typeof found === 'string' ? { text: found } : found
    }
    assert(
      bodyHas('college-essay', 'Works Cited', 'Works Cited') &&
        bodyHas('college-essay', 'Introduction', '(Author 12)') &&
        line('college-essay', 'Introduction', 'A Concise, Descriptive Title')?.align === 'center' &&
        line('college-essay', 'Introduction', 'Professor Rivera')?.noIndent === true,
      'college-essay seeds an MLA flush-left header, a centered title, and a Works Cited page'
    )
    assert(
      bodyHas('academic-paper', 'References', 'References') &&
        line('academic-paper', 'Title Page', 'The Title of Your Paper')?.align === 'center' &&
        line('academic-paper', 'Title Page', 'The Title of Your Paper')?.bold === true,
      'academic-paper seeds a centered (bold-title) APA title page and a References page'
    )
    assert(
      bodyHas('thesis', 'Bibliography', 'Bibliography') &&
        bodyHas('thesis', 'Chapter 1 — Introduction', '¹ First Last') &&
        line('thesis', 'Title Page', 'THE TITLE OF YOUR THESIS')?.align === 'center',
      'thesis seeds a centered Chicago title page, a footnote example, and a Bibliography page'
    )
  }
  // docFromParagraphs maps rich body lines to paragraph attrs + a bold mark.
  {
    const seeded = docFromParagraphs([
      'plain body',
      { text: 'Centered Title', align: 'center', noIndent: true, bold: true },
      { text: 'Flush line', noIndent: true }
    ])
    const [p0, p1, p2] = seeded.doc.content ?? []
    assert(!p0?.attrs && p0?.content?.[0]?.text === 'plain body', 'plain string seeds a bare paragraph')
    assert(
      p1?.attrs?.align === 'center' &&
        p1?.attrs?.noIndent === true &&
        p1?.content?.[0]?.marks?.[0]?.type === 'bold',
      'BodyLine seeds align/noIndent attrs and a bold mark'
    )
    assert(p2?.attrs?.noIndent === true && !p2?.attrs?.align, 'noIndent without align sets only noIndent')
  }
  assert(
    !!COMPILE_PRESETS['mla'] &&
      !!COMPILE_PRESETS['apa'] &&
      !!COMPILE_PRESETS['chicago'] &&
      COMPILE_PRESETS.mla.titlePage === false &&
      COMPILE_PRESETS.apa.titlePage === true,
    'MLA/APA/Chicago presets exist with expected title-page rules'
  )
  // The apply-overlay-to-existing-project path (binder:applyOverlay) inserts a folder + sections.
  {
    const { db: liveDb } = projectService.requireCurrent()
    const folder = createItemFull(liveDb, {
      type: 'folder',
      title: 'Outline — Argument',
      parentId: null,
      synopsis: ''
    })
    for (const [t, syn] of STRUCTURE_BEATS['nf-argument']) {
      createItemFull(liveDb, { type: 'document', title: t, parentId: folder.id, synopsis: syn })
    }
    const kids = listBinder(liveDb).filter((i) => i.parentId === folder.id)
    assert(kids.length === STRUCTURE_BEATS['nf-argument'].length, 'apply-overlay inserts all sections')
  }

  // Transcript workspace: parse raw text, edit segments, and integrate with sources.
  {
    const { db: tdb } = projectService.requireCurrent()
    const tr = createTranscript(tdb, 'Interview A')
    // Header format (Name then a trailing timestamp, then text on following lines).
    const parsed = replaceSegments(
      tdb,
      tr.id,
      'William B. Nichols  00:00\nCNS, all right, so first.\nWrapped continuation line.\nSpeaker 1  00:03\nThanks for having me.'
    )
    assert(parsed.segments.length === 2, 'turn-based parse groups two speaker turns')
    assert(
      parsed.segments[0]!.speaker === 'William B. Nichols' &&
        parsed.segments[0]!.timestamp === '00:00',
      'header speaker + trailing timestamp parsed'
    )
    assert(
      parsed.segments[0]!.text === 'CNS, all right, so first.\nWrapped continuation line.',
      'continuation lines grouped under their speaker'
    )
    assert(parsed.segments[1]!.speaker === 'Speaker 1', 'second speaker turn parsed')

    // Inline format ("[ts] Speaker: text" / "Speaker: text").
    const inline = replaceSegments(
      tdb,
      tr.id,
      '[00:12] Reporter: How did it start?\nSubject: In March.'
    )
    assert(
      inline.segments.length === 2 &&
        inline.segments[0]!.speaker === 'Reporter' &&
        inline.segments[0]!.timestamp === '00:12',
      'inline "[ts] Speaker: text" parsed'
    )

    const seg0 = inline.segments[0]!
    assert(addSegment(tdb, tr.id).segments.length === 3, 'addSegment appends a segment')
    updateSegment(tdb, seg0.id, { text: 'It began in March.' })
    assert(
      getTranscript(tdb, tr.id)!.segments.find((s) => s.id === seg0.id)!.text === 'It began in March.',
      'updateSegment persists'
    )
    removeSegment(tdb, seg0.id)
    assert(
      !getTranscript(tdb, tr.id)!.segments.some((s) => s.id === seg0.id),
      'removeSegment drops it'
    )
    assert(listTranscripts(tdb).some((t) => t.id === tr.id), 'transcript is listed')
    removeTranscript(tdb, tr.id)
    assert(!listTranscripts(tdb).some((t) => t.id === tr.id), 'removeTranscript deletes it')
  }

  const { db, paths } = projectService.requireCurrent()
  const doc = res.tree.find((i) => i.type === 'document')!
  assert(!!doc, 'project has at least one document')
  assert(existsSync(join(paths.documents, `${doc.id}.json`)), 'document file on disk')

  const content: DocumentContent = {
    version: 1,
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world from Foolscap.' }] }]
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

  const hits = await searchProject(db, paths.root, { text: 'foolscap' })
  assert(hits.some((h) => h.itemId === doc.id && h.matches >= 1), 'full-text search finds a match')
  const miss = await searchProject(db, paths.root, { text: 'zzqqxnotpresent' })
  assert(miss.length === 0, 'search returns nothing for absent text')

  const coll = createCollection(db, 'Mentions Foolscap', { text: 'foolscap' })
  assert(listCollections(db).length === 1, 'collection saved')
  removeCollection(db, coll.id)
  assert(listCollections(db).length === 0, 'collection removed')

  assert(meta.listFields(db).length >= 3, 'default metadata fields seeded (POV/Setting/Characters)')
  const field = meta.createField(db, 'Mood', 'text')
  meta.setValue(db, doc.id, field.id, 'tense')
  assert(meta.getValues(db, doc.id)[field.id] === 'tense', 'metadata value round-trips')
  setNotes(db, doc.id, 'check quote against tape')
  assert(
    listBinder(db).find((i) => i.id === doc.id)!.notes === 'check quote against tape',
    'item notes persist'
  )

  const sample =
    '<!doctype html><html><head><title>Test Article</title></head><body><article>' +
    '<h1>Test Article</h1>' +
    '<p>The mayor said the budget would grow by ten percent next year, according to public records.</p>' +
    '<p>Officials confirmed the figure during a meeting on Tuesday evening at city hall downtown.</p>' +
    '</article><script>alert("xss")</script></body></html>'
  const readable = extractReadable(sample, 'https://example.com/a')
  assert(
    readable.contentHtml.includes('mayor') && !readable.contentHtml.includes('<script'),
    'readability extracts prose and strips scripts'
  )

  const src = createSource(db, { kind: 'note', title: 'Mayor budget note' })
  assert(listSources(db).some((s) => s.id === src.id), 'source created')
  const claim = createClaim(db, doc.id, 'Budget grows 10% next year')
  assert(listClaims(db, doc.id).length === 1, 'claim logged')
  linkSource(db, claim.id, src.id)
  assert(listClaims(db, doc.id)[0]!.sources.length === 1, 'source linked to claim')
  updateClaim(db, claim.id, { status: 'verified' })
  assert(
    listOutstanding(db).every((c) => c.id !== claim.id),
    'verified + sourced claim leaves the outstanding list'
  )

  removeItem(db, created.id)
  assert(
    !listBinder(db).some((i) => i.id === created.id),
    'removeItem deletes'
  )

  const docx = await compileToDocxBuffer(paths.root, {
    entries: [{ heading: 'Chapter One' }, { docId: doc.id }],
    preset: COMPILE_PRESETS.shunn,
    meta: { title: 'Test Novel', author: 'A. Writer', contact: 'a@example.com', keyword: 'TEST', byline: '', dateline: '' },
    includeFactCheck: false
  })
  assert(docx.length > 1000 && docx[0] === 0x50 && docx[1] === 0x4b, 'compiled DOCX is a valid zip (PK)')

  const pdf = await compileToPdfBuffer(paths.root, {
    entries: [{ docId: doc.id }],
    preset: COMPILE_PRESETS.shunn,
    meta: { title: 'Test Novel', author: 'A. Writer', contact: 'a@example.com', keyword: 'TEST', byline: '', dateline: '' },
    includeFactCheck: false
  })
  assert(pdf.length > 500 && pdf.subarray(0, 5).toString() === '%PDF-', 'compiled PDF has a %PDF header')

  const epub = await compileToEpubBuffer(paths.root, {
    entries: [{ heading: 'Chapter One' }, { docId: doc.id }],
    preset: COMPILE_PRESETS.shunn,
    meta: { title: 'Test Novel', author: 'A. Writer', contact: '', keyword: '', byline: '', dateline: '' },
    includeFactCheck: false
  })
  assert(
    epub.length > 500 && epub[0] === 0x50 && epub[1] === 0x4b && epub.includes('application/epub+zip'),
    'compiled ePub is a zip declaring the epub mimetype'
  )

  // Screenplay: element model + export carry their classes/format.
  assert(cycleElement(null, 1) === 'scene', 'cycle from none → first element')
  assert(cycleElement('transition', 1) === 'scene', 'Tab cycle wraps around')
  assert(cycleElement('scene', -1) === 'transition', 'Shift-Tab cycles backward and wraps')
  assert(enterElement('character') === 'dialogue', 'Enter after a character line → dialogue')
  assert(enterElement('scene') === 'action', 'Enter after a scene heading → action')
  assert(SCREENPLAY_ELEMENTS.length === 6, 'six screenplay elements')
  await writeDocument(paths.root, 'sp-export-test', {
    version: DOCUMENT_CONTENT_VERSION,
    doc: {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { sp: 'scene' }, content: [{ type: 'text', text: 'INT. OFFICE - DAY' }] },
        { type: 'paragraph', attrs: { sp: 'character' }, content: [{ type: 'text', text: 'Alex' }] }
      ]
    }
  })
  const spHtml = await compileToHtml(paths.root, {
    entries: [{ docId: 'sp-export-test' }],
    preset: COMPILE_PRESETS.technical,
    meta: { title: 'Script', author: '', contact: '', keyword: '', byline: '', dateline: '' },
    includeFactCheck: false
  })
  assert(
    spHtml.includes('class="sp sp-scene"') && spHtml.includes('sp-character'),
    'screenplay elements export with their element classes'
  )

  // Track changes: resolution transforms + export drops deletions.
  const tcDoc: ProseMirrorNode = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Keep ' },
          { type: 'text', text: 'added ', marks: [{ type: 'insertion' }] },
          { type: 'text', text: 'removed ', marks: [{ type: 'deletion' }] },
          { type: 'text', text: 'tail' }
        ]
      }
    ]
  }
  assert(hasTrackedChanges(tcDoc), 'detects tracked changes')
  const acc = JSON.stringify(acceptAllChanges(tcDoc))
  assert(
    acc.includes('added') && !acc.includes('removed') && !acc.includes('insertion'),
    'accept keeps insertions (unmarked) and drops deletions'
  )
  assert(!hasTrackedChanges(acceptAllChanges(tcDoc)), 'no changes remain after accept')
  const rej = JSON.stringify(rejectAllChanges(tcDoc))
  assert(
    rej.includes('removed') && !rej.includes('added') && !rej.includes('deletion'),
    'reject drops insertions and keeps originals (unmarked)'
  )
  await writeDocument(paths.root, 'tc-export-test', { version: DOCUMENT_CONTENT_VERSION, doc: tcDoc })
  const tcHtml = await compileToHtml(paths.root, {
    entries: [{ docId: 'tc-export-test' }],
    preset: COMPILE_PRESETS.shunn,
    meta: { title: 'X', author: '', contact: '', keyword: '', byline: '', dateline: '' },
    includeFactCheck: false
  })
  assert(
    tcHtml.includes('added') && tcHtml.includes('tail') && !tcHtml.includes('removed'),
    'compiled export excludes deletion-marked text'
  )

  // Block formatting (alignment + no-indent) carries through compile.
  await writeDocument(paths.root, 'align-export-test', {
    version: DOCUMENT_CONTENT_VERSION,
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { align: 'center', noIndent: true },
          content: [{ type: 'text', text: 'Centered Title' }]
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Ordinary body paragraph.' }] }
      ]
    }
  })
  const alignReq = {
    entries: [{ docId: 'align-export-test' }],
    preset: COMPILE_PRESETS.mla,
    meta: { title: 'A', author: '', contact: '', keyword: '', byline: '', dateline: '' },
    includeFactCheck: false
  }
  const alignHtml = await compileToHtml(paths.root, alignReq)
  assert(
    alignHtml.includes('text-align:center') && alignHtml.includes('text-indent:0'),
    'centered/no-indent paragraph compiles with alignment styles'
  )
  const alignDocx = await compileToDocxBuffer(paths.root, alignReq)
  assert(
    alignDocx.length > 0 && alignDocx[0] === 0x50 && alignDocx[1] === 0x4b,
    'aligned document compiles to a valid .docx'
  )

  // A page-break entry (Works Cited / References) lands on its own final page.
  await writeDocument(paths.root, 'wc-export-test', {
    version: DOCUMENT_CONTENT_VERSION,
    doc: {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { align: 'center' }, content: [{ type: 'text', text: 'Works Cited' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Last, First. Title. Publisher, 2020.' }] }
      ]
    }
  })
  const wcReq = {
    entries: [{ docId: 'align-export-test' }, { docId: 'wc-export-test', pageBreak: true }],
    preset: COMPILE_PRESETS.mla,
    meta: { title: 'A', author: '', contact: '', keyword: '', byline: '', dateline: '' },
    includeFactCheck: false
  }
  const wcHtml = await compileToHtml(paths.root, wcReq)
  assert(
    wcHtml.includes('class="page-break"') && wcHtml.includes('Works Cited'),
    'a page-break entry compiles a Works Cited page with a page break'
  )
  const wcDocx = await compileToDocxBuffer(paths.root, wcReq)
  assert(
    wcDocx[0] === 0x50 && wcDocx[1] === 0x4b,
    'a compile stream with a page-break entry yields a valid .docx'
  )

  // Markdown / plain-text export.
  await writeDocument(paths.root, 'md-export-test', {
    version: DOCUMENT_CONTENT_VERSION,
    doc: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world', marks: [{ type: 'bold' }] }
          ]
        }
      ]
    }
  })
  const plainReq = {
    entries: [{ docId: 'md-export-test' }],
    preset: COMPILE_PRESETS.shunn,
    meta: { title: 'T', author: '', contact: '', keyword: '', byline: '', dateline: '' },
    includeFactCheck: false
  }
  const md = await compileToMarkdown(paths.root, plainReq)
  assert(md.includes('## Section') && md.includes('**world**'), 'Markdown export renders headings + bold')
  const txt = await compileToText(paths.root, plainReq)
  assert(
    txt.includes('Section') && txt.includes('Hello world') && !txt.includes('**'),
    'plain-text export strips markup'
  )

  // Citation generator: MLA / APA / Chicago formatting + sorting + service round-trip.
  const webSrc: Source = {
    id: 'c1', kind: 'web', title: 'The Great Article', url: 'https://example.com/a',
    locator: '12-14', filePath: null, notes: '', author: 'Jane Smith',
    container: 'Example News', publisher: '', year: '2023', createdAt: Date.UTC(2024, 2, 5, 12)
  }
  const bookSrc: Source = {
    ...webSrc, id: 'c2', title: 'A Whole Book', url: null, locator: null, container: '',
    publisher: 'Penguin', year: '2020', author: 'Adams, Amy'
  }
  const mlaWeb = formatCitation(webSrc, 'mla')
  assert(
    mlaWeb.text.startsWith('Smith, Jane.') &&
      mlaWeb.text.includes('“The Great Article.”') &&
      mlaWeb.text.includes('Example News') &&
      mlaWeb.text.includes('Accessed'),
    'MLA web entry: inverted author, quoted title, container, accessed date'
  )
  assert(mlaWeb.html.includes('<em>Example News</em>'), 'MLA italicizes the container, not the article title')
  const apaWeb = formatCitation(webSrc, 'apa')
  assert(
    apaWeb.text.startsWith('Smith, J.') && apaWeb.text.includes('(2023).'),
    'APA web entry: initials + (year)'
  )
  const mlaBook = formatCitation(bookSrc, 'mla')
  assert(
    mlaBook.html.includes('<em>A Whole Book</em>') && mlaBook.text.includes('Penguin, 2020.'),
    'MLA book entry italicizes the title'
  )
  assert(
    formatCitation(webSrc, 'chicago').text.includes('Accessed March 5, 2024'),
    'Chicago web entry includes a spelled-out accessed date'
  )
  // Smart quotes: open vs. close chosen from the preceding character.
  assert(
    smartQuoteFor('', '"') === '“' && smartQuoteFor(' ', '"') === '“' && smartQuoteFor('(', '"') === '“',
    'a double quote opens at the start / after space or bracket'
  )
  assert(
    smartQuoteFor('word', '"') === '”' && smartQuoteFor('.', '"') === '”',
    'a double quote closes after a letter or punctuation'
  )
  assert(
    smartQuoteFor('n', "'") === '’' && smartQuoteFor('', "'") === '‘',
    'apostrophe/single quote curls correctly (it’s vs ‘quote’)'
  )

  assert(inTextCitation(webSrc, 'mla') === '(Smith 12-14)', 'MLA in-text citation uses page')
  assert(inTextCitation(webSrc, 'apa') === '(Smith, 2023)', 'APA in-text citation uses year')
  const bib = buildBibliography([webSrc, bookSrc], 'mla')
  assert(bib.heading === 'Works Cited', 'MLA bibliography heading is "Works Cited"')
  assert(
    bib.html.includes('<p style="text-align:center">Works Cited</p>'),
    'bibliography centers its heading (so an inserted Works Cited is centered)'
  )
  assert(
    buildBibliography([webSrc], 'apa').html.includes('text-align:center"><strong>References</strong>'),
    'APA bibliography heading is centered and bold'
  )
  assert(
    bib.text.indexOf('Whole Book') < bib.text.indexOf('Great Article'),
    'bibliography is sorted by author surname (Adams before Smith)'
  )
  assert(
    bib.html.includes('<p data-hanging="true">') && !bib.html.includes('data-no-indent'),
    'bibliography entries carry a hanging indent'
  )

  // Compile builds the Works Cited from the actual Sources (not a stored page),
  // page-broken, with a hanging indent — across DOCX / HTML / plain text.
  {
    const bibReq = {
      entries: [{ docId: 'align-export-test' }],
      preset: COMPILE_PRESETS.mla,
      meta: { title: 'A', author: '', contact: '', keyword: '', byline: '', dateline: '' },
      includeFactCheck: false,
      bibliography: { style: 'mla' as const, sources: [webSrc, bookSrc] }
    }
    const txt = await compileToText(paths.root, bibReq)
    assert(
      txt.includes('Works Cited') && txt.includes('Whole Book') && txt.includes('Great Article'),
      'compile generates a Works Cited from the project sources'
    )
    const html = await compileToHtml(paths.root, bibReq)
    const htmlNoSpace = html.replace(/\s+/g, '')
    assert(
      html.includes('class="works-cited"') &&
        html.includes('class="wc-entry"') &&
        htmlNoSpace.includes('text-indent:-0.5in') &&
        htmlNoSpace.includes('page-break-before:always'),
      'generated Works Cited compiles page-broken with a hanging indent'
    )
    const docx = await compileToDocxBuffer(paths.root, bibReq)
    assert(docx.length > 0 && docx[0] === 0x50 && docx[1] === 0x4b, 'compile with a generated bibliography yields a valid .docx')
  }
  {
    const { db: cdb } = projectService.requireCurrent()
    const made = createSource(cdb, { kind: 'note', title: 'Note A' })
    assert(made.author === '' && made.container === '', 'createSource defaults citation fields to empty')
    const upd = updateSource(cdb, made.id, { author: 'Doe, John', year: '1999' })
    assert(upd?.author === 'Doe, John' && upd?.year === '1999', 'updateSource persists citation metadata')
    // Manual book entry: full bibliographic fields persist and format correctly.
    const book = createSource(cdb, {
      kind: 'book',
      title: 'On Writing Well',
      author: 'Zinsser, William',
      publisher: 'Harper',
      year: '2006'
    })
    assert(
      book.kind === 'book' && book.publisher === 'Harper' && book.year === '2006',
      'createSource stores a book with author/publisher/year'
    )
    assert(
      listSources(cdb).some((s) => s.id === book.id && s.kind === 'book'),
      'a manually-added book appears in the source list'
    )
    const bookCite = formatCitation(book, 'mla')
    assert(
      bookCite.html.includes('<em>On Writing Well</em>') && bookCite.text.includes('Harper, 2006.'),
      'a manual book formats as an MLA book entry (italic title, publisher, year)'
    )
  }

  // PDF annotations: persistence round-trip + annotated-PDF export (pdf-lib).
  {
    const { paths } = projectService.requireCurrent()
    const { PDFDocument } = await import('pdf-lib')
    const srcDoc = await PDFDocument.create()
    srcDoc.addPage([320, 420])
    const rel = join('assets', 'annot-src.pdf')
    await fs.mkdir(join(paths.root, 'assets'), { recursive: true })
    await fs.writeFile(join(paths.root, rel), await srcDoc.save())

    const ann = {
      highlights: [{ id: 'h1', page: 1, rect: { x: 0.1, y: 0.1, w: 0.3, h: 0.05 }, color: '#ffe066' }],
      notes: [{ id: 'n1', page: 1, x: 0.5, y: 0.5, text: 'A margin note' }]
    }
    await saveAnnotations(paths.root, 'annot-src', ann)
    const back = await getAnnotations(paths.root, 'annot-src')
    assert(
      back.highlights.length === 1 && back.notes[0]?.text === 'A margin note',
      'PDF annotations persist and reload'
    )

    const outPath = join(paths.root, 'annot-out.pdf')
    await exportAnnotatedPdf(paths.root, rel, ann, outPath)
    const out = await fs.readFile(outPath)
    assert(
      out.length > 0 && out.slice(0, 5).toString() === '%PDF-',
      'annotated PDF exports as a valid PDF'
    )
  }

  // Proofreader: dialect, Oxford comma, repeats, spacing.
  const applyIssue = (t: string, is: Issue): string => t.slice(0, is.start) + is.replacement + t.slice(is.end)
  assert(
    AME_TO_BRE['color'] === 'colour' && BRE_TO_AME['colour'] === 'color',
    'dialect map inverts (color↔colour)'
  )
  const br = proofread('The color of honor.', { dialect: 'british', oxfordComma: true })
  assert(
    br.some((i) => i.rule === 'dialect' && i.replacement === 'colour') &&
      br.some((i) => i.replacement === 'honour'),
    'British mode flags American spellings'
  )
  assert(
    proofread('The colour of honour.', { dialect: 'american', oxfordComma: true }).some(
      (i) => i.replacement === 'color'
    ),
    'American mode flags British spellings'
  )
  assert(
    proofread('color', { dialect: 'american', oxfordComma: true }).length === 0,
    'American mode does not flag American spelling'
  )
  assert(
    proofread('Color', { dialect: 'british', oxfordComma: true })[0]?.replacement === 'Colour',
    'capitalization is preserved in the suggestion'
  )
  const ox = proofread('I bought apples, oranges and pears.', { dialect: 'american', oxfordComma: true })
  const oxi = ox.find((i) => i.rule === 'oxford')
  assert(!!oxi, 'flags a missing Oxford comma in a list')
  assert(
    applyIssue('I bought apples, oranges and pears.', oxi!) === 'I bought apples, oranges, and pears.',
    'Oxford fix inserts the comma in the right place'
  )
  assert(
    proofread('We ate, talked, and left.', { dialect: 'american', oxfordComma: true }).every(
      (i) => i.rule !== 'oxford'
    ),
    'no Oxford flag when the serial comma is already present'
  )
  assert(
    proofread('After lunch, we walked and talked.', { dialect: 'american', oxfordComma: true }).every(
      (i) => i.rule !== 'oxford'
    ),
    'no false Oxford flag on an intro clause + compound predicate'
  )
  assert(
    proofread('Buy milk, eggs and bread.', { dialect: 'american', oxfordComma: false }).every(
      (i) => i.rule !== 'oxford'
    ),
    'Oxford check respects the toggle'
  )
  assert(
    proofread('the the end', { dialect: 'american', oxfordComma: false }).some((i) => i.rule === 'repeat'),
    'flags a doubled word'
  )
  assert(
    proofread('I think that that idea', { dialect: 'american', oxfordComma: false }).every(
      (i) => i.rule !== 'repeat'
    ),
    'allows legitimately doubled "that that"'
  )
  assert(
    proofread('Hello ,world', { dialect: 'american', oxfordComma: false }).some((i) => i.rule === 'spacing'),
    'flags a space before punctuation'
  )

  // Find & replace (pure matcher).
  assert(findRanges('the cat sat on the mat', 'the', false).length === 2, 'findRanges finds all matches')
  assert(
    findRanges('The THE the', 'the', true).length === 1 &&
      findRanges('The THE the', 'the', false).length === 3,
    'findRanges honors case sensitivity'
  )
  assert(findRanges('aaaa', 'aa', false).length === 2, 'findRanges is non-overlapping')
  assert(findRanges('abc', '', false).length === 0, 'findRanges ignores empty query')

  // Writing analysis (local, deterministic).
  {
    const a = analyze('The cat sat. The cat ran very quickly. It was eaten by the dog.')
    assert(a.words === 14 && a.sentences === 3, 'analyze counts words and sentences')
    assert(a.fillers >= 1, 'analyze flags filler words (very)')
    assert(a.adverbs >= 1, 'analyze flags -ly adverbs (quickly)')
    assert(a.passive >= 1, 'analyze flags passive voice (was eaten)')
    assert(a.gradeLevel >= 0, 'analyze produces a grade level')
    const crutch = analyze('apple apple apple apple orange').crutch
    assert(crutch.some((c) => c.word === 'apple' && c.count === 4), 'analyze surfaces crutch words')
  }

  // Project-wide replace: pure transform + service (snapshots first).
  {
    const d: ProseMirrorNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cat and cat and dog' }] }]
    }
    assert(countInDoc(d, 'cat', false) === 2, 'countInDoc counts matches')
    const r = replaceInDoc(d, 'cat', 'fox', false)
    assert(
      r.count === 2 && JSON.stringify(r.node).includes('fox and fox and dog'),
      'replaceInDoc replaces every match, preserving structure'
    )
  }
  {
    const { db: rdb, paths: rp } = projectService.requireCurrent()
    const rep = createItem(rdb, { type: 'document', title: 'RepDoc', parentId: null })
    await writeDocument(rp.root, rep.id, docFromParagraphs(['banana banana split']))
    const pv = await previewReplace(rdb, rp.root, 'banana', false)
    assert(pv.some((x) => x.itemId === rep.id && x.count === 2), 'previewReplace reports per-doc counts')
    const res = await applyReplace(rdb, rp.root, 'banana', 'apple', false, [rep.id])
    assert(res.docs === 1 && res.replacements === 2, 'applyReplace reports docs + replacements')
    const after = await readDocument(rp.root, rep.id)
    assert(
      !!after && extractPlainText(after).includes('apple apple') && !extractPlainText(after).includes('banana'),
      'applyReplace rewrote the document on disk'
    )
    assert(
      listSnapshots(rdb, rep.id).some((s) => s.name === 'Before replace'),
      'applyReplace snapshots each document before changing it'
    )
  }

  // Research viewer: source file classification.
  assert(classifySourceFile('research/x.html') === 'html', 'classify html')
  assert(classifySourceFile('assets/x.PNG') === 'image', 'classify image (case-insensitive)')
  assert(classifySourceFile('assets/x.pdf') === 'pdf', 'classify pdf')
  assert(classifySourceFile(null) === 'meta', 'classify metadata-only source')

  // Inline images: dimension reading (for DOCX sizing).
  {
    const png = Buffer.alloc(24)
    png[0] = 0x89
    png[1] = 0x50
    png.writeUInt32BE(120, 16)
    png.writeUInt32BE(80, 20)
    const d = imageSize(png)
    assert(d.width === 120 && d.height === 80, 'imageSize reads PNG dimensions')
    const f = fitWidth({ width: 1000, height: 500 }, 450)
    assert(f.width === 450 && f.height === 225, 'fitWidth scales preserving aspect ratio')
  }
  // Inline image exports to HTML (with caption) and embeds into DOCX.
  {
    const png1x1 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
    await writeDocument(paths.root, 'img-export-test', {
      version: DOCUMENT_CONTENT_VERSION,
      doc: {
        type: 'doc',
        content: [
          { type: 'image', attrs: { src: png1x1, alt: 'Figure 1' } },
          { type: 'paragraph', content: [{ type: 'text', text: 'After image.' }] }
        ]
      }
    })
    const imgReq = {
      entries: [{ docId: 'img-export-test' }],
      preset: COMPILE_PRESETS.shunn,
      meta: { title: 'I', author: '', contact: '', keyword: '', byline: '', dateline: '' },
      includeFactCheck: false
    }
    const imgHtml = await compileToHtml(paths.root, imgReq)
    assert(
      imgHtml.includes('<img src="data:image/png') && imgHtml.includes('Figure 1'),
      'image exports to HTML with a caption'
    )
    const imgDocx = await compileToDocxBuffer(paths.root, imgReq)
    assert(
      imgDocx.length > 1000 && imgDocx[0] === 0x50 && imgDocx[1] === 0x4b,
      'DOCX with an embedded image is a valid zip'
    )
  }

  // Merge documents (pure concat used by "merge with previous").
  {
    const a = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }
    const b = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] }
    const merged = mergeDocs(a, b)
    assert(merged.content!.length === 2, 'mergeDocs concatenates block content')
    assert(extractPlainText({ version: 1, doc: merged }).includes('one'), 'merged doc keeps first content')
    assert(docLines(merged).length === 2 && docLines(merged)[0] === 'one', 'docLines yields one line per block')
  }

  // Line diff (Snapshots compare).
  {
    const ops = diffLines(['a', 'b', 'c'], ['a', 'x', 'c'])
    assert(ops.some((o) => o.type === 'del' && o.text === 'b'), 'diffLines marks removed line')
    assert(ops.some((o) => o.type === 'add' && o.text === 'x'), 'diffLines marks added line')
    assert(ops.filter((o) => o.type === 'same').length === 2, 'diffLines keeps unchanged lines')
  }

  // Trash: soft-delete hides from the tree, restore brings it back, listTrash tracks it.
  {
    const { db: bdb } = projectService.requireCurrent()
    const trashy = createItem(bdb, { type: 'document', title: 'Trash Me', parentId: null })
    trashItem(bdb, trashy.id)
    assert(!listBinder(bdb).some((i) => i.id === trashy.id), 'trashed item is hidden from the tree')
    assert(listTrash(bdb).some((i) => i.id === trashy.id), 'trashed item appears in the Trash')
    restoreItem(bdb, trashy.id)
    assert(listBinder(bdb).some((i) => i.id === trashy.id), 'restore brings the item back')
    assert(!listTrash(bdb).some((i) => i.id === trashy.id), 'restored item leaves the Trash')
  }

  // Binder-level "merge with previous" (the right-click menu action).
  {
    const { db: mdb, paths: mp } = projectService.requireCurrent()
    const first = createItem(mdb, { type: 'document', title: 'First', parentId: null })
    const second = createItem(mdb, { type: 'document', title: 'Second', parentId: null })
    await writeDocument(mp.root, first.id, docFromParagraphs(['Alpha']))
    await writeDocument(mp.root, second.id, docFromParagraphs(['Beta']))
    const res = await mergeWithPrevious(mdb, mp.root, second.id)
    assert(res?.survivingId === first.id, 'merge folds into the previous document')
    assert(!listBinder(mdb).some((i) => i.id === second.id), 'merged-away document leaves the tree')
    const combined = await readDocument(mp.root, first.id)
    const txt = combined ? extractPlainText(combined) : ''
    assert(txt.includes('Alpha') && txt.includes('Beta'), 'previous document gains the merged content')
  }

  const fromHtml = htmlToProseMirror('<h1>Heading</h1><p>Hello <strong>world</strong></p>')
  assert(
    fromHtml.doc.content?.[0]?.type === 'heading' && fromHtml.doc.content?.[1]?.type === 'paragraph',
    'HTML/DOCX import yields heading + paragraph'
  )
  const fromMd = markdownToProseMirror('# Title\n\nHello **world**')
  const mdPara = fromMd.doc.content?.[1]
  assert(
    !!mdPara?.content?.some((r) => r.marks?.some((m) => m.type === 'bold')),
    'Markdown import parses bold'
  )

  // PDF import: text-extraction library loads, and wrapped lines join into
  // paragraphs (page breaks / blank lines split them).
  assert(typeof pdfParse === 'function', 'pdf-parse text extractor loads in the built main')
  const pdfParas = pdfTextToParagraphs('First line\nstill first paragraph\n\nSecond paragraph\fThird page')
  assert(
    pdfParas.length === 3 &&
      pdfParas[0] === 'First line still first paragraph' &&
      pdfParas[2] === 'Third page',
    'PDF text joins soft-wrapped lines and splits on blank lines / page breaks'
  )
  // Structure-aware PDF import: big lines become headings; gaps split paragraphs.
  const pdfBlocks = classifyPdfBlocks([
    { page: 1, y: 500, size: 28, text: 'Document Title' },
    { page: 1, y: 460, size: 12, text: 'First paragraph line one' },
    { page: 1, y: 445, size: 12, text: 'continues on line two' },
    { page: 1, y: 400, size: 12, text: 'Second paragraph here' },
    { page: 1, y: 360, size: 18, text: 'A Subheading' },
    { page: 1, y: 340, size: 12, text: 'Body under subheading' }
  ])
  assert(
    pdfBlocks.length === 5 &&
      pdfBlocks[0]?.type === 'heading' &&
      pdfBlocks[0].level === 1 &&
      pdfBlocks[1]?.type === 'para' &&
      pdfBlocks[1].text === 'First paragraph line one continues on line two' &&
      pdfBlocks[2]?.type === 'para' &&
      pdfBlocks[3]?.type === 'heading' &&
      pdfBlocks[3].level === 2,
    'PDF import detects headings by font size and splits paragraphs on gaps'
  )

  // Minimal Scrivener project fixture (best-effort import).
  const scrivDir = join(loc, 'Demo.scriv')
  await fs.mkdir(join(scrivDir, 'Files', 'Data', 'BBB'), { recursive: true })
  await fs.writeFile(
    join(scrivDir, 'Demo.scrivx'),
    '<?xml version="1.0"?><ScrivenerProject><Binder>' +
      '<BinderItem UUID="AAA" Type="DraftFolder"><Title>Manuscript</Title><Children>' +
      '<BinderItem UUID="BBB" Type="Text"><Title>Scene One</Title></BinderItem>' +
      '</Children></BinderItem></Binder></ScrivenerProject>'
  )
  await fs.writeFile(join(scrivDir, 'Files', 'Data', 'BBB', 'content.rtf'), '{\\rtf1\\ansi Hello from Scrivener.\\par}')
  const scriv = await parseScrivener(scrivDir)
  assert(scriv.length === 1 && scriv[0]!.type === 'folder' && scriv[0]!.title === 'Manuscript', 'scrivener binder parsed (folder)')
  const scrivChild = scriv[0]!.children?.[0]
  assert(
    scrivChild?.type === 'document' && /Hello from Scrivener/.test(extractPlainText(scrivChild.content!)),
    'scrivener document text imported'
  )
  // Importing by the .scrivx file path (what the picker now returns) works too.
  const scrivViaFile = await parseScrivener(join(scrivDir, 'Demo.scrivx'))
  assert(
    scrivViaFile.length === 1 && scrivViaFile[0]!.title === 'Manuscript' && scrivViaFile[0]!.children?.length === 1,
    'scrivener imports from a .scrivx file path (not just the folder)'
  )

  // Corkboard freeform layout: a card's position/size persists and clamps.
  {
    const { db: ckdb } = projectService.requireCurrent()
    const saved = setCorkRect(ckdb, 'card-xyz', { x: -10, y: 40, w: 50, h: 900 })
    assert(
      saved['card-xyz']?.x === 0 && saved['card-xyz']?.w === 120 && saved['card-xyz']?.h === 900,
      'corkboard card rect persists and clamps to sane minimums'
    )
    assert(getCorkLayout(ckdb)['card-xyz']?.y === 40, 'corkboard layout reloads from the db')
  }

  // Offline thesaurus (WordNet): synonyms, antonyms, case + plural fallback.
  {
    const q = thesaurus.lookup('quickly')
    assert(
      q.some((s) => s.syns.includes('rapidly')) && q.some((s) => s.ants.includes('slowly')),
      'thesaurus returns synonyms (rapidly) and antonyms (slowly)'
    )
    assert(
      thesaurus.lookup('QUICKLY').length === q.length && thesaurus.lookup('cars').length > 0,
      'thesaurus lookup is case-insensitive and resolves plurals to a base form'
    )
  }

  const savedPath = res.meta.path
  await projectService.close()
  const reopened = await projectService.open(savedPath)
  assert(reopened.tree.length > 0, 'project reopens with its tree')
  await projectService.close()

  await fs.rm(loc, { recursive: true, force: true })
  console.log('SELFTEST_OK: storage core verified end-to-end')
}
