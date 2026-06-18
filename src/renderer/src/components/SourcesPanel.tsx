import { useEffect, useState } from 'react'
import type { Source, SourceKind } from '@shared/types'
import {
  buildBibliography,
  CITATION_STYLES,
  CITATION_STYLE_LABELS,
  inTextCitation,
  type CitationStyle
} from '@shared/citations'
import { defaultPresetFor } from '@shared/presets'
import { useStore } from '../store/useStore'

interface Props {
  onClose: () => void
}

const MANUAL_KINDS: SourceKind[] = ['url', 'transcript', 'note']
type EditField = 'author' | 'title' | 'container' | 'publisher' | 'year' | 'locator' | 'url'
const EDIT_FIELDS: Array<[EditField, string]> = [
  ['author', 'Author(s)'],
  ['title', 'Title'],
  ['container', 'Container (site / journal / book)'],
  ['publisher', 'Publisher'],
  ['year', 'Year / date'],
  ['locator', 'Pages / locator'],
  ['url', 'URL']
]

/** The project's research library + a citation/bibliography generator. */
export default function SourcesPanel({ onClose }: Props): JSX.Element {
  const meta = useStore((s) => s.meta)
  const inserter = useStore((s) => s.inserter)
  const viewSource = useStore((s) => s.viewSource)
  const [sources, setSources] = useState<Source[]>([])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [kind, setKind] = useState<SourceKind>('url')
  const [title, setTitle] = useState('')
  const [ref, setRef] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const initialStyle = (): CitationStyle => {
    const p = meta ? defaultPresetFor(meta.type) : 'mla'
    return p === 'apa' || p === 'chicago' ? p : 'mla'
  }
  const [style, setStyle] = useState<CitationStyle>(initialStyle)

  const refresh = (): void => {
    void window.api.source.list().then(setSources)
  }
  useEffect(refresh, [])

  const flash = (m: string): void => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2500)
  }

  const capture = async (): Promise<void> => {
    if (!url.trim()) return
    setBusy(true)
    setMsg('Capturing…')
    try {
      const s = await window.api.source.capture(url.trim())
      setUrl('')
      setMsg(`Captured “${s.title}”`)
      refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Capture failed')
    } finally {
      setBusy(false)
    }
  }

  const importFile = async (): Promise<void> => {
    const s = await window.api.source.importFile()
    if (s) {
      setMsg(`Imported “${s.title}”`)
      refresh()
    }
  }

  const addManual = async (): Promise<void> => {
    if (!title.trim()) return
    await window.api.source.createManual({
      kind,
      title: title.trim(),
      url: kind === 'url' ? ref.trim() || null : null,
      locator: kind === 'transcript' ? ref.trim() || null : null
    })
    setTitle('')
    setRef('')
    refresh()
  }

  const remove = async (id: string): Promise<void> => {
    setSources(await window.api.source.remove(id))
  }

  const patchLocal = (id: string, field: EditField, value: string): void =>
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
  const persist = (id: string, field: EditField, value: string): void => {
    void window.api.source.update(id, { [field]: value })
  }

  const copyBibliography = async (): Promise<void> => {
    const bib = buildBibliography(sources, style)
    await window.api.clipboard.write(bib.text, bib.html)
    flash(`Copied ${bib.entries.length} ${CITATION_STYLE_LABELS[style]} entr${bib.entries.length === 1 ? 'y' : 'ies'}`)
  }
  const insertBibliography = (): void => {
    const bib = buildBibliography(sources, style)
    if (inserter?.(bib.html)) flash(`Inserted ${bib.entries.length} entr${bib.entries.length === 1 ? 'y' : 'ies'}`)
    else void copyBibliography()
  }
  const insertInText = (s: Source): void => {
    const t = inTextCitation(s, style)
    if (inserter?.(t)) flash(`Inserted ${t}`)
    else {
      void window.api.clipboard.write(t, t)
      flash(`Copied ${t}`)
    }
  }

  const bibliography = buildBibliography(sources, style)

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <h3>Sources</h3>
        <button className="icon" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="src-section">
        <label className="insp-label">Capture web page</label>
        <div className="src-capture">
          <input
            value={url}
            placeholder="https://…"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && capture()}
          />
          <button className="primary" disabled={busy} onClick={capture}>
            Capture
          </button>
        </div>
        <button onClick={importFile}>Import file (PDF / image)…</button>
        {msg && <p className="src-msg muted">{msg}</p>}
      </div>

      <div className="src-section">
        <label className="insp-label">Add reference</label>
        <div className="src-manual">
          <select value={kind} onChange={(e) => setKind(e.target.value as SourceKind)}>
            {MANUAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input value={title} placeholder="Title" onChange={(e) => setTitle(e.target.value)} />
          {kind !== 'note' && (
            <input
              value={ref}
              placeholder={kind === 'url' ? 'URL' : 'Timestamp / locator'}
              onChange={(e) => setRef(e.target.value)}
            />
          )}
          <button onClick={addManual}>Add</button>
        </div>
      </div>

      <ul className="src-list">
        {sources.length === 0 && <li className="muted drawer-pad">No sources yet.</li>}
        {sources.map((s) => (
          <li key={s.id}>
            <div className="src-item">
              <span className={`src-kind src-kind-${s.kind}`}>{s.kind}</span>
              <button className="src-title src-open" title="Open in Research viewer" onClick={() => viewSource(s.id)}>
                {s.title}
              </button>
              <button
                className="recent-remove"
                title="Edit citation details"
                onClick={() => setExpanded((id) => (id === s.id ? null : s.id))}
              >
                ✎
              </button>
              <button className="recent-remove" title="Delete" onClick={() => remove(s.id)}>
                ×
              </button>
            </div>
            {expanded === s.id && (
              <div className="src-edit">
                {EDIT_FIELDS.map(([field, label]) => (
                  <label key={field} className="src-edit-field">
                    <span>{label}</span>
                    <input
                      value={(s[field] as string) ?? ''}
                      onChange={(e) => patchLocal(s.id, field, e.target.value)}
                      onBlur={(e) => persist(s.id, field, e.target.value)}
                    />
                  </label>
                ))}
                <div className="src-edit-foot">
                  <code className="src-intext">{inTextCitation(s, style)}</code>
                  <button onClick={() => insertInText(s)} title="Insert at cursor (or copy)">
                    Insert
                  </button>
                </div>
              </div>
            )}
            {expanded !== s.id && s.url && <span className="src-sub">{s.url}</span>}
          </li>
        ))}
      </ul>

      <div className="src-section biblio">
        <div className="biblio-head">
          <label className="insp-label">Bibliography</label>
          <select value={style} onChange={(e) => setStyle(e.target.value as CitationStyle)}>
            {CITATION_STYLES.map((st) => (
              <option key={st} value={st}>
                {CITATION_STYLE_LABELS[st]}
              </option>
            ))}
          </select>
          <button disabled={!sources.length} onClick={insertBibliography} title="Insert at cursor">
            Insert
          </button>
          <button className="primary" disabled={!sources.length} onClick={copyBibliography}>
            Copy
          </button>
        </div>
        {sources.length ? (
          <div className="biblio-preview" dangerouslySetInnerHTML={{ __html: bibliography.html }} />
        ) : (
          <p className="muted">Add sources, fill in author/year/title, then copy a formatted list.</p>
        )}
        <p className="biblio-note muted">
          Best-effort {CITATION_STYLE_LABELS[style]} — review entries before submitting.
        </p>
      </div>
    </aside>
  )
}
