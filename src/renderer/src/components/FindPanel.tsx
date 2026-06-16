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

  const [text, setText] = useState('')
  const [labelId, setLabelId] = useState('')
  const [statusId, setStatusId] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [collections, setCollections] = useState<Collection[]>([])

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
