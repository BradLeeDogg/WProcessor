import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import type { JSONContent } from '@tiptap/core'
import type { DocumentContent, ManuscriptDefaults, ProseMirrorNode } from '@shared/types'
import { DOCUMENT_CONTENT_VERSION } from '@shared/types'
import { SCREENPLAY_ELEMENTS, SCREENPLAY_LABELS, type ScreenplayElement } from '@shared/screenplay'
import { useStore } from '../store/useStore'
import { Comment } from '../editor/comment'
import { Footnote } from '../editor/footnote'
import { Screenplay } from '../editor/screenplay'
import { Deletion, Insertion, TrackChanges, hasTrackedChanges } from '../editor/trackchanges'
import { Proofreader, getProofIssues } from '../editor/proofreader'
import { FindReplace, getFindState } from '../editor/findreplace'
import { onCommand } from '../lib/commands'
import { mergeDocs } from '@shared/docops'
import type { ProofOptions } from '@shared/proofreader'
import { listComments, listFootnotes } from '../editor/annotations'
import { playKeyClick, playReturn } from '../lib/typewriter'
import AnnotationsPanel from './AnnotationsPanel'

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

function countWords(text: string): number {
  const t = text.trim()
  return t ? (t.match(/\S+/g)?.length ?? 0) : 0
}

export function paperStyle(m: ManuscriptDefaults): React.CSSProperties {
  const pageWidthIn = m.pageSize === 'a4' ? 8.27 : 8.5
  return {
    ['--ms-font' as string]: `'${m.fontFamily}', Times, serif`,
    ['--ms-size' as string]: `${m.fontSizePt}pt`,
    ['--ms-line' as string]: String(m.lineSpacing),
    ['--ms-page-width' as string]: `${pageWidthIn}in`,
    ['--ms-margin' as string]: `${m.marginInches}in`
  }
}

interface Props {
  docId: string
  /** The active editor reports counts + save state to the global topbar. */
  active?: boolean
  /** Keep the caret line vertically centered (composition mode). */
  typewriter?: boolean
  /** Hide the in-pane Notes toggle (e.g. inside Scrivenings sections). */
  hideNotes?: boolean
  /** Render inline (no own scroll container) for stacking in Scrivenings. */
  embedded?: boolean
  /** Called with this document's word count on load and on every edit. */
  onWords?: (n: number) => void
}

/**
 * A self-contained manuscript editor bound to one document id. Owns its own
 * load + debounced atomic autosave + word counting, so it can be used singly,
 * in split view, stacked in Scrivenings, or full-screen in composition mode.
 */
export default function DocumentEditor({
  docId,
  active,
  typewriter,
  hideNotes,
  embedded,
  onWords
}: Props): JSX.Element {
  const meta = useStore((s) => s.meta)
  const setSaveState = useStore((s) => s.setSaveState)
  const setDocWordCount = useStore((s) => s.setDocWordCount)
  const setSelectionWordCount = useStore((s) => s.setSelectionWordCount)
  const setItemWordCount = useStore((s) => s.setItemWordCount)

  const [showAnnot, setShowAnnot] = useState(false)
  const [spMode, setSpMode] = useState(false)
  const [spEl, setSpEl] = useState<ScreenplayElement | null>(null)
  const spModeRef = useRef(false)
  const [suggesting, setSuggesting] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [atChange, setAtChange] = useState(false)
  const suggestingRef = useRef(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [findInfo, setFindInfo] = useState({ count: 0, index: 0 })
  const [flash, setFlash] = useState<string | null>(null)
  const findInputRef = useRef<HTMLInputElement>(null)
  const flashMsg = (m: string): void => {
    setFlash(m)
    setTimeout(() => setFlash(null), 2500)
  }
  const setInserter = useStore((s) => s.setInserter)
  const setProof = useStore((s) => s.setProof)
  const english = useStore((s) => s.meta?.settings.english)
  const oxfordComma = useStore((s) => s.meta?.settings.oxfordComma)
  const dirtyRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const debounceMs = meta?.settings.autosaveDebounceMs ?? 800

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      CharacterCount,
      Comment,
      Footnote,
      Screenplay,
      Insertion,
      Deletion,
      TrackChanges,
      Proofreader,
      FindReplace,
      Placeholder.configure({ placeholder: 'Begin writing…' })
    ],
    content: EMPTY_DOC,
    editorProps: {
      handleDOMEvents: {
        keydown: (_view, event) => {
          // Mechanical keystroke sound when enabled; Enter rings the bell.
          if (useStore.getState().meta?.settings.typewriterSound) {
            if (event.key === 'Enter') playReturn()
            else if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete')
              playKeyClick()
          }
          return false
        }
      }
    },
    onUpdate: ({ editor }) => {
      dirtyRef.current = true
      const words = editor.storage.characterCount.words()
      onWords?.(words)
      if (active) {
        setDocWordCount(words)
        setSaveState('saving')
      }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void save(), debounceMs)
      if (spModeRef.current) setSpEl((editor.getAttributes('paragraph').sp as ScreenplayElement) ?? null)
      setAtChange(editor.isActive('insertion') || editor.isActive('deletion'))
      pushProof()
      if (findOpen) refreshFindInfo()
      centerCaret()
    },
    onSelectionUpdate: ({ editor }) => {
      if (active) {
        const { from, to } = editor.state.selection
        setSelectionWordCount(
          from === to ? 0 : countWords(editor.state.doc.textBetween(from, to, ' '))
        )
      }
      if (spModeRef.current) setSpEl((editor.getAttributes('paragraph').sp as ScreenplayElement) ?? null)
      setAtChange(editor.isActive('insertion') || editor.isActive('deletion'))
      centerCaret()
    },
    onFocus: ({ editor }) => {
      // Last-focused editor becomes the target for inserts from side panels.
      setInserter((content: string) => {
        if (editor.isDestroyed) return false
        editor.chain().focus().insertContent(content).run()
        return true
      })
    }
  })

  const proofOpts = (): ProofOptions => ({
    dialect: english === 'british' ? 'british' : 'american',
    oxfordComma: oxfordComma !== false
  })
  // Only the active editor feeds the Proofreader panel (split/scrivenings still
  // get squiggles, but don't fight over the shared issue list).
  const pushProof = (): void => {
    if (!active || !editor || editor.isDestroyed) return
    setProof(
      getProofIssues(editor.state),
      (from, to, repl) => {
        if (!editor.isDestroyed) editor.chain().focus().insertContentAt({ from, to }, repl).run()
      },
      (from, to) => {
        if (!editor.isDestroyed)
          editor.chain().setTextSelection({ from, to }).scrollIntoView().focus().run()
      }
    )
  }

  const centerCaret = (): void => {
    if (!typewriter || !editor || !scrollRef.current) return
    requestAnimationFrame(() => {
      const container = scrollRef.current
      if (!editor || !container) return
      const coords = editor.view.coordsAtPos(editor.state.selection.head)
      const rect = container.getBoundingClientRect()
      const caretY = coords.top - rect.top + container.scrollTop
      container.scrollTo({ top: caretY - rect.height / 2, behavior: 'auto' })
    })
  }

  const save = async (): Promise<void> => {
    if (!editor) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    try {
      const json = editor.getJSON()
      const res = await window.api.document.write(docId, {
        version: DOCUMENT_CONTENT_VERSION,
        doc: json as never,
        mode: spModeRef.current ? 'screenplay' : 'prose'
      })
      setHasChanges(hasTrackedChanges(json as unknown as ProseMirrorNode))
      dirtyRef.current = false
      setItemWordCount(docId, res.wordCount) // keep project/session totals live
      if (active) {
        setSaveState('saved', res.savedAt)
        setDocWordCount(res.wordCount)
      }
    } catch {
      if (active) setSaveState('error')
    }
  }

  // Load on docId change; flush any pending save of the previous doc first.
  useEffect(() => {
    if (!editor) return
    let cancelled = false
    window.api.document.read(docId).then((content) => {
      if (cancelled) return
      editor.commands.setContent((content?.doc as JSONContent) ?? EMPTY_DOC, false)
      const on = (content as DocumentContent | null)?.mode === 'screenplay'
      spModeRef.current = on
      setSpMode(on)
      editor.commands.setScreenplayEnabled(on)
      setSpEl((editor.getAttributes('paragraph').sp as ScreenplayElement) ?? null)
      editor.commands.setSuggesting(suggestingRef.current)
      editor.commands.setProofreadOptions(proofOpts())
      pushProof()
      setHasChanges(content ? hasTrackedChanges(content.doc) : false)
      dirtyRef.current = false
      const words = editor.storage.characterCount.words()
      onWords?.(words)
      if (active) {
        setDocWordCount(words)
        setSaveState('saved')
      }
      centerCaret()
    })
    return () => {
      cancelled = true
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (dirtyRef.current) void save()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, editor])

  // Re-proofread when the dialect / Oxford-comma preference changes.
  useEffect(() => {
    if (!editor) return
    editor.commands.setProofreadOptions(proofOpts())
    pushProof()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [english, oxfordComma, editor, active])

  const scheduleSave = (): void => {
    dirtyRef.current = true
    if (active) setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void save(), debounceMs)
  }
  const toggleScreenplay = (): void => {
    if (!editor) return
    const on = !spModeRef.current
    spModeRef.current = on
    setSpMode(on)
    editor.commands.setScreenplayEnabled(on)
    // Seed the current line as a scene heading so a fresh script starts cleanly.
    if (on && !editor.getAttributes('paragraph').sp) editor.commands.setScreenplayElement('scene')
    setSpEl((editor.getAttributes('paragraph').sp as ScreenplayElement) ?? null)
    scheduleSave()
  }
  const applyElement = (kind: ScreenplayElement): void => {
    editor?.chain().focus().setScreenplayElement(kind).run()
    setSpEl(kind)
  }
  const toggleSuggesting = (): void => {
    if (!editor) return
    const on = !suggestingRef.current
    suggestingRef.current = on
    setSuggesting(on)
    editor.commands.setSuggesting(on)
  }
  const acceptAll = (): void => {
    editor?.chain().focus().acceptAllChanges().run()
    setHasChanges(false)
    setAtChange(false)
  }
  const rejectAll = (): void => {
    editor?.chain().focus().rejectAllChanges().run()
    setHasChanges(false)
    setAtChange(false)
  }
  const afterResolveOne = (): void => {
    if (!editor) return
    setHasChanges(hasTrackedChanges(editor.getJSON() as unknown as ProseMirrorNode))
    setAtChange(editor.isActive('insertion') || editor.isActive('deletion'))
  }
  const acceptOne = (): void => {
    editor?.chain().focus().acceptChange().run()
    afterResolveOne()
  }
  const rejectOne = (): void => {
    editor?.chain().focus().rejectChange().run()
    afterResolveOne()
  }

  // --- find & replace ---
  const refreshFindInfo = (): void => {
    if (!editor) return
    const st = getFindState(editor.state)
    setFindInfo({ count: st?.matches.length ?? 0, index: st?.index ?? 0 })
  }
  const runFind = (q: string, cs: boolean): void => {
    setFindQuery(q)
    editor?.commands.setFind(q, cs)
    refreshFindInfo()
  }
  const findNext = (): void => {
    editor?.commands.findNext()
    refreshFindInfo()
  }
  const findPrev = (): void => {
    editor?.commands.findPrev()
    refreshFindInfo()
  }
  const replaceOne = (): void => {
    editor?.chain().replaceCurrent(replaceText).findNext().run()
    refreshFindInfo()
  }
  const replaceAllNow = (): void => {
    editor?.commands.replaceAll(replaceText)
    refreshFindInfo()
  }
  const openFind = (): void => {
    setFindOpen(true)
    if (findQuery) runFind(findQuery, caseSensitive)
    setTimeout(() => findInputRef.current?.select(), 0)
  }
  const closeFind = (): void => {
    setFindOpen(false)
    editor?.commands.clearFind()
    editor?.commands.focus()
  }

  // --- split / merge documents ---
  const splitDoc = async (): Promise<void> => {
    if (!editor) return
    const { from } = editor.state.selection
    const doc = editor.state.doc
    const preJSON = doc.cut(0, from).toJSON()
    const postJSON = doc.cut(from).toJSON()
    const tree = useStore.getState().tree
    const item = tree.find((t) => t.id === docId)
    if (!item) return
    const sibs = tree.filter((t) => t.parentId === item.parentId).sort((a, b) => a.position - b.position)
    const idx = sibs.findIndex((s) => s.id === docId)
    const { item: newItem, tree: nextTree } = await window.api.binder.create({
      type: 'document',
      title: `${item.title} (cont.)`,
      parentId: item.parentId,
      index: idx + 1
    })
    await window.api.document.write(newItem.id, {
      version: DOCUMENT_CONTENT_VERSION,
      doc: postJSON as never,
      mode: spModeRef.current ? 'screenplay' : 'prose'
    })
    editor.commands.setContent(preJSON as JSONContent, true) // emit → autosaves the first half
    useStore.getState().setTree(nextTree)
    editor.commands.focus()
    flashMsg('Split off a new document below.')
  }
  const mergeUp = async (): Promise<void> => {
    if (!editor) return
    const tree = useStore.getState().tree
    const item = tree.find((t) => t.id === docId)
    if (!item) return
    const sibs = tree.filter((t) => t.parentId === item.parentId).sort((a, b) => a.position - b.position)
    const prev = sibs[sibs.findIndex((s) => s.id === docId) - 1]
    if (!prev || prev.type !== 'document') {
      flashMsg('No earlier document to merge into.')
      editor.commands.focus()
      return
    }
    const prevContent = await window.api.document.read(prev.id)
    const merged = mergeDocs(
      (prevContent?.doc as ProseMirrorNode) ?? { type: 'doc', content: [] },
      editor.getJSON() as unknown as ProseMirrorNode
    )
    await window.api.document.write(prev.id, { version: DOCUMENT_CONTENT_VERSION, doc: merged })
    useStore.getState().setTree(await window.api.binder.remove(item.id))
    useStore.getState().select(prev.id)
  }

  useEffect(() => {
    if (!active) return
    return onCommand((cmd) => {
      if (cmd === 'find') openFind()
      else if (cmd === 'split-doc') void splitDoc()
      else if (cmd === 'merge-docs') void mergeUp()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, editor, docId, findQuery, caseSensitive])

  const addComment = (): void => {
    if (!editor || editor.state.selection.empty) return
    const text = window.prompt('Comment on the selected text:')
    if (text && text.trim()) editor.chain().focus().setComment(text.trim()).run()
  }
  const addFootnote = (): void => {
    if (!editor) return
    const to = editor.state.selection.to
    const text = window.prompt('Footnote text:')
    if (text == null) return
    editor.chain().focus().setTextSelection(to).insertFootnote(text.trim()).run()
  }

  const annotCount = editor ? listComments(editor).length + listFootnotes(editor).length : 0
  const style = meta ? paperStyle(meta.settings.manuscript) : undefined

  const bubble = editor && (
    <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }} className="bubble">
      <button className={editor.isActive('bold') ? 'on' : ''} onClick={() => editor.chain().focus().toggleBold().run()}>
        <strong>B</strong>
      </button>
      <button className={editor.isActive('italic') ? 'on' : ''} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <em>I</em>
      </button>
      <button className={editor.isActive('underline') ? 'on' : ''} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <span style={{ textDecoration: 'underline' }}>U</span>
      </button>
      <span className="bubble-sep" />
      <button onClick={addComment} title="Comment on selection">❝</button>
      <button onClick={addFootnote} title="Footnote">†</button>
    </BubbleMenu>
  )

  if (embedded) {
    return (
      <div className="editor-embedded">
        {bubble}
        <div className="paper paper-embedded" style={style}>
          <EditorContent editor={editor} className={`manuscript ${spMode ? 'screenplay' : ''}`} />
        </div>
      </div>
    )
  }

  const fmtActive = (name: string, attrs?: Record<string, unknown>): string =>
    editor?.isActive(name, attrs) ? 'on' : ''

  return (
    <div className="editor-pane">
      {bubble}
      {editor && !hideNotes && (
        <div className="format-toolbar">
          <button className={fmtActive('paragraph')} title="Body text" onClick={() => editor.chain().focus().setParagraph().run()}>
            ¶
          </button>
          <button className={fmtActive('heading', { level: 1 })} title="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            H1
          </button>
          <button className={fmtActive('heading', { level: 2 })} title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            H2
          </button>
          <button className={fmtActive('heading', { level: 3 })} title="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            H3
          </button>
          <span className="fmt-sep" />
          <button className={fmtActive('bold')} title="Bold (Ctrl/⌘ B)" onClick={() => editor.chain().focus().toggleBold().run()}>
            <strong>B</strong>
          </button>
          <button className={fmtActive('italic')} title="Italic (Ctrl/⌘ I)" onClick={() => editor.chain().focus().toggleItalic().run()}>
            <em>I</em>
          </button>
          <button className={fmtActive('underline')} title="Underline (Ctrl/⌘ U)" onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <span style={{ textDecoration: 'underline' }}>U</span>
          </button>
          <span className="fmt-sep" />
          <button className={fmtActive('bulletList')} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
            •
          </button>
          <button className={fmtActive('orderedList')} title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            1.
          </button>
          <button className={fmtActive('blockquote')} title="Block quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            ❝
          </button>
          {flash && <span className="fmt-flash muted">{flash}</span>}
          <span className="fmt-spacer" />
          <button title="Find &amp; replace (Ctrl/⌘ F)" onClick={openFind}>
            ⌕
          </button>
        </div>
      )}
      {findOpen && editor && !hideNotes && (
        <div className="find-bar">
          <input
            ref={findInputRef}
            className="find-bar-input"
            value={findQuery}
            placeholder="Find"
            onChange={(e) => runFind(e.target.value, caseSensitive)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.shiftKey ? findPrev() : findNext())
              if (e.key === 'Escape') closeFind()
            }}
          />
          <span className="find-bar-count">
            {findInfo.count ? `${findInfo.index + 1}/${findInfo.count}` : '0/0'}
          </span>
          <button title="Previous (⇧⏎)" onClick={findPrev}>
            ‹
          </button>
          <button title="Next (⏎)" onClick={findNext}>
            ›
          </button>
          <button
            className={caseSensitive ? 'on' : ''}
            title="Match case"
            onClick={() => {
              const cs = !caseSensitive
              setCaseSensitive(cs)
              runFind(findQuery, cs)
            }}
          >
            Aa
          </button>
          <input
            className="find-bar-input"
            value={replaceText}
            placeholder="Replace"
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && replaceOne()}
          />
          <button onClick={replaceOne} disabled={!findInfo.count}>
            Replace
          </button>
          <button onClick={replaceAllNow} disabled={!findInfo.count}>
            All
          </button>
          <button className="icon" title="Close (Esc)" onClick={closeFind}>
            ×
          </button>
        </div>
      )}
      {!hideNotes && (
        <div className="editor-toggles">
          <button
            className={`editor-toggle ${suggesting ? 'on' : ''}`}
            onClick={toggleSuggesting}
            title="Suggesting — record edits as tracked changes"
          >
            Suggesting
          </button>
          <button
            className={`editor-toggle ${spMode ? 'on' : ''}`}
            onClick={toggleScreenplay}
            title="Screenplay formatting (Tab cycles elements, Enter starts the next)"
          >
            Screenplay
          </button>
          <button className="editor-toggle" onClick={() => setShowAnnot((v) => !v)}>
            Notes{annotCount ? ` · ${annotCount}` : ''}
          </button>
        </div>
      )}
      {(suggesting || hasChanges) && !embedded && (
        <div className="tc-bar">
          <span className={`tc-label ${suggesting ? 'on' : ''}`}>
            {suggesting ? '● Suggesting' : 'Tracked changes'}
          </span>
          <span className="tc-spacer" />
          {atChange && (
            <>
              <button onClick={acceptOne} title="Accept the change under the cursor">
                ✓ This
              </button>
              <button onClick={rejectOne} title="Reject the change under the cursor">
                ✗ This
              </button>
              <span className="tc-divider" />
            </>
          )}
          <button onClick={acceptAll} disabled={!hasChanges} title="Accept all changes">
            Accept all
          </button>
          <button onClick={rejectAll} disabled={!hasChanges} title="Reject all changes">
            Reject all
          </button>
        </div>
      )}
      {spMode && !embedded && (
        <div className="sp-toolbar">
          {SCREENPLAY_ELEMENTS.map((k) => (
            <button
              key={k}
              className={spEl === k ? 'on' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyElement(k)}
            >
              {SCREENPLAY_LABELS[k]}
            </button>
          ))}
          <span className="sp-hint muted">Tab cycles · Enter = next</span>
        </div>
      )}
      <div className="editor-stage">
        <div className={`editor-scroll ${typewriter ? 'typewriter' : ''}`} ref={scrollRef}>
          <div className="paper" style={style}>
            <EditorContent editor={editor} className={`manuscript ${spMode ? 'screenplay' : ''}`} />
          </div>
        </div>
        {showAnnot && editor && <AnnotationsPanel editor={editor} onClose={() => setShowAnnot(false)} />}
      </div>
    </div>
  )
}
