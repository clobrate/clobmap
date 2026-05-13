# clobmap

[![CI](https://github.com/clobrate/clobmap/actions/workflows/ci.yml/badge.svg)](https://github.com/clobrate/clobmap/actions/workflows/ci.yml)

A minimalistic, cross-platform mind-mapping app where the **YAML view and the mind-map view are equally first-class**. Edit either; the other follows.

Built with **Tauri v2 + React + TypeScript**. Targets macOS, Windows, Linux, web, and (later) iOS / Android.

> **Status:** **v1.1.5** is published — install from https://github.com/clobrate/clobmap/releases/latest. Live at https://clobmap.com. The next release ships **per-node tags + a tag tree + hierarchy filter view + selection-driven highlight** (Phase 20 — see the Roadmap below). 1.1.5 ships the first-launch **Wedding planning** seed in canonical auto layout (no `layoutMode` key, no per-node `position` blocks) so fresh installs see the current measurement-driven tidy-tree spacing instead of positions hand-placed against the pre-1.1.2 layout constants. 1.1.4 replaces "Markdown outline" with **All notes (Markdown)** under File → Export — one `# Node title (id)` heading per node followed by that node's long-form notes body, with `__ no notes found __` placeholders so the document covers the whole tree, and ATX headings inside each note demoted by one `#` so they nest under the per-node heading. Filename uses a `<doc>.notes.YYYYMMDDHHmm.md` pattern so successive exports don't clobber each other. Internally the e2e test suite grew by 50+ Playwright tests across the previously-manual surfaces (notes popup, tabs, layout-mode drag, perf, file menu, boot, rapid-rename stress) and unit-test coverage hit 100% on `model/ops.ts`, `lib/navigation.ts`, and `store/document.ts`. 1.1.3 added a "Reset to Auto (clear saved positions)" button under ⚙ → Layout that wipes every stored `position` field and flips the document back to canonical auto in one click — useful when a manual session has gone sideways and you want a true clean slate. Switching to Manual afterward also now snapshots the current measurement-driven render so the visual no longer jumps to a wide cap-sized layout. 1.1.2 shipped canvas-feel improvements (Ctrl/Cmd-drag to translate a whole subtree, normal drag freezes implicit-position children, symmetric north/south sibling distribution, measurement-driven layout for tight visible gaps, ROW_GAP=10 / COLUMN_GAP=50). 1.1.1 fixed a draft-restore bug on the web build (unsaved YAML now survives reload, including a second reload). 1.1 adds variable-size text nodes (word-wrap + max-width / max-height), running notes per node (Markdown popup with edit/preview toggle, auto-save, font zoom, sidecar `.md` files on desktop), free-form / manual layout (drag nodes anywhere, auto-switches from auto on first drag, per-doc layout mode, manual positions preserved across mode toggles), per-edge connector position (drag the endpoint dots to any of the 4 sides on either node, each child configurable independently), and arrow markers for direction. Exports to PNG / SVG / PDF / Markdown.

---

## What it does today

- Edit a mind map as **YAML** (CodeMirror 6, syntax highlighting, inline parse errors).
- View / edit the same map as a **horizontal tree** (React Flow + Dagre layout).
- Toggle between **YAML / Split / Mind-map** in the header (or `Cmd/Ctrl + /`); split shows both panes side-by-side.
- Edits in either view propagate to the other; selecting a node in the canvas jumps the YAML cursor to its line.
- YAML comments and field ordering survive structural edits made from the canvas.
- Open / save mind maps as `.clobmap.yaml` files (plain `.yaml` / `.yml` also opens); recent files persist across launches; external edits are detected and reloaded.
- **Auto-save** (toggle in the ⚙ menu): when on and the YAML parses cleanly, edits flush to disk after a short pause.
- **Split orientation:** side-by-side (default) or stacked, switchable from the ⚙ menu — preference persists across launches.
- **Theme:** system / light / dark, follows OS by default; **font size:** slider in ⚙ menu (10–24 px); both persist across launches.
- **Keyboard-only operable:** arrow keys navigate the canvas (Up/Down siblings, Right child, Left parent); the tree is announced to screen readers via ARIA `role="tree"` / `treeitem`.
- **Tags** (Phase 20): attach free-form tag names to any data-node, organize them in a separate **tag tree** below the canvas (drag-to-reparent, rename, delete cascades globally), filter the canvas to one tag's hierarchy, and click a tag to fill matching data-nodes with a highlight color. See the Mind-map shortcuts table for `T` and details.
- Runs **as a web app** too — `npm run build:web` outputs a static `dist-web/`. Save uses the File System Access API on Chromium and falls back to download elsewhere; Tauri-only features (file watcher, native dialogs) downgrade gracefully.

---

## Run it

### Prerequisites

- **Node.js** ≥ 20 — for the frontend toolchain.
- **Rust** (stable) — for the Tauri runtime. Install via:
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **Xcode Command Line Tools** (macOS) — for the system linker.

### Dev (hot-reload)

```bash
npm install
npm run tauri dev
```

A native window opens with the editor. Edit `src/**/*.tsx` and the running app hot-reloads.

### Production build (desktop)

```bash
npm run tauri build
```

Bundles land at:

- `src-tauri/target/release/bundle/macos/clobmap.app`
- `src-tauri/target/release/bundle/dmg/clobmap_*.dmg`

### Production build (web)

```bash
npm run build:web        # outputs dist-web/
npm run preview:web      # serve it locally on http://localhost:4173
```

`dist-web/` is a static SPA bundle — drop it on any static host. The repo includes a `_redirects` (SPA fallback) and `_headers` (cache + security) file that Cloudflare Pages, Netlify, and similar hosts pick up automatically.

**Deploying to clobmap.com via Cloudflare Pages:**

1. Push the repo to GitHub.
2. In Cloudflare → Pages → Create project → connect the repo.
3. Build command: `npm run build:web` · Output directory: `dist-web` · Node version: 20.
4. Add `clobmap.com` as a custom domain. Cloudflare will ask you to point DNS — easiest is to change the DreamHost nameservers to Cloudflare's (Cloudflare runs DNS, DreamHost remains the registrar).
5. Add `www.clobmap.com` as a redirect to apex.
6. Every push to `main` redeploys; every PR gets a `*.pages.dev` preview.

---

## Use it

The app starts with a sample mind map. Use the **YAML / Split / Mind-map** toggle in the header (or `Cmd/Ctrl + /`) to switch views.

**App-wide shortcuts**

| Action                               | Shortcut               |
| ------------------------------------ | ---------------------- |
| Cycle view (YAML → Split → Mind-map) | `Cmd/Ctrl + /`         |
| New file                             | `Cmd/Ctrl + N`         |
| New tab (desktop)                    | `Cmd/Ctrl + T`         |
| Close tab (desktop)                  | `Cmd/Ctrl + W`         |
| Open file…                           | `Cmd/Ctrl + O`         |
| Save                                 | `Cmd/Ctrl + S`         |
| Save As…                             | `Cmd/Ctrl + Shift + S` |

The header **File** menu mirrors these and lists up to 10 recently opened files.

The window title shows `● <filename> — clobmap` while there are unsaved changes; closing the window prompts before discarding them. If the open file is modified externally (e.g. via `vim`) the app reloads it; if you have unsaved edits, it asks first.

### YAML view

A standard text editor with YAML syntax highlighting.

| Action          | Shortcut                                |
| --------------- | --------------------------------------- |
| Undo / redo     | `Cmd/Ctrl + Z` / `Cmd/Ctrl + Shift + Z` |
| Indent / dedent | `Tab` / `Shift + Tab`                   |

When a node is selected in the mind-map and you switch to YAML or Split, the editor's cursor jumps to that node's line.

The status bar at the bottom shows `Valid` / `Invalid: line N — message` and a dirty indicator.
Invalid YAML keeps the **last valid mind-map** rendered — your work isn't lost while you're mid-edit.

### Mind-map view

| Action                           | Shortcut                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Select a node                    | Click                                                                        |
| Clear selection                  | Click background                                                             |
| Add a child                      | `Tab` (auto-renames; canvas pans to keep the new node in view)               |
| Add a sibling                    | `Enter` (auto-renames; canvas pans to keep the new node in view)             |
| Rename inline                    | `F2` or double-click                                                         |
| Delete                           | `Delete` / `Backspace` (root is protected)                                   |
| Collapse / expand                | `Space`, or click the `▸/▾` chevron on the node                              |
| Move selection — sibling         | `↑` / `↓`                                                                    |
| Move selection — into children   | `→` (auto-expands collapsed nodes)                                           |
| Move selection — to parent       | `←`                                                                          |
| Reparent (drag)                  | Drag a node onto another (illegal drops snap back)                           |
| Move subtree (drag with modifier)| Hold `Ctrl` / `Cmd` while dragging — the whole subtree translates with the parent (manual layout) |
| Reparent (cut/paste, long range) | `Cmd/Ctrl + X` on source, select target, `Cmd/Ctrl + V`                      |
| Context menu                     | Right-click — Rename, Edit notes…, Edit tags…, Set color, Add/Duplicate, Cut/Paste, Delete |
| Open long-form notes popup       | `N` on a selected node                                                       |
| Open tag editor                  | `T` on a selected node — autocomplete against existing tag names             |
| Fit to view                      | `Cmd/Ctrl + 0`                                                               |
| Undo / redo                      | `Cmd/Ctrl + Z` / `Cmd/Ctrl + Shift + Z` (or `Cmd/Ctrl + Y`)                  |
| Cancel edit / clear clipboard    | `Esc`                                                                        |

Mind-map mutations preserve YAML comments and field ordering wherever possible (via in-place AST surgery, not full re-serialization).

### Tags & tag tree

Adding the first tag to any data-node (via `T` or right-click → **Edit tags…**) materializes a **tag tree** below the canvas. The pane stays hidden when the document has no tags; once it appears, the header gains a **Hide tags / Show tags** toggle.

| Action                              | Where                                            |
| ----------------------------------- | ------------------------------------------------ |
| Add tags to a data-node             | `T` on a selected node, or right-click → Edit tags… |
| Remove a tag from a data-node       | `×` on its chip in the tag editor                |
| Reparent a tag                      | Drag a tag-node onto another in the tag tree    |
| Rename a tag                        | Double-click in the tag tree, or `F2` when selected — propagates to every data-node carrying that name |
| Delete a tag                        | Right-click → Delete tag, or `Delete` when selected — cascades global removal across all data-nodes |
| Filter the canvas to a tag's hierarchy | Right-click → "Show nodes under this tag's hierarchy" — read-only filter view, reset via the **Reset filter** chrome button |
| Highlight matching data-nodes       | Click a tag-node — every matching data-node fills with an amber background; clicking another tag replaces, clicking empty space or a data-node clears |

Tag identity is matched **case-insensitively** but display preserves the casing you typed. A node tagged with multiple tags appears once per matching tag in the filter view (intentional duplication). The **"Untagged"** pseudo-bucket in the filter view collects every data-node with no tags. Tag highlight is ephemeral UI state — never persisted to YAML.

---

## File extension

Mind maps are saved as **`.clobmap.yaml`**:

- The trailing `.yaml` keeps every YAML-aware tool happy — vim, VS Code, GitHub, `git diff`, and other editors apply YAML syntax highlighting automatically.
- The `.clobmap.yaml` compound suffix lets the OS register clobmap as the handler for _just_ mind-map files (registered in the installer in Phase 10) without hijacking every `.yaml` file on your machine.
- Plain `.yaml` / `.yml` files still open — the format is unchanged, only the recommended filename differs.

## YAML format

```yaml
title: My mind map
version: 2
root:
  id: n1
  text: Central idea
  children:
    - id: n2
      text: Branch A
      tags:
        - urgent
        - logistics
      children:
        - id: n3
          text: Leaf
          children: []
    - id: n4
      text: Branch B
      color: "#3b82f6"
      collapsed: false
      children: []
tagRoot:
  id: t1
  name: tags
  children:
    - id: t2
      name: urgent
      children: []
    - id: t3
      name: logistics
      children: []
```

| Field on a node | Required              | Notes                                                                  |
| --------------- | --------------------- | ---------------------------------------------------------------------- |
| `id`            | yes                   | Stable identity. Auto-generated as `n` + base36 counter for new nodes. |
| `text`          | yes                   | The label shown on the node.                                           |
| `children`      | no (defaults to `[]`) | Array of child nodes.                                                  |
| `tags`          | no                    | Free-form string list of tags attached to this node. Block list form; empty / absent are equivalent. Matched case-insensitively against the tag tree. |
| `color`         | no                    | Hex string used as the node's border color.                            |
| `collapsed`     | no                    | When `true`, descendants are hidden in the mind-map view.              |
| `notes`         | no                    | Long-form Markdown notes (or a path to a sidecar `.md`).               |
| `maxWidth` / `maxHeight` | no           | Per-node overrides of the default node-size caps.                      |
| `position`      | no                    | `{x, y}` in canvas coords — only meaningful in manual layout mode.     |
| `edgeFrom` / `edgeTo` | no              | Which side each side's incoming/outgoing edge attaches to.             |

Top-level fields:

- `title` (required) — document title
- `root` (required) — the single root node
- `version` (optional) — schema version, currently `2` (bumped from `1` when tags shipped; older docs still parse cleanly)
- `layoutMode` (optional) — `"auto"` (default, runs tidy-tree) or `"manual"` (honors stored `position` fields)
- `tagRoot` (optional) — root of the tag tree, only present once the user adds at least one tag

---

## Project layout

```
clobmap/
├── src/                      # React frontend (TypeScript)
│   ├── components/           # YamlEditor, MindMap, MindMapNode, NotesPopup, TagEditor, TagTreePane, TagMapNode, TagContextMenu, FilterCanvas, ViewToggle, FileMenu, ...
│   ├── lib/                  # layout (data tree), tagLayout, tagFilter, tags helper, storage adapter, recentFiles, file actions
│   ├── model/                # YAML serde, tree ops (data + tag), diff, AST apply (95% test coverage)
│   ├── store/                # Zustand stores (document, ui — incl. tag tree state + filter state) + parse hook
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                # Rust backend (Tauri commands, plugins)
├── docs/getting-started.md   # End-user 5-minute tour
├── design.md                 # Architecture and product spec (early)
├── ARCHITECTURE.md           # How the codebase fits together (current)
├── CONTRIBUTING.md           # PR workflow + repo conventions
├── CHANGELOG.md              # Per-release user-facing notes
├── implementation-plan.md    # Phased plan with exit criteria
├── brainstorming.md          # Early decision notes (Flutter vs Tauri, etc.)
└── README.md                 # You are here
```

---

## Scripts

```bash
npm run dev              # Vite dev server (web only, no Tauri)
npm run tauri dev        # Native window with hot reload
npm run build            # Frontend production build → dist/ (Tauri input)
npm run build:web        # Static SPA bundle → dist-web/ (web hosts)
npm run preview:web      # Serve dist-web/ on localhost:4173
npm run tauri build      # Full native bundle (slow first time)
npm run test             # Vitest run
npm run test:watch       # Vitest watch mode
npm run test:coverage    # Coverage report (gates ≥90%)
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm run format           # Prettier write
npm run format:check     # Prettier check
```

---

## Roadmap

Implementation plan in [`implementation-plan.md`](./implementation-plan.md). One phase = one logically-complete release with hard exit criteria. ✅ = shipped.

| Phase | Status | What it adds                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | ✅     | Tauri + React + TS scaffold; lint, format, typecheck, ping IPC                                                                                                                                                                                                                                                                                                              |
| 1     | ✅     | Pure-TS data model: YAML parse/serialize, tree ops, diff, comment-preserving AST apply                                                                                                                                                                                                                                                                                      |
| 2     | ✅     | YAML editor view with live parsing, inline error markers, status bar                                                                                                                                                                                                                                                                                                        |
| 3     | ✅     | Read-only mind-map view (React Flow + Dagre, view toggle in header)                                                                                                                                                                                                                                                                                                         |
| 4     | ✅     | Mind-map editing — selection, keyboard ops, inline rename, drag-to-reparent, context menu, undo/redo, collapse                                                                                                                                                                                                                                                              |
| 5     | ✅     | Bidirectional toggle (`Cmd/Ctrl+/`), split view, external-edit sync into CodeMirror, selection-to-line cursor jump, 100-iteration round-trip property test                                                                                                                                                                                                                  |
| 6     | ✅     | File I/O — open/save/save-as, recent files (persisted), file watcher with reload prompt, window title sync, close confirmation on unsaved changes                                                                                                                                                                                                                           |
| 6.5   | ✅     | UX improvements — context menu polish (edit note, color, duplicate), cut/paste subtrees, click-to-collapse chevron, horizontal/vertical split, auto-save toggle, fixed context-menu position in split mode                                                                                                                                                                  |
| 7     | ✅     | Web build live at https://clobmap.com — Cloudflare Pages, auto-deploy from `main`, www→apex 301, TLS auto-issued. Platform-aware storage (FSA + input/download fallback) and settings (localStorage on web, plugin-store on desktop).                                                                                                                                       |
| 8     | ✅     | UI polish + a11y — light/dark/system theme, font-size slider, arrow-key tree navigation, ARIA `role=tree`/`treeitem`, aria-live announcements, visible focus rings, i18n strings module. Onboarding overlay + window-state persistence deferred.                                                                                                                            |
| 9     | ✅     | Desktop auto-update — `tauri-plugin-updater` wired in, scheduled 24h check + manual "Check for updates" in ⚙ menu, signed-update verification, in-app Install & Relaunch banner, release runbook in `RELEASING.md`. CI automation lands in Phase 11.                                                                                                                        |
| 10    | ✅     | macOS scope: signing + notarization config (env-driven), `.clobmap.yaml` file association across all platforms, single-instance plugin so OS-driven file opens land in the running app, larger 1100×720 default window. Windows + Linux build unsigned; Windows code-signing deferred until cert (Azure Trusted Signing recommended).                                       |
| 11    | ✅     | CI/CD — `.github/workflows/ci.yml` (lint/typecheck/test/coverage gate/web build on every PR + main) and `.github/workflows/release.yml` (matrix-builds + signs + notarizes + assembles `latest.json` + promotes draft on tag push). `npm run version:bump` keeps `package.json` / `Cargo.toml` / `tauri.conf.json` versions in lock-step.                                   |
| 12    | ✅     | **Observability — React `ErrorBoundary` with reload/report-on-GitHub recovery flow, `tauri-plugin-log` rotating file logs (max ~10 MB) reachable via ⚙ → "Open log folder", opt-in Sentry crash reports (off by default, gated by `VITE_SENTRY_DSN` build-time env var), "Report an issue" link with pre-filled GitHub issue. No telemetry without explicit user consent.** |
| 12.1  | ✅     | **0.1.1 UX polish — auto-pan to keep newly-created nodes in view, hardened InlineRename focus on new-node creation (multi-frame retry), duplicated nodes enter edit mode immediately, default initial view set to Mind-map.**                                                                                                                                              |
| 13    | ✅     | **iOS via Tauri v2** — long-press menu, soft-keyboard handling, zoom preservation across orientation changes, arrow-key navigation hardened. Android deferred.                                                                                                                                                                                                              |
| 14    | ✅     | **Production hardening** — security review, perf passes (tidy-tree replaced Dagre, ~960× speedup on 5000 nodes), docs, license.                                                                                                                                                                                                                                              |
| 15    | ✅     | **1.0.0 launch** — published to GitHub Releases (signed + notarized macOS, signed updater on all platforms), landing page at https://clobmap.com via Cloudflare Pages, exports to PNG / SVG / PDF / Markdown.                                                                                                                                                                |
| 16    | ✅     | **1.1.0** — Block A: variable-size text nodes (word-wrap, multi-line via Shift+Enter, per-node maxWidth/maxHeight). Block B: running notes per node (Markdown popup, edit/preview toggle, auto-save, font zoom, sidecar .md files on desktop). Block C: free-form layout (per-doc layoutMode, drag-to-reposition, auto-switch from Auto to Manual on first drag, manual positions preserved across mode toggles, per-edge connector position via drag-and-drop endpoint dots, arrow markers on edges).|
| 17    | ✅     | **1.1.1** — fix(web): unsaved YAML draft survives reload (and a second reload). Two-stage race fixed in App.tsx (bootstrap-completion gate + tighter clearDraft condition). Test infra landed alongside: Playwright web E2E (42 specs × 3 engines), RTL component tests for NotesPopup, and CI gating.                                                                       |
| 18    | ✅     | **1.1.2** — Ctrl/Cmd-drag translates a whole subtree (delta applied to dragged node + every descendant). Plain drag no longer pulls implicit-position children with the parent: `onNodeDragStart` snapshots every visible node and `onNodeDragStop` writes the snapshot back, freezing siblings in place. New no-position siblings spread symmetrically (north + south) around the parent instead of stacking south. Layout uses React Flow's measured node sizes for slot allocation while keeping the user-set `maxWidth` / `maxHeight` as the CSS display cap, so visible gaps shrink to ROW_GAP without clipping text. Tightened defaults: ROW_GAP=10, COLUMN_GAP=50.|
| 19    | ✅     | **1.1.3** — "Reset to Auto (clear saved positions)" button under ⚙ → Layout: one click wipes every stored `position` field AND removes `layoutMode` from the YAML, leaving a clean canonical-auto doc with no memory of prior manual coords. Auto → Manual toggle now snapshots React Flow's measurement-driven rendered positions instead of re-running auto-layout with cap-sized slots, so the visual no longer jumps to a wide layout. Removed the older "Reset positions" button (redundant — same end state via "Reset to Auto" + toggle Manual).|
| 20    | ✅     | **Tags** (per [`tagging-design-doc.md`](./tagging-design-doc.md)) — five-phase rollout. **A:** model + YAML (per-node `tags: string[]`, `tagRoot` block, `SCHEMA_VERSION` bumped 1→2, `tagsAdd`/`tagsRemove`/`tagDelete` ops). **B:** per-node tag editor (`T` shortcut, right-click → Edit tags…, comma-batch input, removable chips). **C:** tag-tree pane (auto-shown when ≥1 tag, vertical split below the canvas, drag-to-reparent via `moveTagNode`, inline rename with linked-rename cascade across data-node `tags[]`, `Delete`/right-click delete cascades globally). **D:** hierarchy filter view (right-click → "Show nodes under this tag's hierarchy" — replaces canvas with a read-only tree rooted at the selected tag + descendants + an "Untagged" bucket; Reset filter chrome button to exit). **E:** polish (autocomplete in the tag editor with case-only-difference badge, F2/Delete tag-tree shortcuts, aria-live announcement on filter-view enter/exit). **Highlight extension:** clicking a tag-node in the pane auto-fills every matching data-node with an amber background; selection drives highlight. 387 unit tests + 378 e2e tests across chromium/firefox/webkit. |

---

## Tech stack

- **Tauri v2** — desktop + mobile shell. Native webview, ~10 MB bundle.
- **React 19** + **TypeScript** (strict mode).
- **Vite** — frontend build.
- **Tailwind CSS v4** — styling.
- **CodeMirror 6** — YAML editor.
- **@xyflow/react (React Flow v12)** + **@dagrejs/dagre** — mind-map canvas and layout.
- **yaml** — serde with full Document AST for comment preservation.
- **Zustand** — state.
- **Vitest** + **@vitest/coverage-v8** — tests + coverage gate.

---

## Privacy

clobmap is local-first: your mind maps stay on your disk (or in your browser), nothing is sent to a server we run. The only network calls clobmap makes are loading the web app from `clobmap.com` (Cloudflare logs apply) and the desktop app's update check against GitHub Releases. Full notice in [`PRIVACY.md`](./PRIVACY.md), also linked from the in-app ⚙ menu.

## License

GPL-3.0 — see [`LICENSE`](./LICENSE).

## Contributing / dev notes

- Don't commit secrets, build artifacts, or `node_modules` — `.gitignore` covers the standard set.
- Phase commits land on `main`. Run `lint`, `typecheck`, `test`, and `build` before committing.
- Coverage on `src/model/` is gated at 90% (lines/branches/functions/statements).
- Keep this README current — every shipped phase updates the [Roadmap](#roadmap) and any user-facing behavior tables above.
