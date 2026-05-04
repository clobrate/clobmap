# clobmap

A minimalistic, cross-platform mind-mapping app where the **YAML view and the mind-map view are equally first-class**. Edit either; the other follows.

Built with **Tauri v2 + React + TypeScript**. Targets macOS, Windows, Linux, web, and (later) iOS / Android.

> **Status:** Phase 5 / 15 — bidirectional sync, split view, and round-trip property test in place. See [Roadmap](#roadmap) for the full plan.

---

## What it does today

- Edit a mind map as **YAML** (CodeMirror 6, syntax highlighting, inline parse errors).
- View / edit the same map as a **horizontal tree** (React Flow + Dagre layout).
- Toggle between **YAML / Split / Mind-map** in the header (or `Cmd/Ctrl + /`); split shows both panes side-by-side.
- Edits in either view propagate to the other; selecting a node in the canvas jumps the YAML cursor to its line.
- YAML comments and field ordering survive structural edits made from the canvas.

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

### Production build

```bash
npm run tauri build
```

Bundles land at:

- `src-tauri/target/release/bundle/macos/clobmap.app`
- `src-tauri/target/release/bundle/dmg/clobmap_*.dmg`

---

## Use it

The app starts with a sample mind map. Use the **YAML / Split / Mind-map** toggle in the header (or `Cmd/Ctrl + /`) to switch views.

**App-wide shortcut**

| Action                               | Shortcut       |
| ------------------------------------ | -------------- |
| Cycle view (YAML → Split → Mind-map) | `Cmd/Ctrl + /` |

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

| Action                   | Shortcut                                                    |
| ------------------------ | ----------------------------------------------------------- |
| Select a node            | Click                                                       |
| Clear selection          | Click background                                            |
| Add a child              | `Tab` (auto-renames)                                        |
| Add a sibling            | `Enter` (auto-renames)                                      |
| Rename inline            | `F2` or double-click                                        |
| Delete                   | `Delete` / `Backspace` (root is protected)                  |
| Collapse / expand        | `Space` (collapsed nodes show `+N` for hidden descendants)  |
| Reparent                 | Drag a node onto another (illegal drops snap back)          |
| Context menu             | Right-click                                                 |
| Fit to view              | `Cmd/Ctrl + 0`                                              |
| Undo / redo              | `Cmd/Ctrl + Z` / `Cmd/Ctrl + Shift + Z` (or `Cmd/Ctrl + Y`) |
| Cancel edit / close menu | `Esc`                                                       |

Mind-map mutations preserve YAML comments and field ordering wherever possible (via in-place AST surgery, not full re-serialization).

---

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
│   ├── components/           # YamlEditor, MindMap, MindMapNode, ViewToggle, ...
│   ├── lib/                  # Pure helpers (layout via Dagre)
│   ├── model/                # YAML serde, tree ops, diff, AST apply (95% test coverage)
│   ├── store/                # Zustand stores (document, ui) + parse hook
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                # Rust backend (Tauri commands, plugins)
├── design.md                 # Architecture and product spec
├── implementation-plan.md    # Phased plan with exit criteria
├── brainstorming.md          # Early decision notes (Flutter vs Tauri, etc.)
└── README.md                 # You are here
```

---

## Scripts

```bash
npm run dev              # Vite dev server (web only, no Tauri)
npm run tauri dev        # Native window with hot reload
npm run build            # Frontend production build → dist/
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

| Phase | Status | What it adds                                                                                                                                                   |
| ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | ✅     | Tauri + React + TS scaffold; lint, format, typecheck, ping IPC                                                                                                 |
| 1     | ✅     | Pure-TS data model: YAML parse/serialize, tree ops, diff, comment-preserving AST apply                                                                         |
| 2     | ✅     | YAML editor view with live parsing, inline error markers, status bar                                                                                           |
| 3     | ✅     | Read-only mind-map view (React Flow + Dagre, view toggle in header)                                                                                            |
| 4     | ✅     | Mind-map editing — selection, keyboard ops, inline rename, drag-to-reparent, context menu, undo/redo, collapse                                                 |
| 5     | ✅     | **Bidirectional toggle (`Cmd/Ctrl+/`), split view, external-edit sync into CodeMirror, selection-to-line cursor jump, 100-iteration round-trip property test** |
| 6     |        | File I/O — open/save, recent files, file watcher                                                                                                               |
| 7     |        | Web build (browser-only static site)                                                                                                                           |
| 8     |        | UI polish + accessibility (keyboard navigation, screen reader, light/dark intent)                                                                              |
| 9     |        | Auto-update via signed `latest.json`                                                                                                                           |
| 10    |        | Cross-platform desktop builds + signing/notarization                                                                                                           |
| 11    |        | CI/CD + release pipeline                                                                                                                                       |
| 12    |        | Observability (Sentry, opt-in telemetry, error boundaries)                                                                                                     |
| 13    |        | Mobile (iOS / Android via Tauri v2)                                                                                                                            |
| 14    |        | Production hardening (security review, perf, docs, license)                                                                                                    |
| 15    |        | 1.0.0 launch                                                                                                                                                   |

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

## Contributing / dev notes

- Don't commit secrets, build artifacts, or `node_modules` — `.gitignore` covers the standard set.
- Phase commits land on `main`. Run `lint`, `typecheck`, `test`, and `build` before committing.
- Coverage on `src/model/` is gated at 90% (lines/branches/functions/statements).
- Keep this README current — every shipped phase updates the [Roadmap](#roadmap) and any user-facing behavior tables above.
