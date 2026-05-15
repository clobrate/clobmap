# Changelog

All notable changes to clobmap are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.1] - 2026-05-15

### Changed

- **Auto-save on by default.** New installs start with auto-save
  enabled. It only writes to disk once the document has a file path
  and the YAML parses cleanly — untitled or invalid documents are
  silently skipped.
- **Status bar surfaces the no-filename case.** When auto-save is on
  but the document has never been saved, the bottom status bar shows
  "Autosave needs file name — please use Save As" so users know why
  their edits aren't being persisted.

## [1.2.0] - 2026-05-13

### Added — Tags feature (Phase 20)

- **Per-node tags.** Every data-node can carry a free-form list of tag
  names via `tags: ["a", "b"]` in YAML (block-list form, not comma-
  separated). Tag matching is case-insensitive; the user-typed casing
  is preserved per data-node. A small tag-shaped icon appears on
  every node that carries at least one tag (parallel to the existing
  notes icon).
- **Tag editor.** Open via `T` on a selected node or right-click →
  **Edit tags…**. Comma-separated batches, removable chips,
  autocomplete against existing tag-tree entries (suggestion list
  filtered case-insensitively by the input fragment after the last
  comma; arrow keys to navigate; Tab / → to accept without
  committing; Enter accepts-and-commits). A **case differs** badge
  appears when typing would reuse an existing tag with different
  casing — clicking the suggestion adopts the existing casing.
- **Tag tree** stored under a new top-level `tagRoot` block in YAML.
  Materialized lazily on the first `tagsAdd` and rendered as a
  second React Flow surface below the data canvas (vertical split,
  resizable). The pane is hidden entirely when the document has no
  tags. Header chrome: a **Hide tags / Show tags** toggle (only
  visible when the document has tags).
- **Tag-tree editing.** Drag a tag-node onto another to re-parent.
  Double-click or `F2` opens inline rename — renames cascade through
  every data-node's `tags[]` so chips don't go stale. `Delete` /
  right-click → **Delete tag** cascades globally: the tag (and its
  descendants in the tag tree) is removed AND every matching name
  is stripped from every data-node in one atomic undo step.
- **Hierarchy filter view.** Right-click a tag → **Show nodes under
  this tag's hierarchy** swaps the canvas for a read-only tree rooted
  at that tag, with each descendant tag-node carrying the matching
  data-nodes as its children. A data-node appearing under multiple
  tags is rendered once per tag (intentional duplication). An
  **Untagged** pseudo-bucket lists data-nodes with no tags. **Reset
  filter** button in the header returns to the data canvas.
- **Tag highlight fill.** Clicking a tag-node in the pane fills
  every matching data-node with an amber background — selection
  drives highlight automatically (no menu step). Clicking another
  tag replaces; clicking empty pane / a data-node clears. Composes
  cleanly with the existing per-node border `color` (border stays
  untouched). Ephemeral UI state, never persisted to YAML.
- **Accessibility.** `aria-live` announcement on filter-view enter
  and exit; tag-tree pane is `role="tree"` with `role="treeitem"`
  entries; tag editor input has `role="listbox"` + `aria-selected`
  on suggestions.
- **Schema version** bumped to `2`. Older clobmap builds parse v2
  docs that don't yet carry `tags` / `tagRoot` cleanly; once a v2
  build *saves* a doc with tag data, opening it in a build older
  than this release will reject the unknown fields. Tag data
  round-trips deterministically — YAML comments and field ordering
  for unrelated fields are preserved.

### Tests
- 387 unit tests pass (model ops, YAML round-trip, layout, UI
  store, filter tree, tag layout, autocomplete behavior, store
  setters).
- 378 e2e tests pass across chromium / firefox / webkit covering
  tag editor flow, tag-tree drag/rename/delete, filter view
  enter/reset, selection-driven highlight, autocomplete, polish
  (F2 / Delete tag-tree keyboard shortcuts).

## [1.1.5] - 2026-05-09

### Changed
- The first-launch **Wedding planning** seed now ships in canonical
  auto layout (no `layoutMode` key, no per-node `position` blocks).
  Previously the seed carried positions hand-placed against the
  pre-1.1.2 layout constants, so first-launch users saw the older,
  looser spacing instead of the current measurement-driven tidy-tree
  (ROW_GAP=10, COLUMN_GAP=50). Returning users with an existing
  draft are unaffected — only fresh installs / cleared localStorage
  see the new defaults.

## [1.1.4] - 2026-05-09

### Changed
- **File → Export → "All notes (Markdown)"** replaces the prior
  "Markdown outline" item. Output is one `# Node Title (node-id)`
  heading per node followed by that node's long-form notes body.
  Nodes without notes show `__ no notes found __` so the document
  covers the whole tree. Filename is `<doc>.notes.YYYYMMDDHHmm.md`.
  ATX headings inside each note are demoted by one `#` (skipping
  fenced code blocks) so they nest under the per-node heading.

### Internal
- 50+ new Playwright e2e tests covering manual-guide §1 (welcome
  banner), §2 (file menu basics), §3 (tabs), §4 (Cmd+0 / drag-reparent
  / cut-paste), §5.6 (rapid-rename stress), §6 (notes popup), §7
  (all-notes export), §9.5 (canvas → YAML cursor sync), §14 (50-node
  perf budget), §16.2/16.3/16.4/16.6 (manual-mode drag, persistence,
  auto-mode regression).
- Unit-test coverage to 100% on `model/ops.ts`, `lib/navigation.ts`,
  `store/document.ts`; >98% on `lib/layout.ts`.

## [1.0.0] - 2026-05-08

First stable release. Semver commitment to backwards compatibility on the
.clobmap.yaml file format and the desktop / web / iOS keyboard surface.

iOS App Store distribution is explicitly deferred to v1.1; the side-load
.ipa pipeline shipped in 0.2.0 stays as the iOS install path until then.

### Added
- **Export menu** in File: PNG (raster, retina), SVG (vector), PDF
  (single page sized to the map's aspect ratio), and Markdown
  outline. Image exports render the entire map regardless of the
  current viewport — a brief fitView is used to force all nodes
  into the DOM, then the image is captured at 2048 px wide via
  `html-to-image`. PDF wraps the same PNG in a one-page jsPDF.
  Both heavy deps (jspdf, html-to-image) are lazy-loaded so they
  don't ship in the main bundle.
- **Landing page** at `clobmap.com/`. Static one-pager (no JS) with
  tagline, dual-view illustration, four feature cards, and download
  links. The SPA editor moved to `clobmap.com/app/`.

### Fixed
- `fs:allow-write-file` capability granted so binary export
  (PNG / PDF / SVG) actually lands on disk. Same `path: "**"` scope
  as the existing `fs:allow-write-text-file` rule — user-driven save
  via plugin-dialog so the path can't be pre-declared.

## [0.2.0] - 2026-05-07

### Added
- **iOS app** (Phase 13). Boots in iPhone simulator and on physical
  devices. Long-press a node opens the context menu. Soft keyboard auto-pops
  when entering edit mode. Save As writes to iCloud Drive / Files.app via
  the system document picker. Self-contained `.ipa` build available via
  `npm run tauri ios build --debug --target aarch64 --export-method debugging`.
- **Tabs** — multiple documents in one window on desktop. `Cmd/Ctrl+T` to
  open a tab, `Cmd/Ctrl+W` to close, click to switch. Each tab keeps its
  own undo/redo history. Tabs are hidden on mobile (single-doc UX preserved).
- **New file** command — `Cmd/Ctrl+N` and a File-menu entry. On desktop
  spawns a new tab; on mobile resets the active doc in place.
- **Welcome banner** for first-time users — one-line explainer above the
  canvas, dismisses on × or first edit, never returns.
- **iOS-specific configuration** — `tauri.ios.conf.json` overrides the
  bundle identifier to `com.clobmap.ios` (separate from the desktop
  `com.clobmap.desktop`).

### Changed
- First-paint seed document is now a wedding-planning skeleton instead of
  the abstract "Welcome / Shortcuts" demo — concrete branchy example
  teaches what a mind map is by example, no glossary required. (Usability
  test feedback.)
- iOS save behavior: `Save` reroutes to `Save As` (re-picks destination
  every time) since iOS UIDocumentPicker URLs are only writable inside
  their original picker scope. Auto-save is hidden in Settings on iOS for
  the same reason. Persistent edit access via security-scoped bookmarks
  is on the roadmap.

### Documentation
- Phase 14c: `CONTRIBUTING.md`, `ARCHITECTURE.md`, and
  `docs/getting-started.md` added. README's project-layout section
  links them.

### Performance
- Phase 14b: replaced Dagre with an O(N) tidy-tree layout — clobmap only
  ever renders trees, so a general-purpose graph layout was overkill.
  **5000-node layout: 1150 ms → 1.2 ms (~960x).** Single edit cycle
  (mutate + AST apply + re-serialize) at 26 ms, well under the <50 ms
  exit criterion.
- React Flow `onlyRenderVisibleElements` enabled — DOM node count stays
  bounded by viewport regardless of document size.
- Split the React Flow sync effect: selection changes no longer rebuild
  the entire node array (matters at 1k+ nodes).
- Dropped `@dagrejs/dagre` dependency.
- Added `scripts/gen-large-doc.mjs` (test-data generator) and an opt-in
  `PERF=1` Vitest run for repeatable model-layer timings.

### Security
  `cargo audit` 0 vulnerabilities (572 deps; 17 unmaintained-warnings,
  all transitive Tauri/wry GTK3 bindings on Linux). Tauri capabilities
  reviewed — `fs:allow-*` wildcards justified by user-driven file
  open/save; all other permissions narrowly scoped. IPC commands
  (`ping`, `pending_open_path`, `open_log_folder`) have zero
  attacker-controlled input.

## [0.1.1] - 2026-05-06

### Added
- New nodes auto-pan into view when created off-screen (Tab/Enter no
  longer leaves the new node hidden).
- Newly-duplicated nodes enter edit mode immediately.

### Changed
- Default initial view is now Mind-map (was Split).
- Desktop: window state (size, position, maximized) persists across
  launches; the file you had open last time auto-reopens.
- Tighter seed document; empty-doc keyboard hint added.

### Fixed
- InlineRename focus on new-node creation is now reliable across React
  Flow's settle window (multi-frame focus retry).

## [0.1.0] - 2026-05-06

Initial public release. Highlights:

- YAML view + Mind-map view of the same document, edit either; the other
  follows. AST-preserving sync (comments + field order survive structural
  edits from the canvas).
- macOS, Windows, Linux desktop installers via GitHub Actions matrix
  build. macOS signed + notarized. Windows + Linux unsigned.
- Auto-update via signed `latest.json` against GitHub Releases.
- Web build at https://clobmap.com (Cloudflare Pages, auto-deploy from
  `main`).
- Light / dark / system theme. Font-size slider. Arrow-key tree
  navigation. ARIA `role="tree"` / `treeitem`. Aria-live announcements.
- Keyboard-first interactions: Tab to add child, Enter to add sibling,
  F2 to rename, Space to collapse/expand, Cmd+0 to fit view.
- File I/O — open / save / save-as `.clobmap.yaml`, plain `.yaml` / `.yml`
  also works. Recent files. File watcher with reload prompt.
- Auto-save toggle.
- Cut/paste subtrees (long-range reparent), drag-to-reparent,
  context-menu Edit Note / Set Color / Duplicate / Delete.
- Opt-in Sentry crash reports with privacy scrubbing (off by default,
  build-time DSN required).
- React error boundary with reload + report-on-GitHub recovery flow.
- Rotating local logs on desktop (~10 MB cap, "Open log folder" in ⚙).
- 139 tests; coverage gate ≥90% on `src/model/`.

## License

GPL-3.0 — see [LICENSE](./LICENSE).

[Unreleased]: https://github.com/clobrate/clobmap/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/clobrate/clobmap/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/clobrate/clobmap/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/clobrate/clobmap/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/clobrate/clobmap/releases/tag/v0.1.0
