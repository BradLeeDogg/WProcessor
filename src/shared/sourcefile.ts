/** How a stored source file should be presented in the Research viewer. */
export type SourceViewType = 'html' | 'image' | 'pdf' | 'file' | 'meta'

export function classifySourceFile(filePath: string | null | undefined): SourceViewType {
  if (!filePath) return 'meta'
  const ext = filePath.toLowerCase().split('.').pop() ?? ''
  if (ext === 'html' || ext === 'htm') return 'html'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  return 'file'
}
