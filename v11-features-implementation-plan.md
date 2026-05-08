# v1.1 features — implementation plan

Five features requested for v1.1. Two of them are tightly related (word wrap +
multi-line text + max sizes). Two are largely independent of the rest
(running notes; free-form positioning). The plan groups them into three
work blocks that can ship as separate releases.

| Block | Features | Estimate |
|---|---|---|
| **A — Text rendering** | Word wrap, multi-line, max width/height | 1 day |
| **B — Running notes** | Markdown notes per node, popup, sidecar files | 2–3 days |
| **C — Free-form positioning** | User-controlled node placement, persisted in YAML | 3–5 days |

Total: ~6–9 days of focused work. Block C is the biggest because it touches
the layout pipeline that the rest of the app depends on.

---

## Block A — Text rendering (word wrap, multi-line, max sizes)

### Goal

Long text is readable inside a node without hover-only truncation. Authors
can write a node label that's a sentence, a paragraph, or a few bullet
points without the canvas hiding it.

### User-facing behavior

- Single-line text continues to render as today.
- Long single-line text **wraps** at the node's max width instead of
  truncating with ellipsis.
- A node can hold **multiple lines** entered with `Shift+Enter` during
  inline rename. The YAML stores them as a YAML literal block scalar
  (`text: |`).
- Each node honors a **max width** (default 280 px) and **max height**
  (default 200 px). Beyond max height, content scrolls or fades to
  ellipsis with a `…` marker.
- App-level defaults are configurable in **⚙ Settings → Layout**.
- Per-node overrides via new optional YAML fields `maxWidth` /
  `maxHeight` (numbers in pixels).

### YAML schema additions

```yaml
- id: n5
  text: |
    A multi-line node.
    Continues here.
  maxWidth: 320      # optional
  maxHeight: 160     # optional
  children: []
```

Backwards compat: nodes without `text` containing newlines render as today.
Nodes without `maxWidth` / `maxHeight` use the app-level defaults.

### Implementation outline

1. **`src/components/MindMapNode.tsx`**
   - Drop the `truncate` class on the text span.
   - Use `whitespace-pre-wrap break-words` to honor newlines and wrap.
   - Apply `max-width` / `max-height` from data (with default fallback).
   - On overflow, add a fade-out gradient at the bottom (CSS only).
2. **`src/components/MindMapNode.tsx` — InlineRename**
   - Replace `<input>` with `<textarea>` that auto-sizes.
   - `Enter` commits, `Shift+Enter` inserts a newline (consistent with
     Slack / Notion / GitHub).
   - `Escape` cancels.
3. **`src/lib/layout.ts`**
   - The current tidy-tree assumes fixed `NODE_WIDTH` / `NODE_HEIGHT`.
     Update to read each node's measured dimensions from a map keyed by
     node id. The map is populated lazily after first render via
     `ResizeObserver` on each node element.
   - First-paint pass uses the node's `maxWidth` / `maxHeight` (or
     defaults) as best-guess dimensions; second pass corrects after
     measurement.
   - Re-runs of `layoutMindMap` are idempotent; no state.
4. **YAML model**
   - `src/model/parse.ts` — accept `maxWidth` / `maxHeight` as numbers
     on each node.
   - `src/model/apply.ts` — preserve them across structural edits.
   - `src/model/serialize.ts` — emit them when set, omit when default.
5. **Settings**
   - Two number inputs in ⚙ for default max width and max height.
   - Persist via existing settings adapter.
6. **Tests**
   - Round-trip: doc with multi-line `text:` → parse → serialize →
     identical YAML.
   - Round-trip with `maxWidth` / `maxHeight` set / unset.
   - Layout produces non-overlapping placements for variable-height
     nodes.

### Risks

- Variable node heights make the tidy-tree's "subtree centering" math
  more involved. Currently we assume each row is `NODE_HEIGHT + ROW_GAP`.
  Variable heights mean the row coordinate is no longer a simple
  multiple of a constant. Solvable but requires careful unit tests.
- `ResizeObserver` adds runtime cost; with 5000 nodes we'd want to
  observe only visible nodes (compatible with `onlyRenderVisibleElements`).

### Estimate

**1 day.** ~half on the layout refactor, ~half on UI / serializer / tests.

---

## Block B — Running notes per node

### Goal

A long-form Markdown notes attachment for any node. Notes persist either
inline in the YAML (small) or as a sidecar `.md` file next to the doc
(large). User accesses notes via right-click, keyboard, or a tiny icon
on nodes that have notes.

### User-facing behavior

- Every node can have a **Notes** field. Empty by default.
- A small note-indicator icon (a square-ish "📝" or a single-character
  glyph — design decision below) appears in the node's right-edge area
  when notes exist. Otherwise no chrome.
- **Three ways to open the notes editor:**
  1. **Right-click → "Edit notes…"** — already-familiar mouse path.
  2. **Keyboard: `N`** while a node is selected. Single keystroke,
     fast, doesn't conflict with anything (`F2` is rename).
  3. **Click the note-indicator icon** on the node.
- The notes editor is a **modal popup** (centered overlay, dim
  background) with:
  - A `<textarea>` for editing Markdown source.
  - Below it, a **live preview pane** that renders the Markdown
    (read-only).
  - **Save** + **Cancel** buttons. **Esc** cancels, **Cmd+Enter**
    saves.
- The popup is read-mode by default if the user clicks the icon /
  keyboard shortcut. Single-click into the textarea switches to edit
  mode.

### Storage strategy

A single YAML field `notes` per node. Its value can be:

1. **Inline content** — when the text doesn't look like a path
   (no leading `./`, `../`, `/`, `~/` and no `.md` extension).
2. **Path link** — when the value starts with `./`, `../`, `/`, or `~/`,
   OR is a single-line string ending in `.md`. Path is interpreted
   relative to the doc's directory (or absolute if leading `/`).

```yaml
# inline (most common)
- id: n5
  text: Spec
  notes: |
    Need to confirm the auth flow with the security team.
    See ADR-014.

# sidecar file
- id: n6
  text: Architecture
  notes: ./.myproject_n6_architecture.md
```

### Auto-extraction to sidecar

**Browser builds (web):** `notes` is always inline. Hard cap at **800
characters**. Above that, the editor refuses to save and shows
"Notes too long for browser builds — install the desktop app to use
sidecar files."

**Desktop builds:** `notes` is inline up to **800 characters**. When
the user saves longer content, clobmap automatically:

1. Generates a filename `.<docBaseName>_<nodeId>_<safeNodeText>.md`
   in the same directory as the doc.
   - `<docBaseName>` strips the `.clobmap.yaml` suffix.
   - `<safeNodeText>` strips filesystem-hostile chars and clamps
     to 32 chars.
   - Leading `.` makes the file hidden on macOS / Linux.
2. Writes the markdown content to that file.
3. Replaces the YAML `notes` value with the relative path
   `./<filename>`.
4. Saves the doc.

If the user **manually** edits the YAML to point `notes` at any
path (with or without `./`), clobmap respects it. **Multiple nodes
can share the same path** — they all read/write the same file
(last-save-wins, no conflict resolution beyond that). This is
intentional: it's how you'd attach a shared spec to two related
nodes.

### iOS

Sidecar files don't work on iOS (security-scoped URLs make sibling-file
writes impossible without a separate picker). On iOS, `notes` is
always inline (800 char cap) — same as the web. Path-link `notes`
values open as **read-only** if the file is in the iCloud doc's
container, otherwise show "Notes file not accessible on iOS."

### Implementation outline

1. **YAML schema**
   - Add `notes?: string` to `MindNode` in `src/model/parse.ts`.
   - Preserve in apply.ts and serialize.ts.
2. **Notes resolver — `src/lib/notes.ts`** (new)
   - `isPathReference(value: string): boolean` — heuristic above.
   - `resolveNotesPath(value: string, docPath: string | null): string | null` —
     resolves relative paths against the doc's directory.
   - `loadNotes(node, docPath): Promise<string>` — returns content,
     reading from sidecar if path-ref, otherwise the inline value.
   - `saveNotes(nodeId, content, docPath): Promise<{ inline: string }>` —
     decides inline vs sidecar, writes the file if needed, returns the
     YAML field's new value for the caller to set on the node.
3. **NotesPopup — `src/components/NotesPopup.tsx`** (new)
   - Modal overlay, dim background, dismiss on outside-click /
     `Esc`.
   - Edit textarea (left) + live Markdown preview (right) on desktop.
     Single-pane (toggle) on mobile.
   - Markdown rendering via a small lib —
     **`marked`** (~30 kB) or **`micromark`** (smaller, more spec-correct).
     Recommend `marked` for simplicity.
   - **Cmd/Ctrl+Enter** saves; **Esc** cancels.
4. **Wiring**
   - `MindMap.tsx` keyboard handler — add `case "n":` opening
     `NotesPopup` for the selected node.
   - `ContextMenu.tsx` — add "Edit notes…" entry between Rename and
     Edit Note (existing tooltip-note item gets renamed to
     "Edit tooltip…" or removed if redundant — see below).
   - `MindMapNode.tsx` — add a tiny note-indicator icon on the
     right edge when `data.hasNotes` is true. Click → open popup.
5. **Settings adjacent decisions**
   - **Existing `note` field (tooltip) vs new `notes` field (markdown)**
     — keep both. `note` stays the hover tooltip, `notes` is the
     popup content. Document both in the YAML format section of
     the README.
6. **Tests**
   - Inline ↔ sidecar round-trip on desktop.
   - 800-char threshold boundary cases.
   - Path-reference detection: `./foo.md`, `../foo.md`,
     `/abs/foo.md`, `~/foo.md`, `notes.md`, multi-line inline that
     happens to mention `foo.md`.
   - Multiple nodes sharing one sidecar — both reads see the latest
     content; concurrent saves last-write-wins (documented).

### Decided

- **Icon style:** small inline SVG of a notepad (consistent across
  platforms; emoji rendering varies between iOS / Linux).
- **Keyboard shortcut:** `N` while a node is selected. Single key,
  fits the existing canvas convention (F2 / Space / Tab / Enter /
  Delete are all bare-key node actions).
- **Markdown library:** `micromark` (strict CommonMark, modular,
  upgrade path to GFM extensions if needed). Lazy-loaded inside the
  NotesPopup so it doesn't ship in the main bundle.

### Recommendations

- **Right-click + `N` shortcut + small icon = all three.** Each
  serves a different user: mouse-driven users use right-click,
  keyboard users press `N`, scanners see the icon to know which
  nodes have notes.
- The icon is the most important of the three because it's the only
  way to **discover** which nodes have notes without opening every
  one.

### Estimate

**2–3 days.** Most of the cost is the popup UI + the inline/sidecar
storage logic + cross-platform handling (web vs desktop vs iOS).
Markdown rendering is one library import.

---

## Block C — Free-form positioning

### Goal

Drop the auto-layout for users who want to manually arrange nodes.
Keep auto-layout as the default and offer a one-click "Reset
layout" button to return to it.

### User-facing behavior

- New canvas mode: **Auto** (current behavior) vs **Manual**.
  - Toggle in the ⚙ menu, persisted per document.
- In **Manual mode**:
  - User drags any node to any position.
  - Position is persisted in the YAML.
  - Auto-layout doesn't run.
  - Adding a child via Tab places it at a sensible offset (e.g. 200 px
    right of the parent) but the user can immediately drag it.
  - **"Reset layout"** button in the canvas controls returns to
    auto-layout (clears all `position` fields).
- In **Auto mode**, today's behavior. Position fields in YAML are
  ignored / stripped on save.

### YAML schema additions

```yaml
title: My map
version: 1
layoutMode: manual    # default: "auto"
root:
  id: n1
  text: Root
  position:           # only meaningful when layoutMode is "manual"
    x: 100
    y: 200
  children:
    - id: n2
      text: Child
      position:
        x: 380
        y: 240
      children: []
```

### Implementation outline

1. **YAML schema**
   - New top-level field `layoutMode: "auto" | "manual"`.
   - New per-node optional `position: { x, y }`.
   - Both round-tripped through parse / apply / serialize.
2. **Layout pipeline**
   - `layoutMindMap` reads the doc's `layoutMode`. If `manual`, it
     skips the tidy-tree pass and uses each node's `position`
     directly. Nodes without a `position` are placed at the
     parent's position + offset (fallback for newly-created nodes).
   - Edges still drawn parent→child as today; their geometry
     follows wherever the user drags.
3. **MindMap.tsx**
   - Currently `onNodeDragStop` either reparents or snaps back. In
     manual mode, drop the snap-back: persist the drag end as the
     new `position`. Reparent-via-drag still works on top of
     drag-then-drop.
   - Tab/Enter for new-node creation: in manual mode, set the new
     node's `position` to a small offset from its parent.
4. **Reset layout**
   - Toolbar button. Confirms ("Reset all manual positions?"),
     then strips every `position` field and switches `layoutMode`
     back to `auto`.
5. **Auto ↔ manual transition**
   - Switching to `manual` from `auto`: capture current
     auto-computed positions and write them as `position` fields,
     so the user starts manual mode at the same visual state.
6. **Tests**
   - Round-trip a doc with `layoutMode: manual` and explicit
     positions.
   - Adding a child in manual mode persists a position.
   - Switching modes preserves visual state.

### Risks

- **Reparent-via-drag and free-form-drag are the same gesture**
  today (drag a node → land on another → reparent). Manual mode has
  to distinguish "drag to position" from "drag onto another node to
  reparent". Solution: drop on a node = reparent (existing path);
  drop on empty space = reposition (new path).
- **YAML noise.** Every node now has a `position: { x, y }` field
  in manual mode. This bloats the file noticeably — for a 100-node
  doc that's ~600 lines of pure coordinates. Mitigations:
  - Only emit `position` when in manual mode (already specified).
  - Consider a more compact form like `pos: [x, y]` (saves ~20%).
- **Block A interaction.** Variable node sizes mean position alone
  isn't enough to know where edges connect; need width/height
  too. Block A's measurement system is reused.

### Estimate

**3–5 days.** Most of the cost: the drag-distinguishing logic, the
reparent-vs-reposition UX, the auto/manual mode toggle, edge cases
around adding/deleting nodes in manual mode.

---

## Phasing

Recommended order:

1. **Block A first** (1 day). Self-contained text-rendering improvements.
   No dependencies on B or C. Ships as **v1.0.x** patch release.
2. **Block B second** (2–3 days). Independent of A but easier to UX-test
   *after* A because nodes that hold a notes-icon should accommodate
   the icon without text being clipped. Ships as **v1.1.0**.
3. **Block C last** (3–5 days). Reuses Block A's variable-size
   measurement and benefits from real-doc testing of A and B before
   we change the layout pipeline. Ships as **v1.2.0**.

If you want to compress: B and C can be parallelized (different files,
different concerns). A must be first because both B (notes icon
placement) and C (drag positioning) assume the variable-size machinery.

## Definition of Done — per-block

| Block | Done means |
|---|---|
| A | Multi-line text round-trips through YAML; long text wraps not truncates; max sizes settable in Settings; round-trip tests pass; manual smoke test on 5000-node fixture still <50 ms edit cycle. |
| B | Right-click / `N` / icon all open the popup; inline ↔ sidecar transition at the 800-char boundary; web rejects above 800; iOS shows read-only message for path-ref notes; 4+ tests covering boundary + path detection + sharing. |
| C | Toggle in Settings; manual drag persists; `Reset layout` works; reparent-on-drop still works; auto ↔ manual transition preserves visual state; documented YAML schema. |

## Out of scope (deliberately)

- Per-node font size / text color (separate ask if needed).
- Markdown rendering for `text` field — only `notes` is markdown.
- Collaborative editing / file locking on shared sidecar files.
- Sync of sidecar files to iCloud / Dropbox — same as the doc itself
  (whatever the user puts the doc in, the sidecar follows).
- A "Notes-only" search / filter view across the whole document.

## Decisions locked

- **Block A — Default max width / height:** 280 × 200 px.
- **Block A — Existing `note` (tooltip) field:** keep alongside the new
  `notes` (markdown popup) field. Non-breaking; the README YAML-format
  section will document both.
- **Block B — Notes icon:** small inline SVG of a notepad.
- **Block B — Keyboard shortcut:** `N` while a node is selected.
- **Block B — Markdown library:** `micromark` (lazy-loaded).
- **Block C — YAML position form:** `position: { x, y }` (object).

## Open decisions before starting Block C

- Reset-layout button placement: in the React Flow Controls (next to
  zoom buttons) or in the ⚙ menu. *Not blocking — can decide when
  Block C starts.*
