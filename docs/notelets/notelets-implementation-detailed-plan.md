# Notelets — Detailed Implementation Plan

Status: **Proposed** — engineering plan for the Notelets view. Not yet implemented. Work on branch `feature/notelets`.
Author: Kiran (planned with Claude)
Last updated: 2026-09-22
Companion to: [`notelets-product-doc.md`](./notelets-product-doc.md) (product definition — read that first for scope & decisions).

---

## 1. Scope recap (the constraints this plan must honor)

From the product doc, the decisions that shape the engineering:

- **Fourth first-class view** next to YAML / Split / Mind-map — a view toggle, not new data.
- **Everything is a page.** Every node (Root → Subject → Page → Child Page → …) is a page that can carry markdown notes. **Infinite depth**, mirroring the existing node tree.
- **Sidebar = navigation + structural editor** (`Tab` / `Enter` / drag / rename), reusing existing tree ops.
- **Two reading modes:** continuous scroll (default) and one-page-at-a-time with keyboard paging.
- **Uniform node treatment:** note-less nodes render as an empty page with a heading. No special-casing.
- **Faithful standard markdown** (images, links, GFM); **raw HTML is not rendered** (shown inert/as code).
- **Storage unchanged:** inline notes + sidecar `.md` files both keep working; the inline/sidecar split stays invisible.
- **Thin:** markdown editing only — no backlinks/databases/embeds/WYSIWYG.

## 2. Architecture touchpoints — what exists and what we reuse

The good news: Notelets is mostly a **new lens over infrastructure that already exists**. Nothing in the data model changes.

| Concern | Already exists | Reuse strategy |
|---|---|---|
| View switching | `ViewMode` in `src/store/ui.ts:3`; `ViewToggle.tsx`; render branches in `App.tsx:553-598`; `toggleViewMode` cycle `ui.ts:114-119` | Add `"notelets"` to the union + one render branch + toggle entry |
| Document tree + edits | `useDocumentStore` (`store/document.ts`), `applyTreeChange` re-serializes YAML preserving comments (`document.ts:96`) | Notelets reads `parsedDoc`, writes via `applyTreeChange` — gets undo/redo + dirty + autosave for free |
| Tree operations | `model/ops.ts`: `addChild`, `addSibling`, `deleteNode`, `updateText`, `updateNode` (notes patch at `ops.ts:187`), `moveNode`, `moveSibling`, `duplicateNode`; `idGeneratorForDocument` | Sidebar editor calls these exactly like `MindMap.tsx:442-460` does |
| Notes load/save (inline + sidecar) | `lib/notes.ts`: `loadNotes`, `saveNotes`, `NOTES_INLINE_LIMIT`, sidecar auto-extract | Extract the popup's IO into a shared hook; Notelets pages reuse it verbatim |
| Markdown → HTML | `NotesPopup.tsx:144-163` lazy-loads `micromark`, renders into `.clobmap-md` (CSS `src/index.css:43+`), escapes raw HTML, external-link handoff (`NotesPopup.tsx:359-367`) | Extract into a shared render hook; Notelets pages reuse it |
| Depth-first page order | `exportActions.ts:227-232` (`exportAllNotes` visit) already flattens the tree depth-first and calls `loadNotes` per node | Same traversal; factor into a pure `flattenPages()` for reuse + tests |
| Selection state | `selectedNodeId` / `setSelected`, `editingNodeId` / `setEditing` in `ui.ts` — already shared across all views | Notelets binds to the same selection → cross-view sync is nearly free |
| Keyboard add-node reference | `MindMap.tsx:439-465` (Tab=addChild, Enter=addSibling, select+edit+reveal) | Mirror this exact pattern in the sidebar |
| Multi-tab | `store/tabs.ts` snapshots the document store | Notelets reads the live document store → per-tab correctness is automatic |

## 3. State & data-model changes

**No `MindNode` / `MindDocument` changes.** All additions are UI state.

### 3.1 `src/store/ui.ts`
```ts
export type ViewMode = "yaml" | "mindmap" | "split" | "notelets";   // + notelets
export type NoteletsMode = "scroll" | "page";                        // new

interface UIState {
  // ...
  noteletsMode: NoteletsMode;                 // default "scroll"
  noteletsPageId: string | null;              // current page in page-mode; null → follow selectedNodeId
  setNoteletsMode: (m: NoteletsMode) => void;
  setNoteletsPageId: (id: string | null) => void;
}
```
- Extend the `toggleViewMode` cycle array (`ui.ts:116`) to `["yaml", "split", "mindmap", "notelets"]` (confirm desired Cmd+/ order).
- `noteletsMode` persists via settings (see §3.3).
- Page-mode "current page" reuses `selectedNodeId` where possible; `noteletsPageId` only disambiguates when selection and viewed-page must differ.

### 3.2 `src/lib/notelets.ts` (new — pure helpers, unit-tested)
```ts
export interface PageEntry { node: MindNode; depth: number; subjectId: string | null; }
export function flattenPages(root: MindNode): PageEntry[];   // depth-first, mirrors exportAllNotes visit()
export function subjectsOf(root: MindNode): MindNode[];      // root.children
export function nextPageId(pages, currentId): string | null; // paging
export function prevPageId(pages, currentId): string | null;
```
Pure functions → cheap, high-value Vitest coverage (model/lib is in the coverage scope, `vitest.config.ts:22`).

### 3.3 `src/lib/settings.ts`
Persist `noteletsMode` (like `splitOrientation`). Hydrate in `App.tsx`'s settings effect (`App.tsx:245-256`).

## 4. Shared extractions (prep so Notelets and the popup don't diverge)

Two hooks lifted out of `NotesPopup.tsx` before building Notelets — this is refactor-first, behavior-neutral:

1. **`src/lib/useMarkdownHtml.ts`** — lazy `micromark` render + cancellation (from `NotesPopup.tsx:144-163`) and the safe external-link click handler (`:359-367`). Returns `{ html, onPreviewClick }`. `NotesPopup` switches to it (no behavior change); Notelets pages consume it.
2. **`src/lib/useNodeNotes.ts`** — the load/edit/save/auto-save state machine (`NotesPopup.tsx:96-238`): `loadNotes` on mount, dirty tracking vs `savedContent`, 1s debounced `saveNotes` → `updateNode` → `applyTreeChange`, read-only/over-limit handling. Returns `{ content, setContent, save, saving, isDirty, readOnly, message, overLimit }`. Both the popup and Notelets in-page editors use it → one code path for sidecar/inline, one place for platform rules.

> Doing these first keeps the "storage invisible / sidecar unchanged" guarantee real: there is literally one IO implementation.

## 5. Cross-cutting concerns

- **Infinite depth / every node a page:** `flattenPages` recurses with no depth cap; the sidebar renders the full tree; every node gets a page + optional notes body. Root is "Root page."
- **Selection sync (both directions):** clicking a sidebar item or scrolling a page into view → `setSelected(id)`; entering Notelets with a node already selected → scroll/open that page. Uses the shared `selectedNodeId`, so YAML/mind-map/Notelets stay in lockstep (satisfies product §6.6).
- **Dirty / undo / autosave:** all edits route through `applyTreeChange`, so window-title dirty dot, undo stack (`document.ts:96-112`), draft persistence, and debounced disk save (`App.tsx:292-299`) all work unchanged.
- **Raw HTML:** keep `micromark` default (HTML disabled → escaped/inert). Optional nicety: detect raw-HTML lines and fence them as code for clarity — deferrable; the safe default already satisfies the decision.
- **Platform / read-only:** on web + iOS, sidecar path-refs are read-only (`notes.ts:132-149`). Notelets shows the resolved content read-only with the existing `message` banner; editing is disabled for those pages, matching the popup.
- **Mobile:** Split is desktop-only (`ViewToggle.tsx:22`); decide whether Notelets shows on phones. Recommendation: **show it** (single-column: sidebar collapses to a drawer / top page-picker), since a read-focused view suits mobile. Flag as a Phase-4 layout task.
- **a11y:** sidebar is a `tree`/`treeitem` (reuse patterns from tag tree + mind-map `treeitem` roles the e2e helpers already query); pages get heading semantics; paging buttons labelled; `announce()` for mode changes.
- **i18n:** all new labels go through `src/i18n/strings.ts`.

## 6. Phased implementation

Each phase is independently shippable and testable. Order matches product doc §11.

### Phase 0 — Plumbing + shared extractions (foundation)
**Goal:** Notelets exists as a selectable view (read-only stub) and shared hooks are in place.
- Add `"notelets"` to `ViewMode`; add toggle entry in `ViewToggle.tsx`; add render branch in `App.tsx` rendering a placeholder `<Notelets />`.
- Extend `toggleViewMode` cycle; wire Cmd+/ ordering.
- Extract `useMarkdownHtml` + `useNodeNotes`; migrate `NotesPopup` onto them (prove no regression via existing NotesPopup tests, `NotesPopup.test.tsx` + `notes-popup.spec.ts`).
- Add `src/lib/notelets.ts` with `flattenPages`/`subjectsOf`/paging + unit tests.
- **Exit:** selecting "Notelets" shows an empty scaffold; `npm test` green (incl. unchanged popup tests); no visual regressions elsewhere.

### Phase 1 — Read-only Notelets (proves the concept)
**Goal:** the notebook renders.
- `src/components/Notelets.tsx` — two-pane layout (sidebar + main), reuse `SplitPanes` for the divider.
- `src/components/NoteletsSidebar.tsx` — renders the tree from `parsedDoc.root` as a nav TOC; click → `setSelected` + scroll to page. Collapsible nodes (reuse `collapsed` field semantics is optional here).
- `src/components/NoteletsPage.tsx` — one node → heading (`node.text`) + markdown body via `useMarkdownHtml`, loading notes via `loadNotes` (read-only render path). Empty nodes = heading + empty body (uniform).
- Continuous-scroll mode: map `flattenPages()` → list of `NoteletsPage`. Scroll-spy updates `selectedNodeId`.
- **Reuse:** the `exportAllNotes` traversal + `loadNotes` per node is essentially this, minus concatenation.
- **Edge cases:** parse-error state (no `parsedDoc`) → show last-good or an empty-state message; very large docs (virtualize later, note it); sidecar read-only banner.
- **Tests:** `e2e/tests/notelets.spec.ts` — switch to view, see subjects/pages, notes render, empty pages present; Vitest for `flattenPages`.
- **Exit:** a user can read a whole map as a scrolling document; selection syncs from the sidebar.

### Phase 2 — In-page markdown editing
**Goal:** write directly in a page body.
- `NoteletsPage` gains an editor using `useNodeNotes(nodeId)`: CodeMirror (consistent with YAML view / product §6.7) or textarea+preview parity with the popup. **Recommendation:** reuse the same editor stack as `YamlEditor.tsx` (CodeMirror) for consistency; markdown mode.
- Edit ↔ rendered toggle per page, or inline edit-on-focus (decide during build; default: click body → edit, blur → render, mirroring popup ergonomics).
- Auto-save (1s debounce) + over-limit / sidecar behavior all come from `useNodeNotes` → identical to popup, incl. desktop sidecar auto-extract.
- **Edge cases:** read-only pages (web/iOS sidecar) disable editing with the banner; concurrent edits with the popup open on the same node (shared store keeps them consistent).
- **Tests:** e2e — edit a page, YAML reflects it; over-limit on web; sidecar round-trip on desktop (mirror `notes-popup.spec.ts` assertions).
- **Exit:** Notelets is a working read+write surface.

### Phase 3 — Sidebar as a structural editor
**Goal:** restructure without leaving Notelets.
- Keyboard in the sidebar, mirroring `MindMap.tsx:439-465`: `Tab` → `addChild`, `Enter` → `addSibling`, `F2`/dblclick → rename (`updateText`), `Delete` → `deleteNode`, arrow nav (reuse `lib/navigation.ts`).
- Drag to re-parent/reorder: `moveNode` / `moveSibling` (same semantics as `MindMap.tsx:311`, `:518`). Reuse the existing drag affordances/tests as a template (`reorder.spec.ts`, `move-subtree-drag`).
- Inline rename component (share with mind-map's rename if practical).
- **Edge cases:** can't delete root; drag-into-own-descendant guarded by `moveNode` already; keep selection/edit/reveal behavior identical to canvas.
- **Tests:** e2e — Tab/Enter add nodes from sidebar; drag reorder; rename; delete; YAML + mind-map reflect changes.
- **Exit:** the sidebar is a full lightweight outliner.

### Phase 4 — One-page mode, Subject tabs, paging
**Goal:** the five-subject metaphor + focused reading.
- Mode toggle (`noteletsMode`): scroll ↔ page. Persist via settings.
- **Subject tabs:** `subjectsOf(root)` across the top; selecting a subject scopes/scrolls. Root page reachable too.
- One-page mode: render only the current page; keyboard next/prev via `nextPageId`/`prevPageId` (depth-first order); buttons + shortcuts; `announce()` page changes.
- Mobile layout: sidebar → drawer / top picker; verify single-column.
- **Tests:** e2e — toggle modes, subject tab switching, keyboard paging wraps/stops correctly.
- **Exit:** full product-doc behavior delivered.

### Phase 5 — Polish, docs, release
- Empty-state, large-doc virtualization decision (measure with `stress-1000.yaml`; `perf.spec.ts` style check), theming pass (light/dark via `.clobmap-md`), a11y audit, i18n sweep.
- **Docs sync (per project convention — README treated as living docs):** update `README.md`, `CHANGELOG.md`, `ARCHITECTURE.md`, `docs/manual-testing-guide.md`, and the getting-started/how-to as needed.
- Version bump + release per `RELEASING.md`.

## 7. Testing strategy

Mirror the existing split (`vitest.config.ts` + `playwright.config.ts`):

- **Vitest (unit):** `src/lib/__tests__/notelets.test.ts` — `flattenPages` order/depth, `subjectsOf`, paging edges (first/last/single-node/empty). Store additions in `src/store/__tests__/ui.test.ts`. Extracted hooks: keep `NotesPopup.test.tsx` green as the regression gate; add focused tests for `useNodeNotes` if feasible (jsdom, like `NotesPopup.test.tsx`).
- **Playwright (e2e):** new `e2e/tests/notelets.spec.ts` (+ helpers in `e2e/helpers/`, extending `mindmap.ts`). Cover: view toggle appears/cycles (extend `views.spec.ts`); read render; in-page edit → YAML; sidebar Tab/Enter/rename/drag/delete; scroll↔page + subject tabs + paging; sidecar read-only on web build. Add `retries` if the WebKit render-timing flake pattern shows up (see the tabs.spec flake we already hit).
- **Typecheck/lint:** `npm run typecheck` (incl. e2e tsconfig) + `npm run lint` each phase.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Duplicating notes IO → sidecar behavior drifts from popup | **Extract shared hooks in Phase 0**; one implementation |
| Large docs (1000+ nodes) render slowly in scroll mode | Measure early (`stress-1000.yaml`); virtualize page list in Phase 5 if needed; `log`-style perf note, no silent cap |
| Scroll-spy ↔ selection feedback loops | Debounce scroll-spy; guard against setSelected re-scroll thrash |
| Sidebar editor subtly diverges from canvas semantics | Reuse the exact `model/ops.ts` calls + `lib/navigation.ts`; e2e asserts parity |
| WebKit e2e render-timing flakes (seen in tabs.spec) | Poll-for-visible helpers; add Playwright `retries` |
| Mobile cramping | Single-column drawer layout; treat mobile as read-first |

## 9. Deferred / open (non-blocking)

- Raw-HTML-as-fenced-code niceties (default escaping already safe).
- Virtualization (only if perf demands).
- Collapse/expand persistence in the sidebar (could reuse `collapsed`).
- Print / export-from-Notelets (the All-notes export already exists; a "print this notebook" could come later).

## 10. Definition of done

- Notelets is the 4th view toggle; Cmd+/ cycles it.
- Read + write markdown per node; sidecar + inline both work, invisibly.
- Sidebar restructures the tree (Tab/Enter/rename/drag/delete) with canvas-parity.
- Scroll + one-page modes, subject tabs, keyboard paging.
- Selection syncs across all views.
- `npm test`, `npm run e2e`, `npm run typecheck`, `npm run lint` green.
- Docs synced; released per `RELEASING.md`.
```
