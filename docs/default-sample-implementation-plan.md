# Default Sample — Implementation Plan

Status: **Proposed** — 2026-09-26. Branch: TBD (suggest `feature/default-sample`).
Author: Kiran (with Claude)
Product doc: [`default-sample-product-doc.md`](./default-sample-product-doc.md) (the *what/why*; this is the *how*).

---

## Goal (recap)

Make the first-paint welcome sample the **techie daily-driver** (`My day` →
Morning Routine / Urgent / Important / To-dos / Meetings, with meeting-notes
pages and a few tags). **Keep the old "Wedding planning" example** — demote
it, don't delete it. Update the hand-authored marketing hero to match.

No engine/schema/feature work. The scope is: one seed swap, a retained
example, an e2e test-fixture migration, a hand-edited landing page, and a
docs sync.

## The crux: why this isn't a one-line change

The e2e suite has **no fixture-loading**. Every interaction spec does
`page.goto("/app/")` with clean storage, so the app boots into
`DEFAULT_YAML` — **the wedding seed *is* the test fixture.** ~18 specs drive
"Our wedding" / "Venue" / "Guests" / "Reception" directly (`canvas.spec`
alone has 63 references; `notelets.spec` 76; `notes-popup.spec` 37).

So swapping `DEFAULT_YAML` naively breaks ~18 specs. The product decision to
**retain the wedding example** gives us the clean fix: keep the wedding YAML
and **seed it as the e2e working document**, so those specs keep passing
unchanged. Only the handful of specs that assert *first-paint* content
switch to the new labels.

Confirmed non-issues (verified 2026-09-26):
- **Unit tests** `NoteletsPage.test.tsx` / `NoteletsPageEditor.test.tsx` use
  `"Venue"` as an arbitrary local label in their own props — **not** the
  seed. No change needed.
- **WelcomeBanner** copy ("A mind map breaks a topic into branches…") is
  static and seed-independent; boot.spec's banner assertions stay valid.

## Approach decision

| Option | Verdict |
|---|---|
| **A. Retain wedding YAML; seed it as the e2e fixture; only first-paint specs change** | ✅ **Chosen** — least churn, honors "keep the example," ~18 specs untouched logically |
| B. Rewrite all ~18 specs to the new techie labels | ❌ 200+ edits, high risk, discards the example's utility |

---

## Work items

### WI-0 — Branch + retain the wedding example
- Create `feature/default-sample` off `main`.
- Extract the current wedding YAML (today `DEFAULT_YAML`, `src/App.tsx:56`)
  into a retained form (do **not** delete — product R1b):
  - **Committed example file:** `examples/wedding-planning.clobmap.yaml`
    (source of truth for humans + the future template gallery), **and**
  - **A shared constant for tests:** export `WEDDING_YAML` from
    `e2e/helpers/fixtures.ts` (string literal identical to the file) so
    specs can seed it without reading disk.
- Rationale for both: the app has **no "open sample" UI** yet, so the file
  is currently repo-only/reference; the constant is what e2e actually uses.

### WI-1 — New first-paint seed in `src/App.tsx`
- Replace `DEFAULT_YAML` (`:56`) with the `My day` content from product-doc
  §6 (5 subjects; `#routine #ops #urgent #important #todo #meeting`; three
  Meetings children carrying `notes` block scalars).
- Update the guiding comment above it (`:42–55`) to describe the new seed and
  keep the design rationale (auto-layout, no positions, concrete-not-abstract).
- `DEFAULT_YAML` is consumed at `:211/213/214` (`parseLiveYaml` → `reset`);
  no wiring change — just new content. Verify it parses (`result.ok`) and
  renders in all four views on launch.

### WI-2 — e2e fixture migration (the main effort)
- Add a seeding helper — `seedDoc(page, yaml)` in `e2e/helpers/mindmap.ts` —
  that writes the wedding doc to `localStorage["clobmap-draft"]` via
  `page.addInitScript` **before** `goto`, so the app boots into it.
  - ⚠️ Match the exact draft shape `saveDraft` writes — **read
    `src/lib/draft.ts` first** and mirror it (don't guess the schema).
- Adopt it in the ~18 interaction specs. Two ways to wire it (pick one):
  - **(preferred) Custom fixture:** `e2e/helpers/fixtures.ts` exports a
    `test` that auto-seeds the wedding draft; specs change their import from
    `@playwright/test` to `../helpers/fixtures`. One-line change per file,
    seeding logic centralized.
  - **(alternative)** add `test.beforeEach(() => seedDoc(page, WEDDING_YAML))`
    per spec — more repetition.
- Specs to migrate (drive default content, must keep seeing wedding):
  `canvas, notelets, notes-popup, layout-mode, reorder, rename, export,
  tabs, tags, tag-filter, tag-highlight, tag-polish, tag-tree, views,
  draft, file-menu, settings` (+ `perf` if it depends on node count).
- **Leave `boot.spec` and `smoke.spec` on plain `test`** (no auto-seed) —
  they test first-paint (see WI-3).

### WI-3 — First-paint assertions → new labels
- `boot.spec.ts` (`:9,16,25`) and `smoke.spec.ts` (`:11,15`) assert
  `nodeByText(page, "Our wedding")` etc. on cold boot. Update these to the
  new root/subjects (`"My day"`, `"Morning Routine"`, …).
- Keep the WelcomeBanner assertions as-is (static copy).
- Optional coverage win: assert a tag chip and a meeting note render on
  first paint (the new seed has both; the old one didn't).

### WI-4 — Marketing hero (`public/landing.html`) — hand-edited
Decoupled from the app (product-doc §2/§10.5). Two hand-authored pieces:
- **(a)** Inline YAML `<pre>` (`~L379–394`): rewrite to the `My day` content
  (trim to what fits the box — likely the subjects + a couple of leaves +
  one meeting, not the whole tree).
- **(b)** Inline `<svg>` tree (`~L398–467`): **redraw** — new `<text>`
  labels *and* new coordinates/connector `<line>`/`<path>` geometry. New
  shape is 5 branches (vs. 4), so re-lay-out rather than relabel. The root
  accent (`fill="#10b981"`) currently on "Wedding" moves to "My day".
  Optional: show one node with a small note/page glyph to hint at Notelets.
- Eyeball against the live hero (light + dark) before merge.

### WI-5 — Docs sync
- `CHANGELOG.md` → `### Changed`: "New welcome sample (techie daily-driver);
  wedding example retained under `examples/`."
- `README.md`: update any first-launch description; confirm it embeds no
  screenshot of the old map (grep — none found so far).
- `docs/manual-testing-guide.md`: fix the first-launch step if it names
  wedding content.
- Product doc already reflects all decisions — no change.

### WI-6 — Verify
- `npm run lint && npm run typecheck && npm test` (unit; expect unchanged).
- `npm run build:web && npm run e2e` (single-worker CI mode as pre-merge
  gate) — the real signal that WI-2/WI-3 landed correctly.
- Launch the app (`npm run dev`) and eyeball first paint in all four views;
  open the retained example file to confirm it still loads.

---

## Test plan

- **Unit:** no new failures expected (seed not referenced). Add a tiny test
  that `DEFAULT_YAML` parses (`parseLiveYaml(DEFAULT_YAML).ok`) and yields
  the expected root text, if not already covered.
- **e2e regression:** full suite green after the fixture migration. This is
  the pass/fail signal for the whole change.
- **e2e first-paint:** `boot`/`smoke` assert the new default content.
- **Manual:** first-launch shows `My day`; Meetings pages render in
  Notelets; tag tree/filter show the new tags; retained wedding example
  opens cleanly.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Seeding-helper draft shape wrong → app ignores it, specs see the new default and fail en masse | Read `src/lib/draft.ts` and mirror `saveDraft`'s exact shape; prove the helper on one spec before rolling out |
| A spec quietly depended on wedding *structure* beyond labels (child counts, positions) | Run the full suite; triage per-spec, don't bulk-assume |
| Hand-drawn `<svg>` misaligns after re-layout | Treat as a re-layout; compare against live hero in both themes |
| `<pre>` YAML too tall for the hero box | Show a trimmed subset (subjects + a few leaves), not the full tree |
| Missed an old-seed reference | `grep -rniE "our wedding|wedding planning|reception|ceremony|venue"` over `src/`, `e2e/`, `public/` before merge |

## Suggested commit sequence

1. `chore: retain wedding sample as examples/ + e2e fixture constant` (WI-0)
2. `feat: techie daily-driver as default welcome sample` (WI-1)
3. `test(e2e): seed wedding doc as fixture; migrate interaction specs` (WI-2)
4. `test(e2e): assert new first-paint content in boot/smoke` (WI-3)
5. `docs(site): redraw landing hero for the new default` (WI-4)
6. `docs: changelog + guides for new welcome sample` (WI-5)

(2–4 may need to land together to keep CI green on any single commit; squash
or order so no commit ships a red e2e run.)

## Out of scope

- Template picker / "New from template" gallery UI (future; the retained
  example is its first entry).
- Any schema/engine change, checkboxes/statuses/reminders (product §4).
- A screenshot-generation pipeline (there are no screenshots — the hero is
  hand-authored HTML/SVG).
