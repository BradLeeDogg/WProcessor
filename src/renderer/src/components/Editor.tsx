import { useEffect, useMemo, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import type { JSONContent } from '@tiptap/core'
import type { ManuscriptDefaults } from '@shared/types'
import { DOCUMENT_CONTENT_VERSION } from '@shared/types'
import { useStore } from '../store/useStore'

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

function countWords(text: string): number {
  const t = text.trim()
  return t ? (t.match(/\S+/g)?.length ?? 0) : 0
}

/** Translate manuscript defaults into the paper column's CSS variables. */
function paperStyle(m: ManuscriptDefaults): React.CSSProperties {
  const pageWidthIn = m.pageSize === 'a4' ? 8.27 : 8.5
  return {
    ['--ms-font' as string]: `'${m.fontFamily}', Times, serif`,
    ['--ms-size' as string]: `${m.fontSizePt}pt`,
    ['--ms-line' as string]: String(m.lineSpacing),
    ['--ms-page-width' as string]: `${pageWidthIn}in`,
    ['--ms-margin' as string]: `${m.marginInches}in`
  }
}

export default function Editor(): JSX.Element {
  const selectedId = useStore((s) => s.selectedId)
  const tree = useStore((s) => s.tree)
  const meta = useStore((s) => s.meta)
  const setSaveState = useStore((s) => s.setSaveState)
  const setDocWordCount = useStore((s) => s.setDocWordCount)
  const setSelectionWordCount = useStore((s) => s.setSelectionWordCount)

  const selectedItem = useMemo(
    () => tree.find((t) => t.id === selectedId) ?? null,
    [tree, selectedId]
  )
  const isDocument = selectedItem?.type === 'document'

  const loadedIdRef = useRef<string | null>(null)
  const dirtyRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceMs = meta?.settings.autosaveDebounceMs ?? 800

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      CharacterCount,
      Placeholder.configure({ placeholder: 'Begin writing…' })
    ],
    content: EMPTY_DOC,
    onUpdate: ({ editor }) => {
      dirtyRef.current = true
      setDocWordCount(editor.storage.characterCount.words())
      setSaveState('saving')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void save(), debounceMs)
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection
      setSelectionWordCount(from === to ? 0 : countWords(editor.state.doc.textBetween(from, to, ' ')))
    }
  })

  // Persist the currently-loaded document immediately (used on switch/unmount).
  const save = async (): Promise<void> => {
    const id = loadedIdRef.current
    if (!id || !editor) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    try {
      const res = await window.api.document.write(id, {
        version: DOCUMENT_CONTENT_VERSION,
        doc: editor.getJSON() as never
      })
      dirtyRef.current = false
      setSaveState('saved', res.savedAt)
      setDocWordCount(res.wordCount)
    } catch {
      setSaveState('error')
    }
  }

  const flushIfDirty = (): void => {
    if (dirtyRef.current) void save()
  }

  // Load the selected document; flush any pending save of the previous one first.
  useEffect(() => {
    if (!editor) return
    flushIfDirty()
    if (!selectedId || !isDocument) {
      loadedIdRef.current = null
      editor.commands.clearContent(false)
      setDocWordCount(0)
      setSaveState('idle')
      return
    }
    let cancelled = false
    window.api.document.read(selectedId).then((content) => {
      if (cancelled) return
      loadedIdRef.current = selectedId
      editor.commands.setContent((content?.doc as JSONContent) ?? EMPTY_DOC, false)
      dirtyRef.current = false
      setDocWordCount(editor.storage.characterCount.words())
      setSaveState('saved')
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, isDocument, editor])

  // Flush on unmount so closing a window/project never drops the last edit.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      flushIfDirty()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!selectedItem) {
    return (
      <div className="editor-empty">
        <p>Select a document in the binder, or create one.</p>
      </div>
    )
  }
  if (!isDocument) {
    return (
      <div className="editor-empty">
        <p>
          <strong>{selectedItem.title}</strong> is a folder.
        </p>
        <p className="muted">Select a document inside it to write.</p>
      </div>
    )
  }

  return (
    <div className="editor-scroll">
      <div className="paper" style={meta ? paperStyle(meta.settings.manuscript) : undefined}>
        <EditorContent editor={editor} className="manuscript" />
      </div>
    </div>
  )
}
