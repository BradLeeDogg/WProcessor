# WProcessor — Build Plan

A distraction-free, Scrivener-style long-form writing app for Windows (portable codebase).
Local-first, offline, no accounts. Your words are sacred; presentation is always a separate output step.

## Guiding invariants (never violate)

- **Canonical content = TipTap/ProseMirror JSON.** Lossless. Convert to other formats only at export.
- **Words are separated from presentation.** Manuscript look and every submission standard are *output presets*. Compile/export never mutates working documents.
- **Data safety is non-negotiable.** Project = a `.writeproject` folder. One file per document. Atomic writes (temp file + `rename`). Continuous autosave. Manual snapshots. Automatic timestamped zip backups.
- **No live pagination.** Continuous paper-width column while writing; true pagination only at compile/export.
- **Calm, quiet, keyboard-first, monochrome.** Light "paper" theme for writing; dark theme for composition mode.
- **App stays launchable and usable at the end of every milestone.**

## Architecture

```
src/
  main/        Electron main process: window/app lifecycle, IPC handlers, services
    services/  storage (project folder), db (sqlite), documents, snapshots, backups, templates
    ipc/       typed IPC channel handlers
  preload/     contextBridge — the only renderer<->main surface (no nodeIntegration)
  renderer/    React + TipTap UI (binder, editor, inspector, corkboard, outliner, compile)
  shared/      types shared across processes (BinderItem, ProjectMeta, IPC contracts)
```

Project folder on disk:

```
MyNovel.writeproject/
  project.db      SQLite: tree order, titles, synopses, metadata, labels, sources, claims, collections, settings
  documents/      one file per scene/document, named by UUID (TipTap JSON)
  assets/         images, portraits, attached PDFs
  research/        captured web snapshots
  snapshots/      manual version history
  backups/         automatic timestamped zips
```

## Tech decisions (and tradeoffs)

- **Electron over Tauri** — better-supported, the spec's lean; not worth toolchain wrangling.
- **better-sqlite3** — synchronous, fast, simplest correct model for a local single-user app. Native module: rebuilt against Electron via `@electron/rebuild`.
- **Pandoc not bundled** — ~150MB/platform + packaging cost. We use `mammoth`/`docx`/`epub-gen` and keep a converter seam to add Pandoc later if needed.
- **Storage layer is process-isolated** — all disk/db access lives in main; renderer talks only through a typed preload bridge. Keeps writing data away from renderer crashes.

---

## Milestones

### M0 — Scaffold & prove the loop  ✅
- [x] electron-vite + React + TS project; main/preload/renderer/shared separation
- [x] Typecheck + bundle build green
- [x] Window boots (headless xvfb smoke test)
- [x] better-sqlite3 rebuilt against Electron

### M1 — Phase 1: Core writing loop (MVP)
- [x] Storage services: project-as-folder create/open, SQLite schema, atomic file writes
- [x] Project launcher: create (from type template) / open / switch / close; recent projects
- [x] Type templates: novel, novella, short story, nonfiction book, journalism (short/long), dissertation
- [x] Binder tree: create, rename, delete, nest, drag-reorder (dnd-kit)
- [x] Editor: TipTap in centered paper column — **12pt Times New Roman, double-spaced, 1in margins, US Letter**
- [x] Autosave to disk (debounced, atomic) + reload on open
- [x] Live word count (per document + per selection)
- [x] Inline comments + footnotes/endnotes (custom nodes/marks)
- [x] Manual named snapshots with one-click rollback
- [x] Automatic timestamped folder backups (background)
- [x] End-to-end storage self-test (WP_SELFTEST) green in Electron runtime

### M2 — Phase 2: Structure & viewing modes  ✅
- [x] Scrivenings (stitched continuous editable view of a folder's children)
- [x] Full-screen composition mode (desktop-blacking, dark backdrop, optional typewriter scrolling)
- [x] Split view (resizable; either pane any document)
- [x] Writing targets & deadlines (project + session), progress feedback
- [x] Reusable DocumentEditor extracted (single / split / scrivenings / composition)
- Note: composition covers the active monitor; multi-monitor blackout deferred.

### M3 — Phase 3: Planning & organization  ✅
- [x] Corkboard (synopsis cards; drag reorders binder; color-coded status)
- [x] Outliner (TanStack Table: title/synopsis/word count/label/status; inline edit; reorder)
- [x] Folder view switch (Stitched / Corkboard / Outline)
- [x] Full-text search across project (label/status filters; on-demand scan)
- [x] Saved collections (dynamic, criteria-driven, cross-binder) — schema v2

### M4 — Phase 4: Metadata, research & journalism workflow
- [x] Inspector (synopsis, notes, label/status, custom metadata: POV/setting/characters) — schema v3
- [x] User-definable custom fields (text/number/select; seeded for fiction + features)
- [ ] Research capture (Readability + sanitize), PDFs/images/bios as assets
- [ ] Source linking + tracking; auto-generated Notes/References/Bibliography (toggle)
- [ ] Fact-check packet (claims tied to sources; verified/needs-sourcing/disputed; unsourced list; quote-vs-audio flags; export)

### M5 — Phase 5: Compile, Export & Import
- [ ] Compile tool (assemble in binder order; apply layout; non-destructive)
- [ ] Presets (editable): Shunn fiction, nonfiction proposal, journalism, dissertation/academic
- [ ] Export: PDF (Shunn), DOCX; then ePub (KDP)
- [ ] Import: DOCX (mammoth), Markdown, RTF; then Scrivener .scriv (best-effort, documented limits)

### M6+ — Later (explicitly out of v1)
- [ ] Screenplay/stage mode (Courier, Fountain underlying)
- [ ] Track changes (full editorial markup)
- [ ] Transcript workspace (quotes link to source+timestamp; feed fact-check)

---

## Decisions log
- 2026-06-16: Target Windows first (NSIS) per project title; codebase portable. Dev/verify on Linux.
- 2026-06-16: Pandoc not bundled; targeted libs + converter seam.
- 2026-06-16: Renderer has zero direct disk/db access; everything via typed preload IPC.
