# Notelets — Phase 3 Implementation Plan (Sidebar as a structural editor)

Status: **Ready to build** — depends on Phases 0–2 (complete). Branch `feature/notelets`.
Author: Kiran (planned with Claude)
Last updated: 2026-09-24
Parent: [`notelets-implementation-detailed-plan.md`](./notelets-implementation-detailed-plan.md) §6 Phase 3. Prior: [`notelets-phase2-implementation-plan.md`](./notelets-phase2-implementation-plan.md). Product: [`notelets-product-doc.md`](./notelets-product-doc.md) §6.3.

---

## Goal

Make the Notelets **table-of-contents sidebar a real outliner**: add, rename, reorder, re-parent, and delete nodes without leaving the notebook. Structure edits flow through the same tree ops as the mind-map, so YAML / Mind-map / Notelets stay in lockstep.

After this phase the sidebar isn't just navigation — it's a full lightweight structural editor, and Notelets is a self-contained "outline + write" surface.

## What Phases 0–2 already give us (reuse, don't rebuild)

- **Tree ops** — `src/model/ops.ts`: `addChild(doc, parentId, text, ids, index?)`, `addSibling`, `deleteNode`, `updateText`, `moveNode(doc, id, newParentId)`, `moveSibling(doc, id, dir)`, `idGeneratorForDocument`. All pure, return a new tree.
- **The mind-map's keyboard handler is the template** — `MindMap.tsx:439-465`: `Tab`→`addChild` "New" + select + edit + reveal; `Enter`→`addSibling`; `F2`→rename; reorder via `moveSibling`; drag-reparent via `moveNode` (`:311`). Mirror it.
- **Inline rename** — the mind-map already renames via `editingNodeId` / `setEditing` (`store/ui.ts`) + an input in `MindMapNode`. Reuse the same state and ergonomics in the sidebar row.
- **Apply path** — `applyTreeChange(newTree)` re-serializes (comment-preserving), pushes undo, sets dirty, triggers autosave. Every structural edit routes through it → free undo/redo + YAML sync.
- **Sidebar** — `NoteletsSidebar.tsx` already renders the ARIA tree (`treeitem` + `aria-level`), roving tabindex, selection, ArrowUp/Down/Home/End nav. We add the structural keys, rename, and drag.
- **Navigation helpers** — `src/lib/navigation.ts` (`navigateSibling`, etc.) if we want canvas-identical arrow semantics.

## Scope decisions (please confirm the two flagged ⚠️)

1. ⚠️ **`Enter` becomes "add sibling."** Today the sidebar's `Enter` re-scrolls to the selected page (Phase 1). To match the mind-map and the outliner convention (product §6.3), **`Enter` should add a sibling**. Click already handles navigate-and-scroll, so re-scroll-on-Enter is redundant. **Confirm: repurpose `Enter` → addSibling (recommended).**
==> OK, Repurpose Enter seems nice. Go ahead. 

2. **`Tab` = add child** (mind-map parity). This traps `Tab` inside the tree (can't Tab-focus out while a row is focused) — the mind-map makes the same tradeoff. Accept for outliner ergonomics; `Esc`/click moves focus out. (Documented a11y note.)
3. ⚠️ **Drag model.** For real reorder + re-parent we need to insert a moved node at a specific position, which no current op does (`moveNode` appends as last child). Recommendation: **extend `moveNode` with an optional `index`** — `moveNode(doc, id, newParentId, index?)` — pure and unit-testable, backward-compatible with the mind-map's 3-arg calls. Drag-onto-row → child; drag-between-rows → sibling at that index. **Confirm: extend `moveNode` (recommended) vs. keyboard-only reorder for v1.**
==> Ok. go with recommended moveNode. 

4. **Desktop/tablet only.** The sidebar is hidden below `sm` (phones); structural editing there stays via the mind-map. Not a regression — mobile Notelets is read+notes-edit only this phase.
5. **Two edit modes stay distinct.** Sidebar rename edits a node's **title** (`updateText`, via `editingNodeId`); clicking a page body edits its **notes** (Phase 2). Different surfaces, no conflict. Only one view is mounted at a time, so reusing `editingNodeId` for the sidebar rename is safe.

## Definition of done

- With a sidebar row selected: `Tab` adds a child, `Enter` adds a sibling — each new node lands in rename mode; `Delete` removes the node (never the root); `F2` / double-click renames.
- Rename commits on `Enter`/blur, cancels on `Esc`; the page heading + YAML update live.
- Drag a row onto another → it becomes that node's child; drag between rows → reorder / re-parent at that position. Dropping onto self/descendant is a no-op.
- Every change is reflected in YAML and the Mind-map, and is undoable (`Cmd/Ctrl+Z`).
- Root can't be deleted, dragged, or given a sibling (matches canvas).
- `npm test`, `npm run typecheck`, `npm run lint` green; new unit tests for the extended op; new e2e for add/rename/delete/reorder/drag.

---

## Work item 0 — Model: `moveNode` gains an optional `index`

`src/model/ops.ts`. Extend `moveNode(doc, nodeId, newParentId, index?)`:
- No `index` → append (current behavior; mind-map callers unchanged).
- With `index` → insert at that position among `newParentId`'s children. Handle the within-same-parent case (removing the node first shifts indices — clamp/adjust).
- Keep the existing cycle guard (can't move under self/descendant → `OpError`).

**Unit tests** (`src/model/__tests__/ops.test.ts`): append vs indexed insert; reorder within a parent (up and down); reparent to a position; clamp out-of-range index; still rejects self/descendant. `model/` is in the coverage scope, so this is measured.

## Work item 1 — Sidebar structural keyboard

`NoteletsSidebar.tsx` `onKeyDown`, mirroring `MindMap.tsx:439-465`:
- `Tab` → `addChild(tree, selectedId, "New", ids)` → `applyTreeChange`, `setSelected(newId)`, `setEditing(newId)`. `preventDefault`.
- `Enter` → `addSibling(tree, selectedId, "New", ids)` (guard: root has no sibling → `OpError`, swallow). Same select+edit. **(replaces re-scroll)**
- `Delete` / `Backspace` → `deleteNode` (guard root); after delete, select the previous sibling / parent (reuse `lib/navigation.ts`).
- `F2` → `setEditing(selectedId)`.
- Reorder: **`Alt`/`Option + ↑/↓`** → `moveSibling(tree, selectedId, dir)` (canvas parity). (Confirm the exact canvas binding and match it.)
- Keep `↑/↓`, `Home/End` navigation as-is.
- Needs the doc tree + `idGeneratorForDocument(tree)` — read `useDocumentStore.getState().parsedDoc` (like the container does) or thread it in as a prop.

## Work item 2 — Inline rename in the sidebar row

When `editingNodeId === node.id`, the row renders a text input instead of the label. **Match `MindMapNode.tsx:378-408` exactly:**
- Seed with `node.text`, focus + select-all on mount.
- Commit on `Enter` (not `Shift+Enter`) / blur → only if `value !== initialText` → `updateText(tree, id, value)` → `applyTreeChange` → `setEditing(null)`. Empty is allowed.
- Cancel on `Esc` → `setEditing(null)` (no change).
- `aria-label="Rename node"`; **`stopPropagation` on keydown** so the tree's `Tab`/`Enter`/`Delete` structural keys don't also fire while renaming.
- Double-click a row → `setEditing(node.id)`.
- Reuse the mind-map rename component/ergonomics; share a small component if practical.

## Work item 3 — Drag to reorder / re-parent

HTML5 drag-and-drop on the tree rows (lighter than wiring React Flow into a list):
- `draggable` rows; `dragstart` stores the dragged node id.
- `dragover` a row computes intent from pointer position: top third → insert **before** (sibling), bottom third → **after** (sibling), middle → **onto** (child). Show a drop indicator (line for before/after, highlight for onto).
- `drop` → `moveNode(tree, draggedId, targetParentId, index)` (Work item 0). Reparent = target's children; reorder = same parent, new index.
- Guard: dropping onto self/descendant → no-op (catch `OpError`); root is not draggable.
- `applyTreeChange`, keep the dragged node selected.

## Work item 4 — Selection / reveal parity + edge cases

**Undo/redo (DONE):** the mind-map binds Cmd+Z/Cmd+Shift+Z/Cmd+Y on `window`, but it isn't mounted in the Notelets view — so a **window-level handler in the `Notelets` container** owns them while Notelets is up. It's guarded to skip when a text editor owns focus (the CodeMirror page editor via `.cm-editor`, or the sidebar rename `input`), so their native Cmd+Z keeps undoing text. (Deleting a focused row moves focus to `body`, which is why a tree-scoped handler wasn't enough.)

| Case | Behavior |
|---|---|
| Add child/sibling | New node selected + in rename mode. **Reveal-on-add (scroll the page column to the new page) deferred** as optional polish — the sidebar already reveals + focuses the new row, and auto-scrolling mid-rename is disorienting |
| Delete a node | Select prev sibling → parent (never leaves nothing selected); root can't be deleted |
| Root | No sibling (`Enter` no-ops), not deletable, not draggable |
| Drag onto self/descendant | No-op (cycle guard) |
| Rename to empty | **Allowed** — matches the mind-map (`MindMapNode.tsx:378`): commit only if `value !== initialText`, no empty-guard/trim; Enter & blur commit, Esc cancels; `stopPropagation` on keydown so the tree's structural keys don't also fire |
| Editing notes (Phase 2) while restructuring | Separate surfaces; a structural change that removes the edited page drops its editor (already handled by `activeEditingId` derivation) |

## Work item 5 — Tests & polish

- **Unit:** Work item 0 op tests (measured); `NoteletsSidebar` structural behavior (jsdom + mocked store) — Tab/Enter/Delete/F2 call the right ops via `applyTreeChange`; rename commit/cancel. (Drag is validated in e2e.)
- **e2e (`notelets.spec.ts`):** from the sidebar — `Tab` adds a child (appears in ToC + as a page); `Enter` adds a sibling; `F2`/double-click renames (YAML + page heading update); `Delete` removes; `Alt+↑/↓` reorders (YAML order changes); **drag** a row onto another reparents (YAML nesting changes); parity check: change made in the sidebar shows in the Mind-map and YAML; `Cmd/Ctrl+Z` undoes.
- **Polish:** a11y (tree `aria-*` on rename input, drop announcements optional), i18n (any new copy), keep focus sensible after each op. Note the `Tab`-trap a11y tradeoff.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `moveNode` index edge cases (same-parent reorder index shift) | Thorough unit tests in Work item 0; clamp + adjust for the removed node |
| `Tab` trapping surprises keyboard users | Match the mind-map (documented); `Esc`/click exits the tree |
| HTML5 DnD flakiness / drop-target precision | Clear thirds + visible drop indicator; e2e with Playwright `dragTo`; fall back to keyboard reorder which is always available |
| Sidebar rename vs mind-map rename sharing `editingNodeId` | Only one view mounted at a time; verify no leak in tests |
| Divergence from canvas semantics | Reuse the exact ops + `lib/navigation.ts`; e2e asserts YAML/Mind-map parity |
| Structural edit while a page is mid-notes-edit | `activeEditingId` already drops a removed page's editor (Phase 2) |

## Suggested commits

1. `feat(model): moveNode gains optional index (insert-at-position) + tests`
2. `feat(notelets): sidebar structural keys — Tab/Enter add, Delete, F2 rename`
3. `feat(notelets): inline rename in the sidebar row`
4. `feat(notelets): drag to reorder / re-parent in the sidebar`
5. `test(notelets): unit + e2e for sidebar restructuring`

Each commit should leave the suite green.

## Explicitly deferred (later phases)

- **One-page mode**, **Subject tabs**, keyboard **paging**, full mobile layout → Phase 4.
- Mobile structural editing (sidebar hidden on phones) — via the mind-map for now.
- **Virtualization**, print / export-from-Notelets → Phase 5.
- Multi-select / bulk move, cut-paste subtree in the sidebar — later, if wanted (the canvas has clipboard ops to reuse).
