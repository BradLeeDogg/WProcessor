import type { DocumentContent, ProseMirrorNode } from '@shared/types'
import { DOCUMENT_CONTENT_VERSION } from '@shared/types'
import { documentFile } from './paths'
import { readJson, writeJsonAtomic } from './atomic'

/** A fresh, empty document (single empty paragraph). */
export function emptyDoc(): DocumentContent {
  return {
    version: DOCUMENT_CONTENT_VERSION,
    doc: { type: 'doc', content: [{ type: 'paragraph' }] }
  }
}

/** A document seeded with one or more paragraphs of placeholder/body text. */
export function docFromParagraphs(paragraphs: string[]): DocumentContent {
  const content: ProseMirrorNode[] = paragraphs.map((text) =>
    text
      ? { type: 'paragraph', content: [{ type: 'text', text }] }
      : { type: 'paragraph' }
  )
  return { version: DOCUMENT_CONTENT_VERSION, doc: { type: 'doc', content } }
}

function gatherText(node: ProseMirrorNode, out: string[]): void {
  if (typeof node.text === 'string') out.push(node.text)
  if (node.content) for (const child of node.content) gatherText(child, out)
}

/** Flatten a document to plain text (for word counting and search). */
export function extractPlainText(content: DocumentContent): string {
  const parts: string[] = []
  gatherText(content.doc, parts)
  return parts.join(' ')
}

/** Count words across all text in a document (whitespace-delimited). */
export function countWords(content: DocumentContent): number {
  const text = extractPlainText(content).trim()
  if (!text) return 0
  return text.match(/\S+/g)?.length ?? 0
}

export async function readDocument(root: string, id: string): Promise<DocumentContent | null> {
  return readJson<DocumentContent>(documentFile(root, id))
}

export async function writeDocument(
  root: string,
  id: string,
  content: DocumentContent
): Promise<void> {
  await writeJsonAtomic(documentFile(root, id), content)
}
