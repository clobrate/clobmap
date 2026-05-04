# Clobmap — Design Doc

**Status:** Draft v0.1
**Date:** 2026-05-04
**Stack decision:** Tauri v2 + Web frontend (React + TypeScript)

---

## 1. Goals

Build a minimalistic mind-mapping app with two equally-first-class views over the same content:

1. **Mind-map view** — visual canvas with nodes, edges, drag/zoom/pan.
2. **YAML view** — a plain-text tree-structured representation users can edit directly.

A user toggling between the two sees the same content. Editing in either view updates the other.

### Targets

- **Desktop:** macOS, Windows, Linux
- **Mobile:** iOS, Android (via Tauri v2)
- **Web:** standalone browser build (the same React app served as a static site)

### Non-goals (v1)

- Real-time multi-user collaboration
- Cloud sync / accounts
- Rich-text formatting inside nodes (plain text only)
- Plugin system
- Diagram types other than mind-map (no flowcharts, sequence diagrams, etc.)

---

## 2. Guiding Principles

- **YAML is the source of truth.** The mind-map view is a rendering of the YAML tree. This eliminates a class of sync bugs and makes "view source" trivial.
- **Local-first.** Documents are plain `.yaml` files on the user's disk. No server required.
- **Minimal chrome.** No sidebars by default. The canvas (or text editor) fills the window. Controls appear on hover or via keyboard.
- **One codebase, one mental model.** All UI is web; Rust handles only what the browser cannot (filesystem, OS dialogs, watchers).

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────┐
│  Web Frontend (React + TypeScript + Vite)           │
│                                                     │
│  ┌─────────────┐   ┌──────────────┐                 │
│  │ Mind-map    │ ⇄ │ YAML editor  │                 │
│  │ (React Flow)│   │ (CodeMirror) │                 │
│  └──────┬──────┘   └──────┬───────┘                 │
│         │                 │                         │
│         └────────┬────────┘                         │
│                  │                                  │
│        ┌─────────▼─────────┐                        │
│        │  Document store   │ (Zustand or Jotai)     │
│        │  - YAML text      │                        │
│        │  - Parsed tree    │                        │
│        │  - Layout cache   │                        │
│        └─────────┬─────────┘                        │
└──────────────────┼──────────────────────────────────┘
                   │  Tauri invoke() / events
┌──────────────────▼──────────────────────────────────┐
│  Rust Backend (Tauri v2)                            │
│  - File I/O (read/write .yaml)                      │
│  - File watcher (auto-reload on external edit)      │
│  - OS dialogs (open/save)                           │
│  - YAML validation (serde_yaml)                     │
│  - Recent files / app state                         │
└─────────────────────────────────────────────────────┘
```

### Boundary rules

- **Frontend owns:** all rendering, all user interaction, layout algorithm, undo/redo, parsing for live editing.
- **Backend owns:** disk, OS integration, anything requiring native APIs.
- **Web build (browser-only):** backend calls degrade to `localStorage` / `File System Access API`. Same frontend code, swapped storage adapter.

---

## 4. Data Model

### YAML schema

```yaml
title: My mind map
root:
  text: Central idea
  id: n1
  children:
    - text: Branch A
      id: n2
      children:
        - text: Leaf 1
          id: n3
        - text: Leaf 2
          id: n4
    - text: Branch B
      id: n5
      children: []
```

### Node fields

| Field       | Type    | Required | Purpose                            |
| ----------- | ------- | -------- | ---------------------------------- |
| `text`      | string  | yes      | Node label                         |
| `id`        | string  | yes      | Stable identity for layout cache   |
| `children`  | Node[]  | no       | Child nodes (default `[]`)         |
| `note`      | string  | no       | Optional longer description        |
| `color`     | string  | no       | Optional hex color                 |
| `collapsed` | boolean | no       | UI state — hidden in mind-map view |

### Document fields

| Field     | Type   | Required | Purpose                  |
| --------- | ------ | -------- | ------------------------ |
| `title`   | string | yes      | Document title           |
| `root`    | Node   | yes      | The single root node     |
| `version` | number | no       | Schema version (start 1) |

### Why explicit IDs?

If we infer IDs from text or path, renaming a node would break the layout cache, the canvas would jump, and any future undo history would lose continuity. Explicit IDs survive renames.

IDs are auto-generated on creation (`n` + base36 counter). Users don't see them in the mind-map view; they're visible in YAML view but rarely need editing.

---

## 5. The Toggle (YAML ↔ Mind-map)

### Direction: mind-map edit → YAML

- Edits to the in-memory tree trigger a re-serialization to YAML on every change (debounced 100ms).
- We use a YAML library that preserves field order and comments where possible (`yaml` npm package, "Document" API).

### Direction: YAML edit → mind-map

- The YAML editor parses on every keystroke (debounced 150ms).
- On parse success: diff the new tree against the current one, apply minimal changes, preserve layout positions for nodes whose `id` is unchanged.
- On parse failure: keep the last valid tree visible in the mind-map view, show a subtle error indicator with line number. Don't blow away the canvas.

### Toggle UX

- A single button (top-right) flips between views.
- Optional split view (50/50) on wider screens — both visible, edits sync live.
- Keyboard: `Cmd/Ctrl + /` toggles.

---

## 6. UI / UX

### Layout

- **Single window, no chrome by default.** Title bar shows file name only.
- **Canvas mode:** mind-map fills the viewport. Pan with drag, zoom with scroll/pinch.
- **YAML mode:** monospace editor fills the viewport. Syntax highlighting, line numbers optional.
- **Hover affordances:** `+` button appears next to node on hover to add a child. Right-click for context menu.

### Mind-map interactions

| Action           | Gesture                               |
| ---------------- | ------------------------------------- |
| Add child node   | `Tab` on selected node, or `+` button |
| Add sibling node | `Enter` on selected node              |
| Edit node text   | Double-click, or `F2`                 |
| Delete node      | `Delete` / `Backspace`                |
| Collapse/expand  | Click chevron, or `Space`             |
| Move node        | Drag-and-drop onto another node       |
| Pan              | Drag empty area, or trackpad scroll   |
| Zoom             | Scroll wheel, or pinch                |
| Fit to screen    | `Cmd/Ctrl + 0`                        |

### Theming

- Light + dark mode, follows OS by default.
- One accent color, configurable later.
- Typography: system UI font for chrome; chosen monospace for YAML view.

---

## 7. Storage

### Desktop / mobile (Tauri)

- Documents are `.yaml` (or `.clobmap.yaml`) files on disk.
- Open / Save / Save As use native dialogs.
- A "recent files" list is persisted in app state (`tauri-plugin-store`).
- Optional file watcher: if a file is modified externally (e.g. user edits in their text editor), reload after confirming no unsaved changes.

### Browser

- "Open" uses File System Access API where supported (Chromium); falls back to a file picker + download flow on Safari/Firefox.
- Auto-save to IndexedDB as a draft buffer.

### File extension

`.yaml` is fine for v1 — the file is just YAML and other tools can read it. We may add a `.clobmap.yaml` convention later if we need richer metadata.

---

## 8. Project Structure

```
clobmap/
├── src/                     # React frontend
│   ├── components/
│   │   ├── MindMap/         # React Flow integration
│   │   ├── YamlEditor/      # CodeMirror integration
│   │   └── Toggle/
│   ├── store/               # Zustand store, document state
│   ├── model/               # Tree types, YAML serde, diffing
│   ├── platform/            # Storage adapters: tauri.ts, web.ts
│   └── App.tsx
├── src-tauri/               # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands.rs      # #[tauri::command] handlers
│   │   └── fs.rs            # File I/O, watcher
│   ├── Cargo.toml
│   └── tauri.conf.json
├── public/
├── package.json
├── vite.config.ts
└── design.md
```

---

## 9. Key Library Choices

| Concern              | Library                                                        | Why                                                         |
| -------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| Mind-map rendering   | **React Flow**                                                 | Mature, handles pan/zoom/drag/edges, customizable           |
| YAML editor          | **CodeMirror 6**                                               | Lightweight, great mobile support, tree-sitter integrations |
| YAML parse/serialize | **`yaml` (npm)**                                               | Preserves order, comments, supports streaming errors        |
| State management     | **Zustand**                                                    | Tiny, no boilerplate, fine for this scope                   |
| Build tool           | **Vite**                                                       | Tauri's recommended default                                 |
| Styling              | **Tailwind CSS** or CSS Modules                                | Pick one; lean toward Tailwind for speed                    |
| Rust YAML            | **`serde_yaml`**                                               | Validation on save                                          |
| Tauri plugins        | `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-store` | Standard set                                                |

---

## 10. Roadmap

### Phase 0 — Scaffold (week 1)

- `npm create tauri-app@latest` → React + TS + Vite template
- Confirm desktop builds on macOS
- Wire up a "hello world" `invoke()` to prove the IPC path

### Phase 1 — YAML editor + tree model (week 2)

- CodeMirror with YAML syntax highlighting
- Parse → in-memory tree on every change
- Errors shown inline, no crashing

### Phase 2 — Mind-map view (weeks 3–4)

- React Flow with custom node component
- Auto-layout (radial or horizontal tree)
- Read-only first, then editable

### Phase 3 — Toggle + bidirectional sync (week 5)

- Toggle button + split view
- Edits in either view propagate
- Parse-error tolerance in mind-map view

### Phase 4 — File I/O (week 6)

- Open / Save / Save As via Tauri dialogs
- Recent files
- File watcher for external changes

### Phase 5 — Polish (week 7)

- Dark mode
- Keyboard shortcuts pass
- Empty state, onboarding
- Window state persistence

### Phase 6 — Cross-platform builds (week 8)

- Windows + Linux desktop builds
- Web build (static site)
- Code signing / notarization for macOS

### Phase 7 — Mobile (later)

- iOS + Android via Tauri v2 mobile
- Touch-first gestures pass for the mind-map
- This is its own milestone — expect 3–4 weeks of platform-specific work

---

## 11. Open Questions

1. **Layout algorithm:** radial (classic mind-map) or horizontal tree (cleaner for deep nesting)? → ship horizontal first; radial as an option later.
2. **Markdown in node text:** support `**bold**`/`*italic*` rendering, or keep nodes strictly plain? → plain in v1.
3. **Multiple roots:** YAML schema currently mandates a single `root`. Should we allow forests? → no, simpler model, defer.
4. **Auto-save vs explicit save:** desktop convention is explicit `Cmd+S`; modern apps auto-save. → explicit save for v1, auto-save as a setting later.
5. **Versioning the YAML schema:** add `version: 1` from day one even though it's unused, so v2 has somewhere to land.

---

## 12. Risks

- **Mobile maturity (Tauri v2).** iOS/Android support is real but rough. Mitigation: ship desktop + web first; mobile is a separate milestone with its own discovery time.
- **Webview rendering differences.** Safari WebKit may show subtle canvas/SVG issues on macOS/iOS. Mitigation: test on Safari early and often, prefer DOM/SVG over canvas where possible (React Flow does this already).
- **Parse-on-keystroke performance.** Large maps (1000+ nodes) may stutter. Mitigation: debounce + worker-thread parsing if it shows up in profiling. Don't optimize prematurely.
- **YAML round-trip fidelity.** Comments and field order must survive a mind-map edit. Mitigation: use `yaml` package's Document API, test with fixtures that include comments.
