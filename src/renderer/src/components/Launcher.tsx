import { useEffect, useState } from 'react'
import type { ProjectType, RecentProject } from '@shared/types'
import type { StructureOverlay } from '@shared/api'
import { useStore } from '../store/useStore'

const TYPE_OPTIONS: Array<{ value: ProjectType; label: string; note: string }> = [
  { value: 'novel', label: 'Novel', note: 'Chapters, characters, settings, timeline' },
  { value: 'novella', label: 'Novella', note: 'Lighter chapter skeleton' },
  { value: 'short-story', label: 'Short Story', note: 'Single arc, minimal' },
  { value: 'nonfiction-book', label: 'Nonfiction Book', note: 'Proposal apparatus + chapters' },
  { value: 'journalism-short', label: 'Journalism — Short', note: 'Lede/nut-graf scaffold, fact-check' },
  { value: 'journalism-long', label: 'Journalism — Feature', note: 'Scene-driven, fact-check' },
  { value: 'dissertation', label: 'Dissertation', note: 'Front matter, chapters, references' }
]

const OVERLAYS: Array<{ value: StructureOverlay | ''; label: string }> = [
  { value: '', label: 'No structure overlay' },
  { value: 'three-act', label: 'Three-Act' },
  { value: 'seven-point', label: 'Seven-Point' },
  { value: 'heros-journey', label: "Hero's Journey" },
  { value: 'save-the-cat', label: 'Save the Cat' }
]

export default function Launcher(): JSX.Element {
  const openResult = useStore((s) => s.openResult)
  const [recents, setRecents] = useState<RecentProject[]>([])
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [type, setType] = useState<ProjectType>('novel')
  const [location, setLocation] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<StructureOverlay | ''>('')

  const refreshRecents = (): void => {
    window.api.app.getRecentProjects().then(setRecents)
  }
  useEffect(refreshRecents, [])

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const openByPath = (path: string): Promise<void> =>
    run(async () => openResult(await window.api.project.open(path)))

  const handleOpenDialog = (): Promise<void> =>
    run(async () => {
      const path = await window.api.app.pickExistingProject()
      if (path) openResult(await window.api.project.open(path))
    })

  const handlePickLocation = async (): Promise<void> => {
    const dir = await window.api.app.pickNewProjectLocation()
    if (dir) setLocation(dir)
  }

  const handleCreate = (): Promise<void> =>
    run(async () => {
      if (!title.trim()) throw new Error('Give the project a title')
      if (!location) throw new Error('Choose where to create the project')
      const showOverlay = type === 'novel' || type === 'novella'
      openResult(
        await window.api.project.create({
          title: title.trim(),
          type,
          location,
          structureOverlay: showOverlay && overlay ? overlay : null
        })
      )
    })

  const removeRecent = async (path: string): Promise<void> => {
    setRecents(await window.api.app.removeRecentProject(path))
  }

  const showOverlay = type === 'novel' || type === 'novella'

  return (
    <div className="launcher">
      <header className="launcher-head">
        <h1>WProcessor</h1>
        <p className="muted">Nothing between you and the page.</p>
      </header>

      {!creating ? (
        <div className="launcher-body">
          <div className="launcher-actions">
            <button className="primary" onClick={() => setCreating(true)} disabled={busy}>
              New Project
            </button>
            <button onClick={handleOpenDialog} disabled={busy}>
              Open Project…
            </button>
          </div>

          <section className="recents">
            <h2>Recent</h2>
            {recents.length === 0 && <p className="muted">No recent projects yet.</p>}
            <ul>
              {recents.map((r) => (
                <li key={r.path}>
                  <button className="recent-item" onClick={() => openByPath(r.path)} disabled={busy}>
                    <span className="recent-title">{r.title}</span>
                    <span className="recent-path">{r.path}</span>
                  </button>
                  <button
                    className="recent-remove"
                    title="Remove from list"
                    onClick={() => removeRecent(r.path)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <div className="new-project">
          <label className="field">
            <span>Title</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Novel"
            />
          </label>

          <fieldset className="field">
            <span>Type</span>
            <div className="type-grid">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`type-option ${type === opt.value ? 'selected' : ''}`}
                  onClick={() => setType(opt.value)}
                >
                  <strong>{opt.label}</strong>
                  <em>{opt.note}</em>
                </button>
              ))}
            </div>
          </fieldset>

          {showOverlay && (
            <label className="field">
              <span>Structure overlay (optional)</span>
              <select value={overlay} onChange={(e) => setOverlay(e.target.value as StructureOverlay | '')}>
                {OVERLAYS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span>Location</span>
            <div className="location-row">
              <button onClick={handlePickLocation}>Choose folder…</button>
              <span className="muted location-path">{location ?? 'No folder chosen'}</span>
            </div>
          </label>

          <div className="launcher-actions">
            <button className="primary" onClick={handleCreate} disabled={busy}>
              Create
            </button>
            <button onClick={() => setCreating(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  )
}
