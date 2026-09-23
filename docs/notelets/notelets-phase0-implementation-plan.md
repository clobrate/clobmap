# Notelets — Phase 0 Implementation Plan (Foundation)

Status: **Ready to build** — foundation phase. Branch `feature/notelets`.
Author: Kiran (planned with Claude)
Last updated: 2026-09-22
Parent: [`notelets-implementation-detailed-plan.md`](./notelets-implementation-detailed-plan.md) §6 Phase 0. Product context: [`notelets-product-doc.md`](./notelets-product-doc.md).

---

## Goal

Lay the foundation so later phases are pure feature work:

1. **Notelets is a selectable view** — appears in the toggle, cycles with Cmd+/, renders an (empty) scaffold. No notebook behavior yet.
2. **Shared hooks extracted** from `NotesPopup` (`useMarkdownHtml`, `useNodeNotes`) so Phases 1–2 have one markdown-render and one notes-IO code path — this is what keeps "sidecar/inline invisible and unchanged" a single implementation.
3. **Pure page helpers** (`src/lib/notelets.ts`) with full unit tests.

**Behavior-neutral guarantee:** after Phase 0, every existing feature works exactly as before. The only user-visible change is a new "Notelets" toggle button that opens a placeholder pane. This is deliberately low-risk.

**Explicitly deferred to later phases:** any rendering of pages/sidebar (Phase 1), editing (Phase 2), structural ops (Phase 3), modes/subject-tabs/paging + settings persistence of `noteletsMode` (Phase 4).

## Definition of done for Phase 0

- Selecting "Notelets" shows a placeholder pane; Cmd+/ cycles through it.
- `NotesPopup` runs on the two extracted hooks with **no behavior change** — its existing tests (`NotesPopup.test.tsx`, `e2e/tests/notes-popup.spec.ts`) stay green.
- `src/lib/notelets.ts` helpers exist and are unit-tested.
- `npm test`, `npm run typecheck`, `npm run lint` all green; `npm run e2e` smoke (`views.spec.ts` extended for the 4th toggle) passes.

---

## Work item 1 — View plumbing

### 1a. `src/store/ui.ts`
- Extend the union (line 3):
  ```ts
  export type ViewMode = "yaml" | "mindmap" | "split" | "notelets";
  export type NoteletsMode = "scroll" | "page";   // used later; harmless now
  ```
- Add foundational state (unused by UI until Phase 4, but tested now so the store shape is stable):
  ```ts
  noteletsMode: NoteletsMode;          // default "scroll"
  noteletsPageId: string | null;       // default null
  setNoteletsMode: (m: NoteletsMode) => void;
  setNoteletsPageId: (id: string | null) => void;
  ```
- Extend the `toggleViewMode` cycle array (line 116):
  ```ts
  const order: ViewMode[] = ["yaml", "split", "mindmap", "notelets"];
  ```
  > **Decision to confirm:** cycle order. Proposed `yaml → split → mindmap → notelets`.

### 1b. `src/i18n/strings.ts`
- Add to `strings.view` (after `mindmap`, line 18):
  ```ts
  notelets: "Notelets",
  cycleHint: "Cycle view (YAML → Split → Mind-map → Notelets)",   // update existing
  ```

### 1c. `src/components/ViewToggle.tsx`
- Add to the local `tabs` array (line 3), matching the existing pattern:
  ```ts
  { value: "notelets", label: "Notelets" },
  ```
- **Mobile:** unlike `split` (hidden on phones, line 22), leave Notelets **visible on mobile** — it's a read-first surface. No `mobileHidden` for it. (Layout for small screens is a Phase-4 task.)

### 1d. `src/components/Notelets.tsx` (new — placeholder)
```tsx
export function Notelets() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500">
      Notelets view — coming soon
    </div>
  );
}
```

### 1e. `src/App.tsx`
- Import `Notelets`.
- Add a render branch alongside the others (after the `split` block, ~line 598):
  ```tsx
  {viewMode === "notelets" && (
    <div className="flex-1">
      <Notelets />
    </div>
  )}
  ```

## Work item 2 — Extract shared hooks from `NotesPopup` (behavior-neutral refactor)

Do this carefully; the goal is **zero behavior change**. `NotesPopup.test.tsx` + `notes-popup.spec.ts` are the regression gate.

### 2a. `src/lib/useMarkdownHtml.ts` (new)
Lift from `NotesPopup.tsx:144-163` (lazy micromark render + cancellation) and `:359-367` (safe external-link click). Signature:
```ts
export function useMarkdownHtml(content: string): {
  html: string;
  onLinkClick: (e: React.MouseEvent<HTMLElement>) => void;
};
```
- Keeps micromark default (raw HTML disabled → escaped/inert), matching the product decision.
- `onLinkClick` routes http/https/mailto through `openExternal`, strips others.

### 2b. `src/lib/useNodeNotes.ts` (new)
Lift the load/edit/save/auto-save state machine from `NotesPopup.tsx:96-238`:
```ts
export function useNodeNotes(nodeId: string): {
  content: string;
  setContent: (s: string) => void;
  save: (opts?: { closeAfter?: boolean }) => Promise<void>;
  saving: boolean;
  isDirty: boolean;
  readOnly: boolean;
  overLimit: boolean;
  message?: string;
  loaded: boolean;
};
```
- Encapsulates: `loadNotes` on mount (keyed by nodeId), dirty vs `savedContent`, 1s debounced auto-save via `saveNotes` → `updateNode` → `applyTreeChange`, read-only + over-limit rules. **This is the single notes-IO path** for both the popup and (later) Notelets pages.

### 2c. Migrate `NotesPopup.tsx`
- Replace its inline render effect with `useMarkdownHtml`.
- Replace its load/save/auto-save internals with `useNodeNotes`.
- Keep the popup's own concerns (geometry, font zoom, resize handle, edit/preview toggle, double-click-to-edit mapping) in the component — those are popup-specific, not shared.
- **Verify:** `NotesPopup.test.tsx` and `notes-popup.spec.ts` pass unchanged. If a test needs editing, that's a signal behavior drifted — investigate before changing the test.

## Work item 3 — Pure page helpers

### 3a. `src/lib/notelets.ts` (new)
```ts
import type { MindNode } from "../model";

export interface PageEntry { node: MindNode; depth: number; subjectId: string | null; }

/** Depth-first page order — mirrors exportActions.ts:227-232 visit(). Root is depth 0. */
export function flattenPages(root: MindNode): PageEntry[];

/** Subjects = the root's direct children. */
export function subjectsOf(root: MindNode): MindNode[];

/** Next/prev page id in depth-first order; null at the ends. */
export function nextPageId(pages: PageEntry[], currentId: string): string | null;
export function prevPageId(pages: PageEntry[], currentId: string): string | null;
```

### 3b. `src/lib/__tests__/notelets.test.ts` (new)
Cover: depth-first order + depth values; `subjectId` attribution; `subjectsOf`; paging at first/last/single-node/unknown-id; deep (infinite-depth) nesting. `src/lib/**` is in the coverage scope (`vitest.config.ts:22`), so keep these thorough.

## Work item 4 — Store test upkeep

### 4a. `src/store/__tests__/ui.test.ts`
- Add the new fields to the `beforeEach` reset block (after `availableUpdate`, ~line 28): `noteletsMode: "scroll", noteletsPageId: null`.
- Add tests: `setViewMode("notelets")`; `toggleViewMode` cycles through all four in order; `setNoteletsMode` / `setNoteletsPageId`.

> **Not in Phase 0:** `settings.ts` persistence of `noteletsMode` and its `App.tsx` hydration — deferred to Phase 4 when the mode toggle UI actually exists, to avoid persisting a preference nothing can set yet.

## Task checklist

- [ ] `ui.ts`: union + `NoteletsMode` + state fields + setters + cycle array
- [ ] `strings.ts`: `view.notelets` + updated `cycleHint`
- [ ] `ViewToggle.tsx`: add entry (visible on mobile)
- [ ] `Notelets.tsx`: placeholder component
- [ ] `App.tsx`: import + render branch
- [ ] `useMarkdownHtml.ts` + migrate NotesPopup render
- [ ] `useNodeNotes.ts` + migrate NotesPopup IO
- [ ] `notelets.ts` helpers + `notelets.test.ts`
- [ ] `ui.test.ts`: reset block + new-field tests
- [ ] `views.spec.ts`: assert the 4th toggle appears + cycles (smoke)
- [ ] `npm run typecheck && npm run lint && npm test` green
- [ ] `npm run e2e` (at least `views.spec.ts` + `notes-popup.spec.ts`) green

## Test plan

| Level | What | Where |
|---|---|---|
| Unit | `flattenPages` / `subjectsOf` / paging | `src/lib/__tests__/notelets.test.ts` (new) |
| Unit | store: notelets view + mode fields + toggle cycle | `src/store/__tests__/ui.test.ts` |
| Unit (regression) | NotesPopup still behaves after hook extraction | `src/components/__tests__/NotesPopup.test.tsx` |
| e2e (smoke) | Notelets toggle appears, activates, Cmd+/ cycle includes it | extend `e2e/tests/views.spec.ts` |
| e2e (regression) | notes popup unchanged | `e2e/tests/notes-popup.spec.ts` |

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Hook extraction subtly changes popup behavior (auto-save timing, read-only, over-limit) | Extract mechanically; run popup unit + e2e before/after; don't edit tests to "make them pass" |
| Cmd+/ cycle order surprises users | Confirm order first; single-line change if wrong |
| `toggleViewMode` array + tests drift out of sync | Update `ui.test.ts` in the same commit |
| Placeholder pane looks broken/unfinished to users mid-development | It's behind an opt-in toggle; acceptable on a feature branch. Keep copy neutral ("coming soon") |

## Suggested commits

1. `feat(notelets): add notelets view mode plumbing + placeholder pane`
2. `refactor(notes): extract useMarkdownHtml + useNodeNotes from NotesPopup`
3. `feat(notelets): add pure page helpers (flattenPages/subjectsOf/paging) + tests`

Each commit should leave the suite green.
```
