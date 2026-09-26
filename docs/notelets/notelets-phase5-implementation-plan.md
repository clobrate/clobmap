# Notelets — Phase 5 Implementation Plan (Performance, polish & release)

Status: **Proposed** — depends on Phases 0–4 (complete). Branch `feature/notelets`.
Author: Kiran (planned with Claude)
Last updated: 2026-09-26
Parent: [`notelets-implementation-detailed-plan.md`](./notelets-implementation-detailed-plan.md) §6 Phase 5. Prior: [`notelets-phase4-implementation-plan.md`](./notelets-phase4-implementation-plan.md). Product: [`notelets-product-doc.md`](./notelets-product-doc.md).

---

## Goal

Notelets is feature-complete (Phases 0–4). Phase 5 makes it **fast on large documents**, does a **final polish + a11y/i18n pass**, sweeps up the small deferred items, syncs the docs, and **ships it** — version bump + release per `RELEASING.md`, deployed to clobmap.com (Cloudflare Pages).

No new notebook capabilities — this is the "make it solid and release it" phase.

## What Phases 0–4 leave to do here (the deferred backlog)

Collected from every prior plan's "deferred" section:

- **Large-doc performance** — scroll mode mounts *every* page; measure with a 1000-node doc and virtualize / lazy-load if needed. (Phases 1 & 4.)
- **Print / export from Notelets** — the `File → Export → All notes (Markdown)` already covers the content; optionally surface it from the Notelets toolbar. (Phases 1 & 4.)
- **Small UX polish:**
  - Selection cue while renaming a sidebar row (the open thread — the new node *is* selected but shown as the rename input). (Phase 3 / the highlight question.)
  - Reveal-on-add: scroll the page column to a newly added node. (Phase 4 · item 4, deferred.)
  - Optional CodeMirror niceties: fenced-code language highlighting (`markdown({ codeLanguages })`), a bold/italic keymap. (Phase 2.)
  - Swipe gestures for mobile paging. (Phase 4.)
  - Multi-select / bulk move, cut-paste subtree in the sidebar (reuse the canvas clipboard ops). (Phase 3.)
- **a11y audit + i18n sweep** across the whole Notelets surface.
- **Docs consolidation + release.**

## Definition of done

- Notelets opens and scrolls a **1000-node** document without noticeable jank (measured; a target is set and met).
- The a11y pass is done (roles, focus order, announcements verified with a screen reader smoke test); all user-facing copy is in `src/i18n/strings.ts`.
- The chosen small-polish items are shipped; the rest are explicitly logged as future work.
- Docs are consolidated and the CHANGELOG `[Unreleased]` block is cut to a real version.
- Version bumped and released per `RELEASING.md`; production (clobmap.com) serves the notebook.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run e2e` green; coverage thresholds hold.

---

## Work item 0 — Performance baseline (measure first)

Before writing any virtualization, **measure**. Generate a large doc and time Notelets.

- Generate a 1000-node fixture (`node scripts/gen-large-doc.mjs 1000 /tmp/notelets-1k.clobmap.yaml`, or reuse `stress-1000.yaml`).
- Add an e2e perf probe (mirror `e2e/tests/perf.spec.ts`): open Notelets in **scroll mode** with the 1k doc, measure time-to-interactive and a scroll pass; repeat in **page mode** (should be trivially fast — one page).
- **Set a target** (e.g. scroll-mode first paint < ~500 ms, no long tasks > 200 ms while scrolling) and record the baseline.
- **Decision gate:** if scroll mode is fine at 1k, virtualization is **not needed** — stop here and note it. If it janks, do Work item 1.

Cost suspects: 1k `NoteletsPage` mounts, 1k `loadNotes` calls, 1k `useMarkdownHtml`/micromark renders, and the scroll-spy `IntersectionObserver` observing 1k elements.

## Work item 1 — Lazy page content (only if Work item 0 shows a problem)

**Approach: lazy content (DECIDED — 2026-09-26).** Keep *all* page containers mounted (so scroll-spy + click-to-scroll keep working against real elements), but **defer the expensive per-page work** — render each page's heading immediately and only `loadNotes` + render Markdown when the page is near the viewport (a per-page `IntersectionObserver`, or reuse the existing scroll-spy observer). Preserves every Phase 1–4 behavior. Chosen over full windowing (react-window / virtuoso), which would **break scroll-spy and `scrollToPage`** (off-screen elements don't exist) and force a rework of the container's core.

## Work item 2 — Polish, a11y & i18n

- **Rename selection cue (the open thread): DEFERRED to after this release** (user, 2026-09-26). Revisit post-release: make the renaming row read as selected (keep the selected background / a left accent), possibly mirrored to the mind-map. Not in this phase.
- **Reveal-on-add: SKIPPED for 2.0.0** (user, 2026-09-26). The sidebar already selects + focuses the new row; scrolling the page column is a later nicety, not this release.
- **a11y audit:** tab order through toolbar → tabs → pages → sidebar; `announce()` coverage (mode switch, page change already done); drawer focus-trap-lite; screen-reader smoke (VoiceOver/NVDA) on the notebook. Fix what's found.
- **i18n sweep:** grep the Notelets components for any literal user-facing string; move to `strings.ts`.
- **Theming pass:** re-verify `.clobmap-md` + toolbar/tabs/PageNav/drawer in light and dark.

## Work item 3 — Export / print from Notelets (DROPPED for this release)

**Decision (2026-09-26): leave export under `File → Export → All notes (Markdown)`** — no Notelets toolbar shortcut. The capability already exists there; the toolbar stays uncluttered. A dedicated print stylesheet remains out of scope. (Revisit a toolbar shortcut later if in-context discoverability proves worth it.)

## Work item 4 — Docs consolidation + release

- **Docs** were synced per phase; do a final read-through of the README Notelets section, ARCHITECTURE, and manual-testing-guide §18 for consistency, then **cut CHANGELOG `[Unreleased]` → `## [2.0.0] - <date>`**. Version target **2.0.0** (DECIDED — 2026-09-26): a landmark bump for the whole new Notelets view. Note for the changelog: this is a *significance* major bump, not a breaking one — the `.clobmap.yaml` format is unchanged and all prior docs open as-is (call this out so users know it's non-breaking).
- **Version bump:** `npm run version:bump` (per `scripts/bump-version.mjs`) — keeps web + `src-tauri` in lockstep.
- **Release (web + desktop — DECIDED 2026-09-26):** follow `RELEASING.md` verbatim. This release ships **both**:
  - **Web** → `npm run build:web`; Cloudflare Pages redeploys `clobmap.com` on merge to `main`.
  - **Desktop (macOS)** → `npm run tauri:build:mac:both` (arm + intel); handle signing + the **auto-updater manifest** exactly as `RELEASING.md` specifies, so existing desktop users get 2.0.0 via the in-app updater. (Android is out of scope.)
  - Tag the release and attach the desktop artifacts per the documented flow.
- **Pre-release gate:** full `npm test` + `npm run e2e` (single-worker/CI mode) green; `npm run typecheck` + `npm run lint` clean. **Read `RELEASING.md` first and follow it step-by-step** — don't improvise the tag / signing / updater-manifest sequence.

## Test plan

- **Perf:** the new `perf.spec.ts`-style probe (Work item 0) with a target assertion (or a logged baseline if we choose not to gate CI on it — note the flake risk of timing assertions).
- **Lazy content (if built):** e2e that a far-down page's Markdown renders once scrolled to; unit-test any extracted pure helper (e.g. "is page near viewport").
- **Polish:** unit/e2e for the rename cue + reveal-on-add if included.
- **Regression:** full unit + e2e suites green before release.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Timing-based perf assertions flake in CI | Prefer a logged baseline + a generous ceiling; keep hard perf gates out of the parallel suite (mirror how `perf.spec.ts` / the skipped model perf test are handled) |
| Virtualization breaks scroll-spy / paging | Prefer **lazy content** (all containers stay mounted); only window if measurement forces it |
| Lazy note-loading changes scroll-spy element timing | Keep the page container (with `data-page-id`) always rendered; defer only the inner Markdown |
| Release process gaps | Follow `RELEASING.md` verbatim; run the full CI-mode suite as the gate |
| Scope creep in "polish" | Pick a small confirmed set (rename cue + one or two items); log the rest as future work, don't gold-plate |

## Suggested commits

1. `test(notelets): large-doc perf probe + baseline`
2. `perf(notelets): lazy page content for scroll mode` *(only if measured necessary)*
3. `feat(notelets): rename selection cue + <chosen polish>`
4. `docs: finalize Notelets docs; chore: bump version to 2.0.0`
5. `chore(release): 2.0.0` *(per RELEASING.md)*

## Explicitly out of scope (future, if ever)

- Backlinks / transclusion / databases / embeds (product §3.3 — the hard "no").
- A bespoke print stylesheet / PDF-of-notebook (beyond the existing export).
- Rich-text / WYSIWYG editing (Markdown-only stays).
- Android structural-editing mobile IA (Android is out of scope per project memory).
