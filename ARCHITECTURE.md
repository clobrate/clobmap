# Architecture

A map of how clobmap fits together. Read this before a non-trivial PR.

## The big idea

clobmap shows the **same document** as either YAML text or a visual
mind-map tree, and edits in either propagate to the other. The YAML
text is the **canonical** representation; everything else is derived.

Two consequences worth knowing up front:

1. **Comments and field ordering survive structural edits.** When you
   add/move/delete a node in the canvas, we don't re-serialize the
   whole document — we surgically apply the change to a `yaml.Document`
   AST and keep the rest byte-for-byte identical. Without this, the
   YAML view would be unbearable.
2. **The frontend is a thick client.** All YAML parsing, tree ops,
   and layout happen in TypeScript in the browser/webview. The Rust
   side does almost nothing besides exposing fs/dialog/updater plugins.

## Layers

```
┌────────────────────────────────────────────────────────────────────┐
│                         React UI (src/components, src/App.tsx)     │
│                                                                    │
│  YamlEditor (CodeMirror 6) ◄──┐         ┌──► MindMap (React Flow) │
│                               │         │                          │
│                          subscribes  subscribes                    │
└────────────────────────────────┼─────────┼─────────────────────────┘
                                 ▼         ▼
┌────────────────────────────────────────────────────────────────────┐
│                State (src/store, Zustand)                          │
│                                                                    │
│  useDocumentStore — the LIVE active document                       │
│    yamlText, parsedDoc, yamlDoc, undoStack, currentFilePath, ...   │
│  useTabsStore     — snapshots of inactive tabs + active id         │
│  useUIStore       — view mode, theme, selection, context menu, ... │
└────────────────────────────────────────────────────────────────────┘
                                 ▲
                                 │ pure functions
┌────────────────────────────────────────────────────────────────────┐
│                Model (src/model) — no React, no I/O                │
│                                                                    │
│  parse        — yamlText  → MindDocument tree + yaml.Document AST  │
│  apply        — mutate the AST in place to match a new tree        │
│  ops          — addChild, addSibling, moveNode, duplicateNode, ... │
│  diff         — used by tests and the property-test harness        │
│  serialize    — MindDocument → yamlText (for the no-AST path)      │
└────────────────────────────────────────────────────────────────────┘
                                 ▲
                                 │ adapter
┌────────────────────────────────────────────────────────────────────┐
│                Storage (src/lib/storage)                           │
│                                                                    │
│   StorageAdapter interface: open, read, save, pickSavePath, watch  │
│   tauriStorage — desktop + iOS, via @tauri-apps/plugin-fs/dialog   │
│   webStorage   — browser, File System Access API + download fallbk │
└────────────────────────────────────────────────────────────────────┘
                                 ▲
                                 │ Rust IPC
┌────────────────────────────────────────────────────────────────────┐
│                Tauri shell (src-tauri)                             │
│                                                                    │
│   plugins: fs, dialog, store + (desktop only) updater, process,    │
│            single-instance, shell, log, window-state               │
│   commands: ping, pending_open_path, open_log_folder               │
│   capabilities: capabilities/{default,mobile}.json                 │
│   build/: native installer artifacts (.dmg, .msi, .deb, .ipa)      │
└────────────────────────────────────────────────────────────────────┘
```

## Data flow on a single edit

User presses **Tab** to add a child to the selected node:

1. `MindMap.tsx` keyboard handler calls `addChild(tree, selectedId, ...)`
   from `src/model/ops.ts` — pure function, returns a new
   `MindDocument` tree.
2. `applyTreeChange(newTree)` in the document store: walks the
   `yaml.Document` AST and patches it in place to match the new tree
   (`applyTreeToDocument` in `src/model/apply.ts`), then re-serializes
   the AST back to text. The YAML editor sees the new text and
   re-renders.
3. The store also pushes the previous tree onto `undoStack` and
   sets `isDirty = true`.
4. `MindMap.tsx` re-runs its layout `useMemo` against the new
   `parsedDoc`, then a `useEffect` pushes the new positions into
   React Flow's internal store.
5. CodeMirror's `useEffect` notices `yamlText` changed and updates
   the editor (preserving the user's cursor where possible).

The active tab's snapshot stays stale until either a tab switch (when
`useTabsStore.switchTo(id)` calls `snapshotDocument()` first) or an
explicit `syncActive()` call after Save / Save As.

## Where each concern lives

| Concern | Lives in |
|---|---|
| YAML parse + AST | `src/model/parse.ts` |
| Tree ops (add/move/delete) | `src/model/ops.ts` |
| Apply tree changes back to YAML AST | `src/model/apply.ts` |
| Pure-text re-serialize (no AST) | `src/model/serialize.ts` |
| ID generator | `src/model/ids.ts` |
| Layout (depth × subtree-row) | `src/lib/layout.ts` |
| Document store | `src/store/document.ts` |
| Tabs (snapshot+swap) | `src/store/tabs.ts` |
| UI state (view mode, selection, …) | `src/store/ui.ts` |
| File actions (open / save / new) | `src/lib/fileActions.ts` |
| Storage adapter | `src/lib/storage/` |
| Telemetry (Sentry, opt-in) | `src/lib/telemetry.ts` |
| Settings persistence | `src/lib/settings.ts` |
| Updater | `src/lib/updater.ts` |
| OS-driven file open | `src/lib/openFromOs.ts` |
| Tauri Rust shell | `src-tauri/src/lib.rs` |

## Invariants worth preserving

- `useDocumentStore.getState().yamlText` is always the canonical
  serialization. If you change the tree without going through
  `applyTreeChange`, you'll desync the AST and the YAML view will be
  wrong.
- `parsedDoc` is **derived** from `yamlText`. Don't mutate it; build a
  new tree and pass it through `applyTreeChange`.
- The `yaml.Document` AST in `yamlDoc` is mutated in place by
  `applyTreeChange`. That's the only place that mutates it.
- Layout is pure: same `parsedDoc` → same nodes/edges. No randomness,
  no time-based decisions.
- `src/model/` has zero React imports and zero browser-only API calls
  — that's why it can run under Vitest unchanged.

## Build pipelines

- **Web:** `npm run build:web` → `dist-web/` static SPA. Cloudflare
  Pages auto-deploys on push to `main`. Includes `_redirects`
  (SPA fallback) and `_headers` (cache + CSP).
- **Desktop:** `npm run tauri build` → `.dmg` / `.msi` / `.deb` /
  `.AppImage` under `src-tauri/target/release/bundle/`. The
  `.github/workflows/release.yml` matrix builds on a tag push, signs
  + notarizes macOS, and assembles `latest.json` for the updater.
- **iOS:** `npm run tauri ios build --debug --target aarch64
  --export-method debugging` → `.ipa` under
  `src-tauri/gen/apple/build/arm64/`. Install on a connected device
  via `xcrun devicectl device install app`. There's no CI release
  pipeline for iOS yet — that's TestFlight setup work, deferred.

## What's deliberately NOT here

- **No backend.** Documents live on disk; nothing is uploaded
  unless the user explicitly enables Sentry.
- **No real-time collaboration.** It's a single-user file editor.
- **No plugin system / extensions.** Customization is via editing
  the YAML directly or forking.
- **No Android.** iOS only on the mobile track (decision logged in
  the implementation plan).

## Performance notes

The model layer measured on a generated 5000-node fixture:

| Operation | Time |
|---|---|
| `parseLiveYaml` | ~85 ms |
| `layoutMindMap` | 1.2 ms |
| `serializeYaml` (full) | ~34 ms |
| `serializeLiveYaml` (AST) | ~22 ms |
| Single edit cycle (mutate + apply + serialize) | ~26 ms |

Run `node scripts/gen-large-doc.mjs 5000 /tmp/perf-5k.clobmap.yaml`
then `PERF=1 npx vitest run src/model/__tests__/perf.test.ts
--reporter=verbose` to reproduce. Browser-side rendering is bounded
by React Flow's `onlyRenderVisibleElements` — DOM node count is
proportional to viewport, not document size.
