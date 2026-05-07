# Changelog

All notable changes to clobmap are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/clobrate/clobmap/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/clobrate/clobmap/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/clobrate/clobmap/releases/tag/v0.1.0
