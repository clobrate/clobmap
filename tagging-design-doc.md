# Tagging Feature — Design Doc

Status: **Implemented** — Phases A–E shipped + selection-driven highlight extension. Merged in PR #23 (see CHANGELOG). This doc remains the canonical reference for behavior; deferred items in §12 are still open.
Author: Kiran (designed with Claude)
Last updated: 2026-05-13

## 1. Motivation

clobmap currently expresses a single hierarchy: the mind-map tree of
"data-nodes" (the user's own content). For larger documents, a second,
orthogonal organizing dimension is useful — labelling nodes with one or
more **tags**, then re-grouping the canvas by tag. Tags themselves form
their own hierarchy that the user curates.

## 2. Terminology

- **Data-node** — the existing `MindNode` in `src/model/types.ts`: the
  user's content tree. Unchanged in shape except for a new `tags` field.
- **Tag-node** — a node in a separate parallel tree whose only payload
  is a tag name (string). Tag-nodes can be nested under other tag-nodes
  to form a tag hierarchy.
- **Data view** — current behaviour: the canvas renders the data-node
  tree.
- **Tag tree** — a second canvas region (below or beside the data
  canvas) that renders the tag-node tree.
- **Hierarchy filter view** — a transient view that replaces the data
  canvas with one where each tag-node is shown with the data-nodes
  carrying that tag as its children.

## 3. User scenarios → requirements

| # | Scenario | What it implies |
|---|----------|-----------------|
| 1 | Add one or more tags to a data-node | Per-node `tags: string[]`; UI to type/pick tags |
| 2 | Remove an existing tag from a data-node | Same UI affords removal of an individual tag |
| 3 | Tag tree below mind-map, drag-and-drop re-parenting; only the tag name is visible | Second canvas region; tag-nodes are a stripped-down render (label only); reuse existing `moveNode` semantics for drag |
| 4 (sic) | Tags are free-form strings; per-node only | No document-level tags; no namespace/key-value form |
| 5 | Delete a tag at a tag-node → removes tag from every data-node | Cascading global remove; descendants of the deleted tag-node also removed (see §7.3) |
| 6 | "Show nodes under this tags hierarchy" on a selected tag-node | Hierarchy filter view (§5.3); selected tag-node + descendants + an "Untagged" pseudo-node; data-nodes are children of every tag-node they carry |
| 7 | Reset back to original | Single toggle off `filterTagId` returns to data view |
| 8 | Hide / show tag-nodes | UI toggle: `tagTreeVisible: boolean`. Defaults to shown whenever the doc has ≥1 tag; the toggle itself is hidden when the doc has no tags (§5.1) |
| 9 | YAML stores tags as a list, not comma-separated | `tags: ["a", "b"]` block-style under each data-node; tag tree stored alongside the data tree |

## 4. Data model

### 4.1 In-memory shape (extends `MindNode` / `MindDocument`)

```ts
// src/model/types.ts (additions only — existing fields unchanged)

export interface MindNode {
  // ...existing fields...
  /** Tag names attached to this data-node. Order is preserved verbatim
   *  on round-trip. Empty array == undefined (omitted on serialize). */
  tags?: string[];
}

export interface TagNode {
  /** Stable id assigned by the same id generator used for data-nodes
   *  (`src/model/ids.ts`). Namespacing inside the id (e.g., `t1`) is
   *  optional — we just need uniqueness across the document. */
  id: string;
  /** Display label — also the matching key for data-node `tags`. */
  name: string;
  children: TagNode[];
}

export interface MindDocument {
  // ...existing fields...
  /** Root of the tag tree. Absent until the user adds the first tag —
   *  see §5.1. Once created, never auto-removed; users can still
   *  manually clear it by deleting all tag-nodes. */
  tagRoot?: TagNode;
}
```

### 4.2 YAML serialization

A data-node with tags:

```yaml
- id: n7
  text: "Plan venue"
  tags:
    - urgent
    - logistics
  children: []
```

A document-level tag tree, written after `root` in the document:

```yaml
title: Wedding planning
version: 1
root:
  id: n1
  text: "Our wedding"
  children: [...]
tagRoot:
  id: t1
  name: "(Tags Root)"
  children:
    - id: t2
      name: urgent
      children: []
    - id: t3
      name: logistics
      children:
        - id: t4
          name: vendors
          children: []
```

Notes:
- The tag-tree root carries no semantics — it's just a holder so the
  shape mirrors `root` and so `moveNode`-style ops can re-parent any
  user-visible tag.
- Order in `children` is meaningful (same as data-nodes).
- Empty `tags: []` is treated identically to omitted (and serialize
  drops the key — same rule as today's `color: ""` → omitted).
- Empty / absent `tagRoot` is fine; the tag tree is optional.

### 4.3 Identity & matching

- **Tag identity is by *name string***, not by `TagNode.id`. The id
  exists so the tree can be edited (drag/rename) without disturbing
  data-node references.
- Names are stored case-sensitive but matched case-insensitive for
  filtering and dedup. Display preserves the casing of the most-recently
  edited tag-node (see §7.2).
- Duplicate names across the tag tree are **not allowed** — see §7.1.

### 4.4 Schema version

Add a `tags` field is a backward-compatible parse change (the parser
ignores unknown fields today and old docs without `tags` parse cleanly).
However, the moment a user *saves* with tags, the file can no longer be
round-tripped by an older clobmap build. Bump `SCHEMA_VERSION` from `1`
to `2`. Older builds load it but warn; new builds load v1 docs without
issue.

## 5. View states

The app has one canvas today, switched between YAML / Split / Mind-map
by the existing `viewMode` in `src/store/ui.ts`. Tagging adds a second
*content* dimension on top of that, controlled by two new UI flags:

```ts
// src/store/ui.ts (additions)
tagTreeVisible: boolean | null;  // §5.1: null = follow auto rule;
                                 //       true/false = user override
filterTagId: string | null;      // §5.3 selected hierarchy filter
```

Resolution of "is the tag tree pane shown right now":

```ts
const hasAnyTag = !!doc.tagRoot && doc.tagRoot.children.length > 0;
const showTagTree =
  hasAnyTag && (tagTreeVisible ?? true);  // shown by default when tags exist
```

If `hasAnyTag === false`, **every tag-tree UI surface is hidden** —
no pane, no toggle button, no reset chrome. The first `tagsAdd` call
lazily creates `tagRoot` and the pane appears automatically.

### 5.1 Default — data view (no tags in the doc)

`hasAnyTag = false`. Canvas behaves exactly like today. The "Show
tags" / "Hide tags" toggle is **not rendered** in the chrome — there's
nothing to show. The first tag added via "Edit tags…" creates the
tag tree and surfaces the pane (§5.2).

### 5.2 Tag-tree shown alongside (≥1 tag exists)

`hasAnyTag = true`, `filterTagId = null`, `tagTreeVisible ?? true`.
The canvas region splits vertically:

```
┌─────────────────────────────┐
│                             │
│       Data mind-map         │   ← top ~60–70% of the canvas
│                             │
├─────────────────────────────┤
│                             │
│       Tag tree              │   ← bottom ~30–40%, scrollable
│                             │
└─────────────────────────────┘
```

The split is the same React Flow pane mechanism we already use for
`SplitPanes.tsx` (resizable divider). Tag-nodes render with a
stripped-down style: rounded chip, tag name only, no children chevron
unless the tag has children.

### 5.3 Hierarchy filter view

User right-clicks (or hits a context-menu item / button on a tag-node)
**"Show nodes under this tag's hierarchy"**. This sets
`filterTagId = <selected tag-node id>`. The canvas swaps to a single
combined tree:

```
[selectedTag]
├── [descendant tag A]
│     ├── data-node tagged A
│     └── data-node tagged A
├── [descendant tag B]
│     └── ...
└── [Untagged]
      └── (data-nodes carrying no tag at all)
```

Rules:
- Root of the filter view is the **selected** tag-node (not the tag-tree
  root). Its descendants are flattened-but-preserved (each descendant
  tag-node keeps its tag-tree children).
- A data-node appearing under multiple tag-nodes is rendered once per
  matching tag-node (intentional duplication; see §7.4).
- The **"Untagged"** pseudo tag-node is appended as a sibling to the
  selected tag-node's children. Lists every data-node whose `tags` is
  empty/absent. It's purely a render-time construct (no model entry).
- Filter view is **read-only** for structure: drag/drop is disabled, as
  is Tab/Enter/sibling-reorder. The user resets to leave (§5.4). Inline
  rename of a data-node still works — it just edits the underlying
  data-node, same as in the data view.
- **Exportable.** PNG / SVG / PDF exports (`src/lib/exportActions.ts`)
  operate on whatever the canvas currently renders, so the filter view
  exports out-of-the-box. Filename should include the selected tag's
  name (e.g., `wedding.tag-urgent.png`) so the export is unambiguous.

### 5.4 Reset

A button in the canvas chrome (visible only when `filterTagId !== null`)
clears the filter: `filterTagId = null`. View returns to whichever of
§5.1 / §5.2 was active.

## 6. UI surfaces

### 6.1 Adding / removing tags on a data-node

Two surfaces, both delegating to the same `tagsAdd` / `tagsRemove`
model ops (§7):

1. **Context-menu item "Edit tags…"** opens a small inline editor (same
   pattern as the old `NoteEditor` we removed): a comma- or
   enter-separated input with auto-complete against the existing tag
   names. Each existing tag is shown as a removable chip.
2. **Inline chip row inside the node** (read-only, always visible if
   `node.tags?.length > 0`). Chips are styled like the existing color
   indicator — small, rounded, low contrast. Clicking a chip is the
   same as right-click → "Show nodes under this tag's hierarchy" with
   that tag.

Keyboard shortcut: `T` on a selected data-node opens the tag editor
(mirrors `N` for notes).

### 6.2 Tag tree pane (§5.2)

Re-uses `MindMap` / React Flow. The pane mounts a *separate* React Flow
instance bound to the tag tree. Drag-and-drop re-parenting and sibling
reorder all reuse `moveNode` / `moveSibling`, just on the tag tree
(§7.5). Tag-node UI:

- Single-line label, no chevron unless the tag has children
- Right-click → "Show nodes under this tag's hierarchy" (sets
  `filterTagId`)
- Right-click → "Delete tag" (cascades globally — §7.3)
- Double-click → rename (same `InlineRename` component, but renaming
  edits `name` not `text`)

### 6.3 Toggle visibility & filter chrome

A small button group in the top-right of the canvas (next to the
Settings cog). All of these surfaces are conditional:

- `Show tags` / `Hide tags` — toggles `tagTreeVisible`. Rendered only
  when `hasAnyTag === true` (§5). When the doc has no tags, neither
  the button nor the pane exists.
- `Reset filter` — shown only when `filterTagId !== null`.

### 6.4 YAML & split views

YAML view is unchanged structurally — just renders the new fields. The
linter (`src/components/YamlEditor.tsx`) keeps working because
`tags` and `tagRoot` parse as plain YAML. No special validation in v1.

## 7. Model operations

All ops live in `src/model/ops.ts` (same module as `addChild`,
`deleteNode`, etc.) and follow the existing immutable-tree convention:
take the document, return a new document or throw `OpError`. Test
fixtures expand `src/model/__tests__/ops.test.ts`.

### 7.1 `tagsAdd(doc, nodeId, names: string[])`

- Validates each name is non-empty after `.trim()` and unique within
  the union of (existing data-node tags) + (every tag-node name).
  Case-insensitive comparison; duplicate-by-name throws.
- For each name **not** already present in the tag tree, appends a new
  child tag-node at the *root* of the tag tree (top-level, ungrouped).
  Existing names are left as-is and just attached to the data-node.
- Adds names verbatim (preserving casing) to `node.tags`.

### 7.2 `tagsRemove(doc, nodeId, names: string[])`

- Removes the listed names from `node.tags` (case-insensitive match).
- Does **not** remove the corresponding tag-node from the tag tree —
  the tag still exists in the user's tag hierarchy; this only severs
  the relationship to this data-node.

### 7.3 `tagDelete(doc, tagNodeId)` — global cascading delete

- Removes the tag-node from the tag tree along with all its descendant
  tag-nodes (one subtree-remove on the tag tree).
- For every data-node in the document, strips every tag-name that
  matches the deleted subtree's set of names. Case-insensitive.
- This is the operation behind scenario #5.

### 7.4 Hierarchy filter view — derived, not stored

The filter view (§5.3) is computed from the existing document at render
time. No new persisted state:

```ts
// src/lib/tagFilter.ts (new)
function buildFilterTree(
  doc: MindDocument,
  filterTagId: string,
): TagFilterTree {
  // 1. Find the selected tag-node and walk its descendants.
  // 2. For each tag-node visited, collect data-nodes whose `tags`
  //    (case-insensitive) include the tag-node's name.
  // 3. Append the "Untagged" pseudo-node carrying every data-node
  //    with empty/absent `tags`.
  // 4. Return a render-only tree (separate type — not MindNode/TagNode)
  //    that the canvas knows how to draw read-only.
}
```

Duplication: a data-node tagged `urgent` and `logistics` shows up under
both tag-nodes. We deliberately duplicate (rather than picking one
"owner") because the whole point of the filter is to surface the tag
relationships explicitly. Rendering each occurrence with the same
`id` plus a tag-scoped suffix keeps React Flow happy.

### 7.5 Tag-tree drag/drop

Reuses `moveNode(doc, id, newParentId)` and `moveSibling(doc, id, dir)`
unchanged — these already operate generically on a tree. The canvas
just needs to know which tree (`root` vs `tagRoot`) the dragged node
belongs to and pass the right subtree pointer.

## 8. File-by-file impact summary

| File | Change |
|------|--------|
| `src/model/types.ts` | Add `MindNode.tags`, `TagNode`, `MindDocument.tagRoot`; bump `SCHEMA_VERSION` to `2`. |
| `src/model/parse.ts` | Read `tags: string[]` on each node; parse `tagRoot`. |
| `src/model/serialize.ts` | Write `tags` (only when non-empty) and `tagRoot`. |
| `src/model/apply.ts` | Add `tags` list sync + `tagRoot` sync to the live YAML AST round-trip. |
| `src/model/ops.ts` | New: `tagsAdd`, `tagsRemove`, `tagDelete`. Existing `moveNode` / `moveSibling` work for tag-tree edits. |
| `src/model/diff.ts` | Track `tags` and tag-tree changes for undo/redo grouping. |
| `src/store/ui.ts` | New: `tagTreeVisible`, `filterTagId`, setters. |
| `src/components/MindMap.tsx` | Conditionally render filter view; hand off to tag-tree pane. |
| `src/components/TagTreePane.tsx` (new) | Second React Flow instance bound to `tagRoot`. |
| `src/components/MindMapNode.tsx` | Render the chip row (§6.1). |
| `src/components/ContextMenu.tsx` | Add "Edit tags…" to the data-node menu; separate menu shape for tag-nodes. |
| `src/lib/tagFilter.ts` (new) | `buildFilterTree`. |
| `src/lib/layout.ts` | Wire tag chip dimensions into node size calculation. |
| `src/i18n/strings.ts` | New labels: "Edit tags…", "Show tags", "Hide tags", "Show nodes under this tag's hierarchy", "Reset filter", "Untagged". |

## 9. Testing strategy

Unit (`src/model/__tests__/ops.test.ts`, `parse.test.ts`,
`serialize.test.ts`, `apply.test.ts`):
- `tagsAdd` adds new tag-tree entries only when missing.
- `tagsAdd` rejects duplicates / blanks / whitespace-only names.
- `tagsRemove` is a no-op when the tag isn't present.
- `tagDelete` cascades to data-nodes and removes descendant tag-nodes.
- Round-trip: doc with tags + tag tree parses, serializes, parses to
  identical structure.
- Empty `tags` and absent `tagRoot` round-trip cleanly (no key emitted).

E2E (new `e2e/tests/tags.spec.ts`):
- Add a tag via context menu → chip appears on the data-node, tag-node
  appears in the tag tree.
- Drag a tag-node onto another → re-parents in YAML.
- "Show nodes under this tag's hierarchy" replaces the canvas with the
  filter view; "Reset filter" restores the original.
- Delete a tag from the tag tree → tag chip removed from every
  data-node that had it (verify via YAML view).
- Toggle "Hide tags" → tag tree pane goes away; data canvas
  still interactable.
- Untagged pseudo-node appears in the filter view when there are
  data-nodes with empty `tags`.

## 10. Phasing

The feature is sizeable. Suggested merge-order:

1. **Phase A — model + YAML.** Types, parse, serialize, apply, ops.
   No UI. Ship as a chore PR — verifies the schema before touching
   render code.
2. **Phase B — data-node tag UI.** Edit tags…, chip row, `T` shortcut.
   Still no tag tree pane.
3. **Phase C — tag tree pane.** Second canvas region, drag/drop,
   rename, delete.
4. **Phase D — hierarchy filter view + reset.** Read-only render of the
   derived tree, plus toggle wiring.
5. **Phase E — polish.** Auto-complete in the tag editor, case-insensitive
   match warnings, keyboard shortcuts for show/hide, accessibility.

Each phase ships independently behind one PR.

## 11. Resolved decisions

These were the open questions in the original draft; recording the
chosen answer here so the doc remains self-contained.

1. **Default visibility of the tag tree pane.**
   Show by default whenever the doc has ≥1 tag. When the doc has
   **no** tags, hide every tag-tree surface entirely (pane, toggle,
   reset chrome). The first `tagsAdd` lazily materializes `tagRoot`
   and the pane appears automatically. See §5.1.

2. **Filter view exportability.**
   Yes — PNG / SVG / PDF export operates on whatever the canvas
   currently renders, so this works for free. Export filename will
   include the selected tag's name so the file is unambiguous (e.g.
   `wedding.tag-urgent.png`). See §5.3.

3. **Multi-tag filter.**
   Out of scope. A filter view roots at exactly one selected tag-node;
   its descendants form the hierarchy. (Not pursuing v2's
   `filterTagId: string | string[]`.)

4. **Per-tag-node colors.**
   Not adding `color` to `TagNode`. Coloring tag-nodes (or the chips)
   would force a "winning color" rule for data-nodes with multiple
   tags and conflict with the user's existing border-color setting.
   Deferred entirely; a richer follow-up is captured in §12 (tag
   highlight fill).

5. **Separate `TagNode` type vs reuse `MindNode`.**
   Separate types, shared helpers. `mapTree`, `findById`,
   `findParent`, `moveNode`, `moveSibling` etc. are rewritten to take
   a generic tree node (`{ id, children }` constraint) so both trees
   reuse them without a casting layer. Keeps the type system honest
   about which fields each tree carries.

6. **Undo granularity for cascading `tagDelete`.**
   Single atomic undo step. `tagDelete` produces one new `MindDocument`
   (tag-tree subtree removed + every affected data-node's `tags`
   filtered) and lands via a single `applyTreeChange`, so the existing
   undo stack treats the cascade as one step.

## 12. Future enhancements (out of scope for v1)

- **Tag highlight fill.** A "highlight by tag" mode where the user
  picks **one** tag and every data-node carrying that tag gets a
  filled background color (distinct from `color`, which the user
  controls on the node's border). Only one tag highlighted at a time
  side-steps the multi-tag-per-node problem entirely; the user toggles
  between tags to see which nodes belong to each. The user's existing
  border color stays untouched, so this composes cleanly with the
  current `color` feature.
- **Tag chip auto-complete.** §6.1 mentions inline auto-complete; v1
  ships with a plain text input and accepts whatever the user types.
  Auto-complete against existing tag names is a Phase E polish.
- **Multi-tag filter** (intersection / union semantics) — see §11.3.
==> we don't need this. 
- **Tag rename propagation.** v1 renames the tag-node only; data-nodes
  carrying the old name would become "orphan" tags (still listed on
  the data-node, no matching tag-node). v1 disables in-place rename
  of tag-nodes that are referenced by ≥1 data-node, falling back to
  delete-and-readd. A future enhancement is to rewrite every
  data-node's `tags` in lockstep so rename works transparently.
