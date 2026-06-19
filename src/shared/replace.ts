import type { ProseMirrorNode } from './types'
import { findRanges } from './find'

function replaceInText(
  text: string,
  query: string,
  replacement: string,
  caseSensitive: boolean
): { text: string; count: number } {
  if (!query) return { text, count: 0 }
  const hay = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  let out = ''
  let from = 0
  let count = 0
  let i = hay.indexOf(needle)
  while (i !== -1) {
    out += text.slice(from, i) + replacement
    from = i + needle.length
    count++
    i = hay.indexOf(needle, from)
  }
  return { text: out + text.slice(from), count }
}

/** Replace occurrences within each text node (structure-preserving). Pure. */
export function replaceInDoc(
  node: ProseMirrorNode,
  query: string,
  replacement: string,
  caseSensitive: boolean
): { node: ProseMirrorNode; count: number } {
  if (node.type === 'text' && typeof node.text === 'string') {
    const r = replaceInText(node.text, query, replacement, caseSensitive)
    return { node: r.count ? { ...node, text: r.text } : node, count: r.count }
  }
  if (!node.content) return { node, count: 0 }
  let count = 0
  const content = node.content.map((c) => {
    const r = replaceInDoc(c, query, replacement, caseSensitive)
    count += r.count
    return r.node
  })
  return { node: count ? { ...node, content } : node, count }
}

/** Count matches in a document (per text node, like the editor's find). */
export function countInDoc(node: ProseMirrorNode, query: string, caseSensitive: boolean): number {
  if (node.type === 'text' && typeof node.text === 'string') {
    return findRanges(node.text, query, caseSensitive).length
  }
  return (node.content ?? []).reduce((n, c) => n + countInDoc(c, query, caseSensitive), 0)
}
