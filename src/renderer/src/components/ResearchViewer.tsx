import { useEffect, useState } from 'react'
import type { SourceContent } from '@shared/api'
import { inTextCitation, type CitationStyle } from '@shared/citations'
import { defaultPresetFor } from '@shared/presets'
import { useStore } from '../store/useStore'

/** Reads a source beside the draft; pull a selected quote into a footnote/citation. */
export default function ResearchViewer(): JSX.Element | null {
  const id = useStore((s) => s.viewSourceId)
  const close = useStore((s) => s.closeViewSource)
  const inserter = useStore((s) => s.inserter)
  const footnoteInserter = useStore((s) => s.footnoteInserter)
  const meta = useStore((s) => s.meta)

  const [content, setContent] = useState<SourceContent | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [quote, setQuote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setContent(null)
    setQuote('')
    if (id) void window.api.source.open(id).then(setContent)
  }, [id])

  // Render PDFs inline via Chromium's built-in viewer (blob URL in an iframe).
  useEffect(() => {
    if (content?.type === 'pdf' && content.dataUrl) {
      const b64 = content.dataUrl.split(',')[1] ?? ''
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      setPdfUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setPdfUrl(null)
    return undefined
  }, [content])

  if (!id) return null
  const src = content?.source
  const style: CitationStyle = (() => {
    const p = meta ? defaultPresetFor(meta.type) : 'mla'
    return p === 'apa' || p === 'chicago' ? p : 'mla'
  })()
  const ref = src ? `${src.author || src.title}${src.year ? `, ${src.year}` : ''}` : ''
  const flash = (m: string): void => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2200)
  }
  const grabSelection = (): void => {
    const s = window.getSelection()?.toString().trim()
    if (s) setQuote(s)
  }

  const insertFootnote = (): void => {
    if (!footnoteInserter) return flash('Click into the editor first.')
    footnoteInserter(quote ? `“${quote}” — ${ref}` : ref)
    flash('Inserted footnote')
  }
  const insertCite = (): void => {
    if (!src) return
    if (inserter?.(inTextCitation(src, style))) flash('Inserted citation')
    else flash('Click into the editor first.')
  }
  const saveToNotes = async (): Promise<void> => {
    if (!src || !quote) return
    const notes = src.notes ? `${src.notes}\n\n“${quote}”` : `“${quote}”`
    await window.api.source.update(src.id, { notes })
    setContent({ ...(content as SourceContent), source: { ...src, notes } })
    flash('Saved to source notes')
  }

  return (
    <aside className="research-viewer">
      <div className="drawer-head">
        <h3 className="rv-title" title={src?.title}>
          {src?.title ?? 'Research'}
        </h3>
        {(content?.type === 'pdf' || content?.type === 'file' || content?.type === 'image') && (
          <button className="rv-ext" title="Open in default app" onClick={() => window.api.source.openExternal(id)}>
            ↗
          </button>
        )}
        <button className="icon" onClick={close}>
          ×
        </button>
      </div>

      <div className="rv-body">
        {!content && <p className="muted drawer-pad">Loading…</p>}
        {content?.type === 'html' && (
          <div
            className="research-html"
            onMouseUp={grabSelection}
            onClick={(e) => {
              // Don't let article links navigate the app away.
              if ((e.target as HTMLElement).closest('a')) e.preventDefault()
            }}
            dangerouslySetInnerHTML={{ __html: content.html ?? '' }}
          />
        )}
        {content?.type === 'image' && <img className="rv-image" src={content.dataUrl} alt={src?.title} />}
        {content?.type === 'pdf' &&
          (pdfUrl ? (
            <iframe className="rv-pdf" src={pdfUrl} title={src?.title} />
          ) : (
            <p className="muted drawer-pad">Loading PDF…</p>
          ))}
        {content?.type === 'file' && (
          <div className="rv-file drawer-pad">
            <p className="muted">File: {src?.title}</p>
            <button className="primary" onClick={() => window.api.source.openExternal(id)}>
              Open in default app
            </button>
          </div>
        )}
        {content?.type === 'meta' && (
          <div className="rv-meta drawer-pad">
            {src?.url && <p className="rv-url">{src.url}</p>}
            {src?.locator && <p className="muted">@ {src.locator}</p>}
            {src?.notes && <p>{src.notes}</p>}
            {!src?.url && !src?.notes && <p className="muted">No preview for this source.</p>}
          </div>
        )}
      </div>

      <div className="rv-pull">
        <textarea
          className="rv-quote"
          value={quote}
          placeholder="Select text above, or type a quote…"
          onChange={(e) => setQuote(e.target.value)}
        />
        <div className="rv-actions">
          <button onClick={insertFootnote} title="Insert a footnote at the cursor">
            → Footnote
          </button>
          <button onClick={insertCite} title="Insert an in-text citation at the cursor">
            → Cite
          </button>
          <button onClick={saveToNotes} disabled={!quote}>
            Save note
          </button>
          {msg && <span className="rv-msg muted">{msg}</span>}
        </div>
      </div>
    </aside>
  )
}
