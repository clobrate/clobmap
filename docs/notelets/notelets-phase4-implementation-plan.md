# Notelets — Phase 4 Implementation Plan (One-page mode, Subject tabs, paging, mobile)

Status: **Ready to build** — all scope decisions confirmed (2026-09-25). Depends on Phases 0–3 (complete). Branch `feature/notelets`.
Author: Kiran (planned with Claude)
Last updated: 2026-09-25
Parent: [`notelets-implementation-detailed-plan.md`](./notelets-implementation-detailed-plan.md) §6 Phase 4. Prior: [`notelets-phase3-implementation-plan.md`](./notelets-phase3-implementation-plan.md). Product: [`notelets-product-doc.md`](./notelets-product-doc.md) §6.2.

---

## Goal

Deliver the last of the notebook metaphor: a **two reading modes** toggle (continuous **scroll** ↔ **one page at a time**), **Subject tabs** across the top (the "five subjects"), keyboard **paging**, and a real **mobile layout**. After this phase the product-doc behavior is fully delivered.

## What Phases 0–3 already give us (reuse, don't rebuild)

- **State (seeded in Phase 0, still unused):** `noteletsMode: "scroll" | "page"` and `noteletsPageId: string | null` in `src/store/ui.ts`, with `setNoteletsMode` / `setNoteletsPageId`. Phase 4 finally wires them.
- **Pure helpers:** `subjectsOf(root)` (the Subjects = root's children), `nextPageId` / `prevPageId` (depth-first paging), `flattenPages` (each `PageEntry` already carries `subjectId`), all in `src/lib/notelets.ts`, 100% tested.
- **Container:** `Notelets.tsx` owns the two-pane layout, the flattened `pages`, scroll-spy, click-to-scroll, editing coordination, and undo. We add a toolbar + a mode branch.
- **Settings:** persistence of `noteletsMode` was explicitly **deferred from Phase 0 to here** (`settings.ts`).
- **Mobile baseline:** the sidebar is already `hidden sm:block`; Phase 4 replaces "hidden" with a real drawer/picker.

## Scope decisions (please confirm the flagged ⚠️)

1. ⚠️ **Paging keys.** Recommendation: **`←` / `→`** page prev/next when focus is in the page area (plus always-visible Prev/Next buttons). The sidebar keeps `↑`/`↓` for row navigation (which, in page mode, also changes the shown page since page = selected node). **Confirm keys: `←`/`→` (recommended) vs `PageUp`/`PageDown`.**
==> OK, go with recommended proposal.
2. ⚠️ **Paging at the ends: stop (recommended), not wrap.** Prev disabled on the first page, Next on the last. Predictable; matches most readers. **Confirm stop vs wrap.**
==> OK, go with recommended proposal.
3. ⚠️ **Mobile sidebar.** Recommendation: a **drawer** — a `☰` button reveals the full ToC as an overlay; the Subject tabs + paging are the always-visible quick nav. **Confirm drawer (recommended) vs top page-picker dropdown.**
==> OK, go with recommended proposal.
4. ⚠️ **Default mode on mobile: page mode (recommended).** One page at a time reads better on a phone; desktop defaults to scroll. (Both remain switchable.) **Confirm.**
==> OK, go with recommended proposal.
5. **Root page in the Subject tabs.** The Subjects are `root.children`; the **root itself is a page too**. A leading **"Overview"** tab (the doc title) selects the root page, so it's reachable in both modes. Root is also always reachable via the sidebar row and by paging to the first page.

## Definition of done

- A **mode toggle** (scroll ↔ page) in a Notelets toolbar; the choice **persists** across launches.
- **Scroll mode** = today's behavior (all pages + scroll-spy).
- **Page mode** shows one page with **Prev/Next** controls + keyboard paging; the active page is announced for screen readers; scroll-spy is inert.
- **Subject tabs** across the top: click to jump to a subject (scroll) / switch to it (page); the active tab reflects the current subject in both modes; an "Overview" tab reaches the root.
- **Mobile:** single-column; the ToC is reachable (drawer/picker); Subject tabs + paging work; editing + restructuring still available.
- Selection stays in sync across modes and the other views; editing (Phase 2) and sidebar restructuring (Phase 3) work in both modes.
- `npm test`, `npm run typecheck`, `npm run lint` green; new unit tests for any pure helpers; new e2e for mode toggle, Subject tabs, paging (stop-at-ends), and mobile.

---

## Work item 0 — Persist `noteletsMode` (settings)

`src/lib/settings.ts`: add a `notelets-mode` key (Tauri store) + `clobmap-notelets-mode` (web), a validator, `loadSettings` field, and a `saveNoteletsModePref`. Hydrate in `App.tsx`'s settings effect (`App.tsx:245`), like `splitOrientation`. Default `"scroll"` on desktop; see decision 4 for mobile.

## Work item 1 — Reading-mode toggle + container branch

- **Toolbar** at the top of the notebook (right pane): Subject tabs on the left (item 3), a small **scroll/page** segmented toggle on the right (reuse the `ViewToggle` styling). Wire to `noteletsMode` / `setNoteletsMode` + `saveNoteletsModePref`.
- **Container branch** in `Notelets.tsx`:
  - `noteletsMode === "scroll"` → current behavior (map `pages` → `NoteletsPage` list + scroll-spy).
  - `noteletsMode === "page"` → render only the **current page** (item 2). Scroll-spy effect is skipped (guard on mode).
- Keep the sidebar identical in both modes.

## Work item 2 — One-page mode

- **Current page** = `noteletsPageId ?? selectedNodeId ?? pages[0].id`. Entering page mode seeds `noteletsPageId` from the selection.
- Render a single `NoteletsPage` for the current page (reuse the component as-is), plus a footer/toolbar with **Prev / Next** buttons (disabled at the ends per decision 2) and a "n / N" position.
- **Keyboard:** `←`/`→` (decision 1) page when the page area has focus → compute via `prevPageId`/`nextPageId`, update both `noteletsPageId` and `selectedNodeId`.
- **Selection sync:** current page ↔ `selectedNodeId`, so the sidebar highlight and other views stay aligned. Selecting a sidebar row in page mode shows that page.
- **a11y:** `announce()` the new page title on change; the page region is labelled and focusable.

## Work item 3 — Subject tabs

- A horizontal, scrollable tab strip: an **"Overview"** tab (root) + one per `subjectsOf(root)`.
- **Active tab:**
  - scroll mode → the `subjectId` of the scroll-spy's active page (from `PageEntry.subjectId`; `null` → Overview).
  - page mode → the current page's `subjectId`.
- **Click:**
  - scroll mode → `scrollToPage(subjectId)` (reuse the container's click-to-scroll).
  - page mode → set current page = that subject's id (the subject node is itself a page).
- Overflow: horizontal scroll on many subjects; on mobile this is the primary nav.

## Work item 4 — Mobile layout

- Replace the sidebar's `hidden sm:block` with a **drawer** (decision 3): a `☰` button in the toolbar toggles the ToC as an overlay (`role="dialog"` / focus-trap-lite), closed by tap-outside / Esc / selecting a row.
- **Subject tabs + paging** are the always-visible mobile nav; default to **page mode** on mobile (decision 4).
- Verify single-column, safe-area insets, and that editing (CodeMirror) + restructuring keys/drag degrade sensibly (structural editing via the drawer'd sidebar).
- Keep it minimal — this is the heaviest item; the goal is "works well on a phone," not a bespoke mobile IA.

## Work item 5 — Tests & polish

- **Unit:** any new pure helper (e.g. `subjectIdOf(pages, id)` if extracted); `settings.ts` round-trip for `noteletsMode`; store fields already covered. Component tests: toolbar toggle flips `noteletsMode`; page mode renders one page; Prev/Next disabled at ends; Subject-tab active state.
- **e2e (`notelets.spec.ts`):** toggle scroll↔page (persists across reload); page mode shows one page; `←`/`→` + Prev/Next page and **stop at the ends**; Subject tab click jumps/switches and reflects active; Overview reaches root; mobile viewport → drawer opens the ToC, Subject tabs navigate, page mode reads full-width.
- **Polish:** i18n for new copy (mode labels, "Overview", Prev/Next, drawer button); a11y (`tablist`/`tab` roles on Subject tabs, announcements); theming.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Mode/subject/paging state sprawl | Keep the single source of truth: current page = `noteletsPageId ↔ selectedNodeId`; derive the active subject from `PageEntry.subjectId` — no duplicate state |
| Scroll-spy running in page mode | Guard the IO effect on `noteletsMode === "scroll"` |
| Subject-tab active flicker during scroll | Reuse the debounced scroll-spy active page; map to its `subjectId` |
| Mobile drawer focus/scroll traps | Keep the drawer simple (overlay + Esc/tap-out); lean on the sidebar's existing roles |
| Paging keys clashing with editing / sidebar | Page keys only when the page area is focused; the CodeMirror editor and rename input own their keys (stopPropagation already in place) |
| Persisted mode surprising on a different device | Persist per the existing settings mechanism; default sensibly per platform (decision 4) |

## Suggested commits

1. `feat(notelets): persist noteletsMode in settings`
2. `feat(notelets): reading-mode toggle + scroll/page container branch`
3. `feat(notelets): one-page mode with Prev/Next + keyboard paging`
4. `feat(notelets): Subject tabs (Overview + per-subject)`
5. `feat(notelets): mobile drawer + page-mode default`
6. `test(notelets): unit + e2e for modes, tabs, paging, mobile`

Each commit should leave the suite green.

## Explicitly deferred (later / optional)

- **Virtualization** of the scroll-mode page list for very large docs → still Phase 5 (measure with `stress-1000.yaml`).
- **Print / export-from-Notelets** (the "All notes" export already exists) → Phase 5.
- Swipe gestures for mobile paging, page-turn niceties — optional, keep it thin (no skeuomorphism, per product §3.3).
- Per-subject "section divider" pages — out of scope; every node is already a page.
