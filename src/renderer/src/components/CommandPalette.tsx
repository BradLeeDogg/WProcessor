import { useEffect, useMemo, useRef, useState } from 'react'
import { runCommand, type AppCommand } from '../lib/commands'

interface Cmd {
  id: AppCommand
  label: string
  hint?: string
}

// Ordered, searchable list of actions. Shortcut hints mirror the native menu.
const COMMANDS: Cmd[] = [
  { id: 'quick-open', label: 'Go to document…', hint: 'Ctrl/⌘ P' },
  { id: 'find', label: 'Find & Replace', hint: 'Ctrl/⌘ F' },
  { id: 'new-doc', label: 'New document', hint: 'Ctrl/⌘ N' },
  { id: 'new-folder', label: 'New folder', hint: 'Ctrl/⌘ ⇧ N' },
  { id: 'split-doc', label: 'Split document at cursor', hint: 'Ctrl/⌘ ⇧ K' },
  { id: 'merge-docs', label: 'Merge with previous', hint: 'Ctrl/⌘ ⇧ M' },
  { id: 'insert-image', label: 'Insert image…' },
  { id: 'view-scrivenings', label: 'View: Scrivenings', hint: 'Ctrl/⌘ 1' },
  { id: 'view-corkboard', label: 'View: Corkboard', hint: 'Ctrl/⌘ 2' },
  { id: 'view-outliner', label: 'View: Outliner', hint: 'Ctrl/⌘ 3' },
  { id: 'split-view', label: 'Toggle split view' },
  { id: 'compose', label: 'Composition mode' },
  { id: 'toggle-theme', label: 'Toggle dark / light theme' },
  { id: 'panel-inspector', label: 'Inspector' },
  { id: 'panel-sources', label: 'Sources' },
  { id: 'panel-factcheck', label: 'Fact-check' },
  { id: 'panel-transcripts', label: 'Transcripts' },
  { id: 'panel-proofread', label: 'Proofreader' },
  { id: 'panel-targets', label: 'Targets & deadline' },
  { id: 'snapshot', label: 'Snapshots' },
  { id: 'backup-now', label: 'Back up now' },
  { id: 'compile', label: 'Compile / Export…', hint: 'Ctrl/⌘ E' },
  { id: 'open-settings', label: 'Settings…' },
  { id: 'help', label: 'Help & Shortcuts', hint: 'Ctrl/⌘ /' }
]

/** ⌘/Ctrl-K palette: type to run any command. */
export default function CommandPalette({ onClose }: { onClose: () => void }): JSX.Element {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return COMMANDS
    return COMMANDS.map((c) => {
      const idx = c.label.toLowerCase().indexOf(query)
      return idx < 0 ? null : { c, score: (c.label.toLowerCase().startsWith(query) ? 0 : 100) + idx }
    })
      .filter((x): x is { c: Cmd; score: number } => x !== null)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.c)
  }, [q])

  useEffect(() => {
    setActive(0)
  }, [q])

  const run = (id?: AppCommand): void => {
    const target = id ?? results[active]?.id
    onClose()
    if (target) runCommand(target)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="modal-backdrop quickopen-backdrop" onClick={onClose}>
      <div className="quickopen" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="quickopen-input"
          placeholder="Run a command…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul className="quickopen-list">
          {results.map((r, i) => (
            <li
              key={r.id}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(r.id)}
            >
              <span className="quickopen-title">{r.label}</span>
              {r.hint && <span className="cmd-hint">{r.hint}</span>}
            </li>
          ))}
          {results.length === 0 && <li className="quickopen-empty muted">No matching command</li>}
        </ul>
      </div>
    </div>
  )
}
