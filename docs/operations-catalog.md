# clobmap — Operations Catalog

A categorized list of everything you can do with a clobmap document — framed as
discrete operations (useful as a UI checklist, a test matrix, or the surface for
an automation / CLI / MCP / skill layer). Grounded in the current code
(`src/model/ops.ts`, `src/lib/fileActions.ts`, `src/lib/notes*.ts`,
`src/lib/exportActions.ts`, `src/lib/settings.ts`, `src/store/ui.ts`).

## How nodes are addressed
- **By `id`** — the canonical handle. Every node has a stable `id`; all tree ops
  take an id. (`findById(doc, id)`.)
- **By title/text** — not unique and not a primitive; resolve to an id first by
  searching `text` (walk the tree / the YAML). Two nodes can share a title.
- **By path** — e.g. `Root › Subject › Page` — resolve by walking titles from the
  root; ambiguous if titles repeat.
- The document itself is a `.clobmap.yaml` file — **the format is the API**: any
  operation below can also be done by editing the YAML directly (see §13).

---

## 1. Document & file lifecycle
- **Create a new empty document** (a single "Untitled" root). — `newFile` / `newTab`
- **Open** a `.clobmap.yaml` — from a path, a file dialog, or Recent, or by
  double-clicking the file (desktop OS open). — `openFromPath` / `openFile` / `openRecent`
- **Save** to the current file. — `saveFile`
- **Save As** `<name>.clobmap.yaml` (pick a new path). — `saveFileAs`
- **Set the document title.**
- **Multiple documents at once** — open several in tabs; **switch tabs**, **close a tab**.
- **Auto-save** (on by default) writes on the fly when the YAML is valid and the
  doc has a file path.
- **Draft safety** — unsaved work survives reload/quit (localStorage draft).
- **Reopen last file** on launch (desktop).

## 2. Node structure (the tree)
- **Add a child** to a node. — `addChild(doc, parentId, text)`
- **Add a sibling** (before/after a node). — `addSibling`
- **Delete a node** and its whole subtree. — `deleteNode`
- **Rename a node** (change its `text`/title). — `updateText`
- **Move / reparent a node** to a new parent at an index. — `moveNode`
- **Reorder among siblings** (move up/down). — `moveSibling`
- **Duplicate a node** (deep copy with fresh ids). — `duplicateNode`
- **Cut / Copy / Paste a subtree** (clipboard) — move or clone a branch elsewhere.
- **Collapse / expand** a node (`collapsed`). — via `updateNode`
- **Find a node** by id (or search by title). — `findById`
- **Read the whole tree** / a subtree (structure + every field).

## 3. Notes (a node's long-form content)
Notes are Markdown (headings, lists, bold/italic, code, blockquote, links; raw
HTML is escaped). Storage is **inline in the YAML** or a **file** (sidecar / the
folder-mode `.md`), chosen by size (inline mode) or always-a-file (folder mode).
- **Add notes** to a node (title/id addressed). — `saveNotes` via `useNodeNotes`
- **Read** a node's notes (resolves inline vs file transparently). — `loadNotes`
- **Edit / replace** a note's full content.
- **Append** a string to the end of a note. *(composed: read → concat → save)*
- **Prepend / insert** text into a note. *(composed: read → splice → save)*
- **Clear / delete** a note (empties it; folder mode keeps an empty reusable file).
- **Inline ↔ file** — auto-extract to a sidecar over the size cap (inline mode);
  one `.md` per node under the folder (folder mode, desktop default).
- **Migrate** a document's inline notes → files on open (folder mode, undoable).
- **Tidy** the notes folder — remove archived (`.Deleted-…`) + orphaned files. — `tidyNotes`
- **External edits reflect back** — edit the `.md` in another app; clobmap re-reads.

## 4. Node appearance
- **Change a node's color** (any CSS/hex color). — `updateNode({ color })`
- **Clear a node's color** (back to default).
- **Set per-node max width / max height** (text box sizing). — `updateNode({ maxWidth, maxHeight })`
- Variable-size, word-wrapping text nodes (automatic).

## 5. Tags on a node
- **Add one or more tags** to a node (comma-separated; case-insensitive dedupe). — `tagsAdd`
- **Remove a tag** from a node. — `tagsRemove`
- **List** a node's tags.
- Tags show under each Notelets page (`tags: …`) and in the Markdown export.

## 6. Tag tree (the tag hierarchy / structure)
- **Rename a tag** — cascades to every node that carries it. — `updateTagName`
- **Delete a tag** — cascades (removes it from all nodes + the tree). — `tagDelete`
- **Restructure the tag tree** — move a tag under another parent. — `moveTagNode`
- **Reorder a tag** among its siblings. — `moveTagSibling`
- **Show / hide** the tag-tree pane; resize it.

## 7. Tag-driven views
- **Filter view** — show only the nodes carrying a chosen tag (as a hierarchy). — `setFilterTagId`
- **Highlight** — selection-driven highlight of nodes with the selected tag.

## 8. Layout, positions & edges (mind-map canvas)
- **Auto layout** (measurement-driven tidy tree) vs **Manual layout**. — `setLayoutMode`
- **Drag a node** to a manual position; positions persist in the YAML.
- **Set / clear positions** programmatically. — `setPositions` / `clearAllPositions`
- **Reset to Auto** (wipe all saved positions in one click).
- **Per-edge connector side** — choose which of the 4 sides each edge attaches to
  on either node (`edgeFrom` / `edgeTo`), with arrow markers.
- **Zoom / pan / fit-to-view** the canvas.

## 9. Views & navigation
- **YAML view** — edit the document as raw text directly (full control); **search** (Cmd+F).
- **Split view** — YAML + mind-map side-by-side or stacked; adjustable ratio.
- **Mind-map view** — the node canvas.
- **Notelets view** (notes-as-pages) — **Scroll** (all pages) or **Page** (one at a
  time) mode; **Subject tabs**; **Prev/Next** + arrow-key paging; sidebar outliner
  (add/rename/delete/move nodes from the ToC); mobile drawer.
- **Cycle views** (`Cmd/Ctrl + /`).
- **Select a node**; **navigate** with arrows / Home / End.

## 10. History
- **Undo / redo** — structural edits and text (per-surface; the editor owns text
  undo while focused).

## 11. Export
- **PNG** of the mind-map. — `exportPng`
- **SVG**. — `exportSvg`
- **PDF**. — `exportPdf`
- **All notes → Markdown** — one `# Title (id)` section per node with a `tags:`
  line, a `color:` line (when set), and the note body (inner headings demoted). — `exportAllNotes`

## 12. Settings / preferences
- **Auto-save** on/off. — `saveAutoSavePref`
- **Theme** — system / light / dark. — `saveThemePref`
- **Font size.** — `saveFontSizePref`
- **Split orientation** (side-by-side / stacked) + **ratio**. — `saveSplitOrientationPref` / `saveSplitRatioPref`
- **Note storage** — inline / notes-folder — and the **folder name**. — `saveNoteStoragePref` / `saveNotesFolderPref`
- **Notelets reading mode** — scroll / page. — `saveNoteletsModePref`
- **Crash reports** (telemetry) on/off. — `saveTelemetryPref`
- **Check for updates** (desktop).

## 13. Direct YAML authoring (the format is the API)
Because a document *is* its `.clobmap.yaml`, you can set anything by writing YAML:
- **Document:** `title`, `version`, `layoutMode` (auto/manual), `root`, `tagRoot`.
- **Per node:** `id`, `text`, `children[]`, `color`, `collapsed`, `maxWidth`,
  `maxHeight`, `notes` (inline text **or** a `./path.md` reference), `position {x,y}`,
  `edgeFrom`, `edgeTo`, `tags[]`.
- Round-trips cleanly (comments/order preserved via the live YAML AST); an invalid
  edit keeps the last-good tree on-canvas instead of blanking.

## 14. Platform notes
- **Desktop (Tauri):** file-per-note storage + folder mode (default), sidecar
  files, folder/file watching (external-edit reflect-back), delete-archive +
  tidy, path sandbox (notes confined to the doc's folder), signed auto-update,
  open-from-OS.
- **Web:** runs in the browser; drafts in localStorage; note files are read-only
  (no local FS writes) so it stays inline.
- **iOS:** like web for notes (read-only file refs).

---

### Primitive vs composed
Most items map to a single function (marked with `— fn`). A few — **append to a
note**, **prepend**, **insert**, **rename-by-title**, **move-by-path** — are
*composed* from primitives (read → transform → write, or search → id → op). If
this catalog is seeding an automation/MCP surface, those composed ops are the
natural convenience wrappers to add on top of the primitives.

### Implemented: the clobmap skill
This catalog is now realized as a headless CLI —
[`skills/clobmap/`](../skills/clobmap/SKILL.md) — covering the operations above
(including the composed convenience wrappers) plus an atomic JSON op-list batch.
It reuses the pure model layer, so edits round-trip losslessly. Use it instead
of hand-editing `.clobmap.yaml`.
