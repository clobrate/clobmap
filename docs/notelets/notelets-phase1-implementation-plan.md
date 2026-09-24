# Notelets — Phase 1 Implementation Plan (Read-only Notebook)

Status: **Ready to build** — depends on Phase 0 (complete). Branch `feature/notelets`.
Author: Kiran (planned with Claude)
Last updated: 2026-09-23
Parent: [`notelets-implementation-detailed-plan.md`](./notelets-implementation-detailed-plan.md) §6 Phase 1. Foundation: [`notelets-phase0-implementation-plan.md`](./notelets-phase0-implementation-plan.md). Product: [`notelets-product-doc.md`](./notelets-product-doc.md).

---

## Goal

Turn the Notelets scaffold into a **readable notebook**: a tree sidebar (table of contents) on the left, and the document's notes rendered as a continuous-scroll column of pages on the right. **Read-only** — no editing, no restructuring yet.

This is the concept-proving phase: "outline in the mind-map, read it as a document." Editing arrives in Phase 2, sidebar-as-editor in Phase 3.

## What Phase 0 already gives us (reuse, don't rebuild)

- **View routing** — `viewMode === "notelets"` renders `<Notelets />` (`App.tsx`); `ViewMode` union + toggle done.
- **Page model** — `src/lib/notelets.ts`: `flattenPages(root)` → `PageEntry[]` (depth-first, `depth`, `subjectId`), `subjectsOf`, `nextPageId`/`prevPageId`. 100% tested.
- **Markdown render** — `useMarkdownHtml(content)` → `{ html, onLinkClick }` (micromark + safe external links).
- **Notes reader** — `loadNotes(rawValue, docPath)` in `src/lib/notes.ts` → `{ content, isPathRef, resolvedPath, readOnly, message }`. The **shared reader**; keeps inline/sidecar invisible.
- **Selection state** — `selectedNodeId` / `setSelected` in `src/store/ui.ts`, already shared across YAML / mind-map, so cross-view sync is nearly free.
- **Styling** — `.clobmap-md` markdown CSS (`src/index.css`); `SplitPanes` for a resizable divider.

## Scope decisions for Phase 1

- **Read-only:** render notes; no in-page editor (Phase 2), no `Tab`/`Enter`/drag (Phase 3).
- **Continuous scroll only.** One-page mode + Subject tabs + paging are **Phase 4** (the `noteletsMode`/`noteletsPageId` store fields already exist but stay unused here).
- **Notes loading:** call the shared `loadNotes` directly in the page component (read path). We deliberately **don't** use `useNodeNotes` yet — its save/auto-save/dirty machinery and per-page store subscriptions are unneeded for read-only and would be wasteful across a long scroll. Phase 2 swaps the page onto `useNodeNotes` when editing lands. `loadNotes` is the same shared reader either way, so sidecar/inline stays invisible.
- **Sidebar width:** fixed-width, scrollable TOC (not a resizable split) — simplest correct thing. Resizable/persisted width deferred.
- **Uniform pages:** every node is a page; note-less nodes render as a heading with an empty body (product §6.4). No special-casing.

## Definition of done

- Selecting Notelets shows a sidebar tree of every node + a scrolling column of pages.
- Each page shows the node title as a heading and its notes rendered as markdown; empty nodes are just a heading.
- Clicking a sidebar item scrolls its page into view and selects it.
- Scrolling updates the selected node (scroll-spy); the sidebar highlights it.
- Entering Notelets with a node already selected scrolls to that page.
- Sidecar notes on web/iOS render read-only with the existing message banner; desktop reads the file content.
- Parse-error / empty-doc states are handled (no crash, sensible message).
- `npm test`, `npm run typecheck`, `npm run lint` green; new e2e `notelets.spec.ts` green.

---

## Work item 1 — `Notelets.tsx` container (replace the placeholder)

Replace the Phase 0 scaffold with the real two-pane layout.

- Read `parsedDoc` from the document store.
- **Empty / parse-error guard:** if `!parsedDoc`, show a centered muted message ("No document to show" / "Fix YAML errors to view notes") — don't crash.
- Compute `pages = flattenPages(parsedDoc.root)` (memoized on `parsedDoc.root`).
- Layout: fixed-width left sidebar (`NoteletsSidebar`) + flex-1 right scroll container holding the page list.
- Own the **scroll-spy** + **click-to-scroll** coordination (Work item 4), passing a `scrollToPage(id)` handler to the sidebar and a scroll-container ref to the page list.

```tsx
export function Notelets() {
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);
  if (!parsedDoc) return <NoteletsEmptyState />;
  const pages = useMemo(() => flattenPages(parsedDoc.root), [parsedDoc.root]);
  // ...sidebar + scroll container of <NoteletsPage/> keyed by node.id
}
```

## Work item 2 — `NoteletsSidebar.tsx` (table of contents)

- Render `parsedDoc.root` as a nested tree: `role="tree"` › `role="treeitem"`, indented by depth. (Match the roles the e2e helpers already query.)
- Each item shows `node.text`; clicking calls `setSelected(node.id)` **and** `scrollToPage(node.id)`.
- Highlight the item whose id === `selectedNodeId`.
- **Read-only:** no rename/add/drag affordances in Phase 1.
- Root is the first/topmost item ("Root page"); Subjects are its children, etc.

## Work item 3 — `NoteletsPage.tsx` (one page)

- Props: `{ node: MindNode }`. Root element carries `data-page-id={node.id}` (scroll target + spy hook) and an `id` for `scrollIntoView`.
- Heading: `node.text` (semantic heading; size can scale with depth as a nicety — optional).
- Body: load notes read-only, render markdown.

```tsx
function NoteletsPage({ node }: { node: MindNode }) {
  const docPath = useDocumentStore((s) => s.currentFilePath);
  const [loaded, setLoaded] = useState<LoadedNotes | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadNotes(node.notes, docPath).then((r) => { if (!cancelled) setLoaded(r); });
    return () => { cancelled = true; };
  }, [node.notes, docPath]);
  const { html, onLinkClick } = useMarkdownHtml(loaded?.content ?? "");
  // heading + optional message banner (loaded.message) + .clobmap-md body via dangerouslySetInnerHTML
}
```
- If `loaded.message` (sidecar unreadable on web/iOS) → show the same amber banner style the popup uses.
- Empty content → heading only (optionally a muted "—"/"No notes"; default: nothing, per uniform-treatment decision — flag for design taste).

## Work item 4 — Continuous scroll: scroll-spy + click-to-scroll

The two-way sync, with feedback-loop protection.

- **Scroll-spy:** an `IntersectionObserver` (in `Notelets.tsx` or a `useScrollSpy(containerRef, pageIds, onActive)` hook) watches page elements; the top-most intersecting page becomes active → `setSelected(id)`. Debounce/rAF to avoid thrash.
- **Click-to-scroll:** `scrollToPage(id)` does `el.scrollIntoView({ block: "start" })`. Set a short-lived `programmaticScrollRef` guard so the resulting scroll events don't fight the spy (spy ignores updates while the guard is set).
- **Enter-view sync:** on mount, if `selectedNodeId` is set and present in `pages`, scroll to it once.
- Selecting in Notelets updates the shared `selectedNodeId`, so switching to YAML/mind-map lands on the same node (and vice-versa).

> **jsdom caveat:** `IntersectionObserver` isn't in jsdom, so the spy is validated in Playwright, not Vitest. If it lives in a hook under `src/lib`, add it to the coverage `exclude` list alongside `useLongPress.ts` (same rationale the config already documents), or keep it inside the component (components are out of coverage scope).

## Work item 5 — Polish & integration

- Theming: ensure `.clobmap-md` renders correctly in light/dark inside the pane.
- Mobile: single column — sidebar becomes a collapsible drawer or a top page-picker. **Minimal** for Phase 1 (full mobile polish is Phase 4); at least don't break narrow screens.
- i18n: any new labels (empty-state, banner) go through `src/i18n/strings.ts`.
- a11y: tree roles on the sidebar, headings on pages, `announce()` optional.

## Task checklist

- [ ] `Notelets.tsx`: parsedDoc guard + `flattenPages` + two-pane layout + scroll container
- [ ] `NoteletsEmptyState` (inline or small component)
- [ ] `NoteletsSidebar.tsx`: tree roles, click → select + scroll, selection highlight
- [ ] `NoteletsPage.tsx`: `data-page-id`, heading, `loadNotes` read + `useMarkdownHtml` render + message banner
- [ ] Scroll-spy + click-to-scroll + enter-view sync (+ programmatic-scroll guard)
- [ ] i18n strings for new copy
- [ ] `e2e/tests/notelets.spec.ts` (see test plan)
- [ ] `npm run build:web` then `npm run e2e notelets.spec.ts` green
- [ ] `npm run typecheck && npm run lint && npm test` green

## Test plan

| Level | What | Where |
|---|---|---|
| e2e | Notelets shows sidebar with every node + pages column | `e2e/tests/notelets.spec.ts` (new) |
| e2e | A node's saved notes render as markdown in its page | new spec (seed a doc with notes, or add notes via popup first) |
| e2e | Clicking a sidebar item scrolls to + selects that page | new spec |
| e2e | Scrolling updates the selected node (spy) | new spec |
| e2e | Select a node in mind-map → switch to Notelets → its page is in view | new spec (selection sync) |
| e2e | Note-less node renders as a heading (empty body, no crash) | new spec |
| e2e | Empty/parse-error doc shows the empty state, not a blank/crash | new spec |
| unit | `flattenPages`/paging | already covered (`notelets.test.ts`) |
| unit (opt.) | Sidebar renders the tree from a seeded doc (jsdom + RTL) | `NoteletsSidebar.test.tsx` |

> e2e runs against the built bundle — **`npm run build:web` before `npm run e2e`.** New helpers go in `e2e/helpers/` (extend `mindmap.ts`); consider a `notelets.ts` helper for `page.getByRole("treeitem")` within the Notelets pane and a `data-page-id` locator.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Scroll-spy ↔ click-scroll feedback loop | `programmaticScrollRef` guard; rAF/debounce the spy |
| `IntersectionObserver` absent in jsdom | Validate spy in Playwright; unit-test only pure logic |
| Many async `loadNotes` on big docs (esp. desktop sidecar reads) | Accept for Phase 1; virtualize + lazy-load off-screen pages in Phase 5. `log`/note the cost, no silent cap |
| Markdown render cost per page | micromark import is cached after first; fine at Phase-1 scale |
| Read-only accidentally exposes an edit path | No editor mounted; assert in e2e that pages aren't editable |
| Selection thrash re-scrolling the mind-map when spy fires | Only update `selectedNodeId`; don't drive canvas centering from Notelets |

## Suggested commits

1. `feat(notelets): read-only notebook — sidebar TOC + page list scaffold`
2. `feat(notelets): render node notes as markdown pages (shared loadNotes + useMarkdownHtml)`
3. `feat(notelets): scroll-spy + click-to-scroll selection sync`
4. `test(notelets): e2e coverage for the read-only notebook`

Each commit should leave the suite green.

## Explicitly deferred (later phases)

- In-page markdown **editing** → Phase 2 (swap page onto `useNodeNotes`).
- Sidebar **restructuring** (`Tab`/`Enter`/rename/drag/delete) → Phase 3.
- **One-page mode**, **Subject tabs**, keyboard **paging**, full mobile layout → Phase 4.
- **Virtualization**, large-doc perf, print/export-from-Notelets → Phase 5.
