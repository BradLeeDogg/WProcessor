import type { ProseMirrorNode } from './types'

/** Concatenate two documents' block content (used by "merge with previous"). */
export function mergeDocs(prev: ProseMirrorNode, cur: ProseMirrorNode): ProseMirrorNode {
  return { ...prev, type: 'doc', content: [...(prev.content ?? []), ...(cur.content ?? [])] }
}
