# clobmap

[![CI](https://github.com/clobrate/clobmap/actions/workflows/ci.yml/badge.svg)](https://github.com/clobrate/clobmap/actions/workflows/ci.yml)

A minimalistic, cross-platform mind-mapping app where the **YAML view and the mind-map view are equally first-class**. Edit either; the other follows.

Built with **Tauri v2 + React + TypeScript**. Targets macOS, Windows, Linux, web, and (later) iOS / Android.

> **Status:** **v1.1.1** is published — install from https://github.com/clobrate/clobmap/releases/latest. Live at https://clobmap.com. 1.1.1 fixes a draft-restore bug on the web build (unsaved YAML now survives reload, including a second reload). 1.1 adds variable-size text nodes (word-wrap + max-width / max-height), running notes per node (Markdown popup with edit/preview toggle, auto-save, font zoom, sidecar `.md` files on desktop), free-form / manual layout (drag nodes anywhere, auto-switches from auto on first drag, per-doc layout mode, manual positions preserved across mode toggles), per-edge connector position (drag the endpoint dots to any of the 4 sides on either node, each child configurable independently), and arrow markers for direction. Exports to PNG / SVG / PDF / Markdown.

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
| Context menu                     | Right-click — Rename, Edit note, Set color, Add/Duplicate, Cut/Paste, Delete |
| Fit to view                      | `Cmd/Ctrl + 0`                                                               |
| Undo / redo                      | `Cmd/Ctrl + Z` / `Cmd/Ctrl + Shift + Z` (or `Cmd/Ctrl + Y`)                  |
| Cancel edit / clear clipboard    | `Esc`                                                                        |

Mind-map mutations preserve YAML comments and field ordering wherever possible (via in-place AST surgery, not full re-serialization).

---

## File extension

Mind maps are saved as **`.clobmap.yaml`**:

- The trailing `.yaml` keeps every YAML-aware tool happy — vim, VS Code, GitHub, `git diff`, and other editors apply YAML syntax highlighting automatically.
- The `.clobmap.yaml` compound suffix lets the OS register clobmap as the handler for _just_ mind-map files (registered in the installer in Phase 10) without hijacking every `.yaml` file on your machine.
- Plain `.yaml` / `.yml` files still open — the format is unchanged, only the recommended filename differs.

## YAML format

```yaml
title: My mind map
version: 1
root:
  id: n1
  text: Central idea
  children:
    - id: n2
      text: Branch A
      children:
        - id: n3
          text: Leaf
          children: []
    - id: n4
      text: Branch B
      note: An optional longer description
      color: "#3b82f6"
      collapsed: false
      children: []
```

| Field on a node | Required              | Notes                                                                  |
| --------------- | --------------------- | ---------------------------------------------------------------------- |
| `id`            | yes                   | Stable identity. Auto-generated as `n` + base36 counter for new nodes. |
| `text`          | yes                   | The label shown on the node.                                           |
| `children`      | no (defaults to `[]`) | Array of child nodes.                                                  |
| `note`          | no                    | Hover tooltip on the canvas.                                           |
| `color`         | no                    | Hex string used as the node's border color.                            |
| `collapsed`     | no                    | When `true`, descendants are hidden in the mind-map view.              |

Top-level fields:

- `title` (required) — document title
- `root` (required) — the single root node
- `version` (optional) — schema version, currently `1`

---

## Project layout

```
clobmap/
├── src/                      # React frontend (TypeScript)
│   ├── components/           # YamlEditor, MindMap, MindMapNode, ViewToggle, FileMenu, ...
│   ├── lib/                  # Layout (Dagre), storage adapter, recentFiles, file actions
│   ├── model/                # YAML serde, tree ops, diff, AST apply (95% test coverage)
│   ├── store/                # Zustand stores (document, ui) + parse hook
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
