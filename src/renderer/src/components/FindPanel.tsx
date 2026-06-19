import { useEffect, useState } from 'react'
import type { Collection, CollectionCriteria, SearchResult } from '@shared/types'
import { useStore } from '../store/useStore'

interface Props {
  onClose: () => void
}

/** Full-text search across the project + saved, reusable dynamic collections. */
export default function FindPanel({ onClose }: Props): JSX.Element {
  const labels = useStore((s) => s.labels)
  const select = useStore((s) => s.select)
  const flushActive = useStore((s) => s.flushActive)
  const bumpDocReload = useStore((s) => s.bumpDocReload)

  const [text, setText] = useState('')
  const [labelId, setLabelId] = useState('')
  const [statusId, setStatusId] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [collections, setCollections] = useState<Collection[]>([])

  const [replaceWith, setReplaceWith] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [preview, setPreview] = useState<Array<{ itemId: string; title: string; count: number }>>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [repMsg, setRepMsg] = useState<string | null>(null)
  const [repBusy, setRepBusy] = useState(false)

  const statuses = labels.filter((l) => l.kind === 'status')
  const labelDefs = labels.filter((l) => l.kind === 'label')

  const refreshCollections = (): void => {
    void window.api.collection.list().then(setCollections)
  }
  useEffect(refreshCollections, [])

  const criteria = (): CollectionCriteria => ({
    text: text.trim() || undefined,
    labelId: labelId || null,
    statusId: statusId || null
  })

  const run = async (): Promise<void> => {
    setResults(await window.api.search.run(criteria()))
    setSearched(true)
  }

  const saveCollection = async (): Promise<void> => {
    const name = window.prompt('Name this collection:')
    if (!name || !name.trim()) return
    await window.api.collection.create(name.trim(), criteria())
    refreshCollections()
  }

  const loadCollection = async (c: Collection): Promise<void> => {
    setText(c.criteria.text ?? '')
    setLabelId(c.criteria.labelId ?? '')
    setStatusId(c.criteria.statusId ?? '')
    setResults(await window.api.search.run(c.criteria))
    setSearched(true)
  }

  const removeCollection = async (id: string): Promise<void> => {
    setCollections(await window.api.collection.remove(id))
  }

  const runPreview = async (): Promise<void> => {
    if (!text.trim()) return
    const p = await window.api.search.replacePreview(text, caseSensitive)
    setPreview(p)
    setPicked(new Set(p.map((x) => x.itemId)))
    setRepMsg(p.length ? null : 'No matches to replace.')
  }
  const togglePick = (id: string): void =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const applyReplace = async (): Promise<void> => {
    const ids = preview.filter((p) => picked.has(p.itemId)).map((p) => p.itemId)
    if (!ids.length) return
    if (
      !window.confirm(
        `Replace “${text}” with “${replaceWith}” in ${ids.length} document${ids.length === 1 ? '' : 's'}? A snapshot of each is taken first.`
      )
    )
      return
    setRepBusy(true)
    try {
      await flushActive?.()
      const res = await window.api.search.replaceApply(text, replaceWith, caseSensitive, ids)
      bumpDocReload()
      setPreview([])
      setPicked(new Set())
      setRepMsg(
        `Replaced ${res.replacements} occurrence${res.replacements === 1 ? '' : 's'} in ${res.docs} document${res.docs === 1 ? '' : 's'}.`
      )
    } finally {
      setRepBusy(false)
    }
  }

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <h3>Find</h3>
        <button className="icon" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="find-form drawer-pad">
        <input
          autoFocus
          value={text}
          placeholder="Search text…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <div className="find-filters">
          <select value={statusId} onChange={(e) => setStatusId(e.target.value)}>
            <option value="">Any status</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={labelId} onChange={(e) => setLabelId(e.target.value)}>
            <option value="">Any label</option>
            {labelDefs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="find-actions">
          <button className="primary" onClick={run}>
            Search
          </button>
          <button onClick={saveCollection}>Save as collection</button>
        </div>
      </div>

      <div className="find-replace drawer-pad">
        <input
          value={replaceWith}
          placeholder="Replace with…"
          onChange={(e) => setReplaceWith(e.target.value)}
        />
        <div className="find-rep-row">
          <label className="find-case">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            Match case
          </label>
          <button onClick={runPreview} disabled={!text.trim()}>
            Preview replace
          </button>
        </div>
        {repMsg && <p className="muted find-rep-msg">{repMsg}</p>}
        {preview.length > 0 && (
          <div className="find-rep-preview">
            <ul>
              {preview.map((p) => (
                <li key={p.itemId}>
                  <label>
                    <input
                      type="checkbox"
                      checked={picked.has(p.itemId)}
                      onChange={() => togglePick(p.itemId)}
                    />
                    <span className="find-rep-title">{p.title}</span>
                    <span className="find-count">{p.count}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button className="primary" disabled={repBusy || picked.size === 0} onClick={applyReplace}>
              Replace in {picked.size} doc{picked.size === 1 ? '' : 's'}
            </button>
          </div>
        )}
      </div>

      <ul className="find-results">
        {searched && results.length === 0 && <li className="muted drawer-pad">No matches.</li>}
        {results.map((r) => (
          <li key={r.itemId}>
            <button className="find-result" onClick={() => select(r.itemId)}>
              <span className="find-title">
                {r.title}
                {r.matches > 0 && <span className="find-count"> · {r.matches}</span>}
              </span>
              {r.snippet && <span className="find-snippet">{r.snippet}</span>}
            </button>
          </li>
        ))}
      </ul>

      <div className="find-collections">
        <h4>Collections</h4>
        {collections.length === 0 && <p className="muted drawer-pad">Save a search to reuse it.</p>}
        <ul>
          {collections.map((c) => (
            <li key={c.id}>
              <button className="find-collection" onClick={() => loadCollection(c)}>
                {c.name}
              </button>
              <button className="recent-remove" title="Delete" onClick={() => removeCollection(c.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
