import type { CollectionCriteria, SearchResult } from '@shared/types'
import type { DB } from './db'
import { extractPlainText, readDocument } from './documents'

const PAD = 45

function makeSnippet(text: string, idx: number, qlen: number): string {
  const start = Math.max(0, idx - PAD)
  const end = Math.min(text.length, idx + qlen + PAD)
  return (
    (start > 0 ? '…' : '') +
    text.slice(start, end).replace(/\s+/g, ' ').trim() +
    (end < text.length ? '…' : '')
  )
}

/**
 * Evaluate a criteria over the project: filter documents by label/status, then
 * (if a query is given) full-text match their prose. v1 scans document files on
 * demand — fine for typical projects; an FTS index can come later.
 */
export async function searchProject(
  db: DB,
  root: string,
  criteria: CollectionCriteria
): Promise<SearchResult[]> {
  const rows = db
    .prepare("SELECT id, title, label_id, status_id FROM binder_items WHERE type = 'document'")
    .all() as Array<{ id: string; title: string; label_id: string | null; status_id: string | null }>

  const query = (criteria.text ?? '').trim().toLowerCase()
  const results: SearchResult[] = []

  for (const row of rows) {
    if (criteria.labelId && row.label_id !== criteria.labelId) continue
    if (criteria.statusId && row.status_id !== criteria.statusId) continue

    if (!query) {
      results.push({ itemId: row.id, title: row.title, snippet: '', matches: 0 })
      continue
    }

    const titleHit = row.title.toLowerCase().includes(query)
    const content = await readDocument(root, row.id)
    const body = content ? extractPlainText(content) : ''
    const lower = body.toLowerCase()
    const firstIdx = lower.indexOf(query)
    if (firstIdx === -1 && !titleHit) continue

    let matches = 0
    for (let i = lower.indexOf(query); i !== -1; i = lower.indexOf(query, i + query.length)) matches++

    results.push({
      itemId: row.id,
      title: row.title,
      snippet: firstIdx >= 0 ? makeSnippet(body, firstIdx, query.length) : '',
      matches
    })
  }
  return results
}
