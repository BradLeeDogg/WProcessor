interface Props {
  onClose: () => void
}

const SHORTCUTS: Array<[string, string]> = [
  ['Command palette', 'Ctrl/⌘ K'],
  ['Go to document', 'Ctrl/⌘ P'],
  ['Find & replace', 'Ctrl/⌘ F'],
  ['New document / folder', 'Ctrl/⌘ N · ⇧N'],
  ['Split / merge document', 'Ctrl/⌘ ⇧ K · ⇧M'],
  ['Scrivenings / Corkboard / Outliner', 'Ctrl/⌘ 1 · 2 · 3'],
  ['Compile & export', 'Ctrl/⌘ E']
]

const TIPS: Array<[string, string]> = [
  ['Organize', 'The binder (left) holds folders & documents — drag to reorder, right-click for Split / Merge / Trash.'],
  ['Views', 'Select a folder, then switch between Scrivenings (one flowing draft), Corkboard (index cards), and Outliner.'],
  ['Write', 'Use the format toolbar for headings, lists, quotes, and images; select text for bold/italic, comments, and footnotes.'],
  ['Research', 'Capture web pages or import PDFs/images in Sources, click one to read it beside your draft, then pull a quote into a footnote or citation.'],
  ['Revise', 'Turn on Suggesting for tracked changes; take Snapshots (with a diff) and recover deleted items from the Trash.'],
  ['Finish', 'Compile to DOCX, PDF, ePub, Markdown, or plain text — with presets for manuscripts, MLA/APA/Chicago, screenplay, and more.']
]

/** First-run welcome + an always-available shortcut/tips reference. */
export default function HelpDialog({ onClose }: Props): JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal help-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Welcome to Foolscap</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="help-body">
          <p className="muted">Everything you need to draft, organize, research, and ship long-form work.</p>

          <div className="help-cols">
            <section>
              <h3>Essentials</h3>
              <dl className="help-tips">
                {TIPS.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <h3>Keyboard</h3>
              <dl className="help-keys">
                {SHORTCUTS.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      <kbd>{v}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="muted help-foot">Open this anytime from the command palette (Ctrl/⌘ K) → “Help”.</p>
            </section>
          </div>
        </div>

        <div className="modal-foot">
          <button className="primary" onClick={onClose}>
            Start writing
          </button>
        </div>
      </div>
    </div>
  )
}
