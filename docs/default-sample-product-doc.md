# Default Sample Document — Techie's Daily Driver (Product Doc)

Status: **Proposed** — 2026-09-26. Branch: TBD.
Author: Kiran (with Claude)
Related: `src/App.tsx` (`DEFAULT_YAML`), `docs/notelets/notelets-product-doc.md` (format reference).

---

## 1. Summary

Replace clobmap's first-paint / welcome sample — currently a **"Wedding
planning"** mind map — with a **daily-driver scaffold for a technical
person**: a reusable framework that helps a techie *document their day and
run their routines* — recurring checks, TODOs, urgent vs. important work,
and **one home for all meeting notes**.

The intent is **not** to model a chronological "arc of a day." It's a
functional operating framework, organized by *purpose* (routine / urgent /
important / to-do / meetings), that the user is meant to **adopt and fill
in** as their own — while it simultaneously teaches the "big thing → smaller
things" idea to a first-time visitor and doubles as the hero image in
marketing screenshots. The welcome sample stops being throwaway demo content
and becomes a starting framework someone would actually keep.

The change is a single source edit (`DEFAULT_YAML` in `src/App.tsx`) plus a
screenshot refresh. No engine, schema, or feature work.

## 2. Problem / motivation

- **The seed is the first thing every new user sees.** It's the welcome
  sample on cold launch (option 4 in `App.tsx`'s load-preference order,
  after argv path / localStorage draft / last-open file) and the content
  behind every product screenshot.
- **"Wedding planning" is generic.** It teaches decomposition fine, but it
  doesn't speak to who actually reaches clobmap.com — people who found a
  developer-flavored, YAML-native, keyboard-driven outliner/mind-map tool.
  The first impression should feel like "this was built for me."
- **It predates our flagship features.** clobmap 2.0.0 now ships **tags**
  and the **Notelets** notes-as-pages view. The current seed is pure
  structure — no tags, no notes — so it can't show off the two things that
  most differentiate the product today.
- **The marketing site is decoupled — and also shows the wedding content.**
  The clobmap.com hero is **not** a screenshot of the app and does **not**
  read `DEFAULT_YAML`. It's hand-authored HTML in `public/landing.html`: an
  inline YAML `<pre>` block (`~L379–394`) and a hand-drawn inline `<svg>`
  tree (`~L398–467`), both hardcoding the same wedding example. Changing the
  app seed does not change the site; the two must be updated together, by
  hand, to stay consistent.

## 3. Goals

1. **A framework the user keeps and fills in.** Organized by *purpose*
   (routine / urgent / important / to-do / meetings) so it's immediately
   usable as a personal daily driver — not a fixed day the user reads once
   and deletes. It should feel like the right skeleton to start documenting
   your own day against.
2. **One home for meeting notes.** Every meeting — whenever it happens —
   lands under a single **Meetings** subject, each with its own running
   notes page. No hunting across the tree for "where did I put those notes."
3. **Instantly legible.** A visitor who's never heard "mind map" still gets
   it: your day, broken into the things that need you, broken into tasks.
   (Preserve the existing seed's intent — concrete, not abstract.)
4. **Showcases 2.0.0.** The meeting-notes pages demo **Notelets**, and a few
   **tags** (`#urgent`, `#important`, `#routine`, `#ops`) make the tag tree +
   filter view non-empty — so the default is also a live product demo.
5. **Zero-cost to maintain.** Still a hand-written literal in `App.tsx`;
   still auto-layout (no baked positions), so it lays out cleanly on every
   load and every screenshot viewport.

## 4. Non-goals

- It's a **document scaffold**, not a task-management *engine*. The
  structure guides the day; clobmap doesn't add checkboxes, statuses, due
  dates, or reminders. The user documents and reasons about their day in the
  tree — completion tracking is out of scope.
- No new node fields, no schema change, no per-node `position` blocks.
- Not multiple starter templates or a template picker (possible future
  work; out of scope here — see §10). Note: the old wedding example is
  **retained** as a bundled example (not deleted) — but no picker UI is
  built now.
- Not changing the load-preference order or draft/last-file behavior.

## 5. Target user

The person landing on clobmap.com or opening the app for the first time:
a developer, indie hacker, or technically-fluent planner evaluating whether
this tool fits how they already think. The content should feel native to
them in the first glance, while staying parseable by a non-technical
onlooker (a recruiter, a partner, a PM).

## 6. Proposed content

**Title:** `My day`  ·  **Root:** `My day` (decided)

The subjects are the **buckets a techie runs their day by** — not a
timeline. They map one-to-one to the framework: **routine things**,
**urgent** work, **important** work, **to-dos**, and a single home for
**meeting notes**. The user adopts this skeleton and fills it with their
own items; each subject is a place things *go*, so nothing is homeless.

```
My day
├─ Morning Routine                    #routine     ← first subject: recurring daily checks
│  ├─ View Dashboards                 #ops
│  ├─ Triage Customer Issues
│  └─ Plan the day
├─ Urgent                             #urgent      ← needs me now
│  ├─ Check overdue items
│  └─ Customer escalation
├─ Important                          #important   ← high-value, not time-pressured
│  ├─ Ship the feature
│  └─ Write tests
├─ To-dos                             #todo        ← today's task list
│  ├─ Due today
│  ├─ Code review
│  └─ Update tickets
└─ Meetings                           #meeting     ← ONE home for every meeting's notes
   ├─ Standup             (note→page)   any meeting, any time of day, lands here;
   ├─ 1:1 with manager    (note→page)   each is a running meeting-notes page
   └─ Brainstorming       (note→page)
```

The **Urgent / Important** split is a deliberate, familiar mental model
(the Eisenhower quadrants, minus the ceremony) — it's what makes this a
*guide* to the day rather than a flat list.

**How each requested addition maps in:**

- **Meetings = its own subject, one home for all meeting notes (req 1).**
  It's a standing bucket, **not** time-ordered — a 9am standup and a 4pm
  brainstorm both live here. Every meeting node carries a Markdown
  `notes` value that surfaces as that meeting's **page** in Notelets, so
  "where are my notes?" always has one answer. This is the clearest demo of
  notes-as-pages and models the real habit of one running page per meeting.
- **View Dashboards (req 2)** → **Morning Routine** as a
  start-of-day ops health check (`#ops`) — a recurring "first look."
- **Morning Routine is the first subject (req 3)** — the recurring checks
  you run before anything else.
- **Triage Customer Issues (req 4)** → **Morning Routine** (a daily
  scan).
- **Check overdue items (req 5)** → **Urgent** (overdue = needs me now).
- **Due today (req 6)** → **To-dos** (the day's committed list).

**Tags (illustrative, generic — see §8):** `#routine`, `#ops`, `#urgent`,
`#important`, `#todo`, `#meeting`. Mostly at the subject level so the tag
tree mirrors the framework and the filter view has real facets to show.

**Notes → meeting-notes pages:** each **Meetings** child carries a short
Markdown note (agenda / decisions / action items). These are the pages that
demo the Notelets view — real content, one page per meeting.

### Proposed `DEFAULT_YAML` (wording locked per §10)

```yaml
title: My day
version: 1
root:
  id: n1
  text: My day
  children:
    - id: n2
      text: Morning Routine
      tags: [routine]
      children:
        - { id: n3, text: View Dashboards, tags: [ops], children: [] }
        - { id: n4, text: Triage Customer Issues, children: [] }
        - { id: n5, text: Plan the day, children: [] }
    - id: n6
      text: Urgent
      tags: [urgent]
      children:
        - { id: n7, text: Check overdue items, children: [] }
        - { id: n8, text: Customer escalation, children: [] }
    - id: n9
      text: Important
      tags: [important]
      children:
        - { id: n10, text: Ship the feature, children: [] }
        - { id: n11, text: Write tests, children: [] }
    - id: n12
      text: To-dos
      tags: [todo]
      children:
        - { id: n13, text: Due today, children: [] }
        - { id: n14, text: Code review, children: [] }
        - { id: n15, text: Update tickets, children: [] }
    - id: n16
      text: Meetings
      tags: [meeting]
      children:
        - id: n17
          text: Standup
          notes: |
            Yesterday / Today / Blockers.
            Keep it under 15 minutes.
          children: []
        - id: n18
          text: 1:1 with manager
          notes: |
            ## Agenda
            - Priorities this week
            - Feedback
            - Growth / goals
          children: []
        - id: n19
          text: Brainstorming
          notes: |
            ## Ideas
            -
            ## Parking lot
            -
            ## Next steps
            -
          children: []
```

## 7. Requirements

- **R1** Point the first-paint seed at the new techie daily-driver content
  (update `DEFAULT_YAML` in `src/App.tsx`, or add the new constant and set it
  as the default); preserve the surrounding comment's design rationale
  (auto-layout, no positions, concrete-not-abstract) and update it to
  describe the new seed.
- **R1b** **Do not delete the old wedding example.** Retain its YAML as a
  bundled example — recommended `examples/wedding-planning.clobmap.yaml` —
  so it stays openable/reference-able and can seed a future template
  gallery. It is simply no longer the default.
- **R2** Valid on load: parses, round-trips through YAML, lays out with the
  canonical tidy-tree, and renders in **all four views** (YAML / Split /
  Mind-map / Notelets) with no empty/error states.
- **R3** Tags render in the tag tree + filter view; notes render in Notelets
  and show the node notes indicator.
- **R4** No horizontal/vertical overflow at the standard screenshot
  viewport(s); the tree reads as balanced.
- **R5** Any test/snapshot that asserts on the **first-paint** seed ("Our
  wedding", "Wedding planning", "Reception", etc.) is updated to the new
  default. (Grep first — the e2e fixtures and `document.test.ts` reference
  the old strings.) Tests that just need *some* valid doc can be repointed
  at the retained wedding example rather than rewritten.

## 8. Design constraints

- **Avoid trademarked / product names.** Use generic role words — "team
  chat" not a specific chat app, "tickets"/"issue tracker" not a specific
  tracker, "code review"/"open PR" not a specific forge. (Standing project
  guidance.)
- **Short labels.** Keep leaves to ~1–3 words so tidy-tree stays compact and
  screenshots aren't dominated by wrapped text.
- **Neutral, inclusive tone.** Reads as a *usable framework*, not a
  prescription for how anyone must work; no company-, stack-, or
  seniority-specific jargon that would alienate.
- **Restraint on tags/notes.** Tags mostly at the subject level (~6 total);
  notes concentrated on the **Meetings** children (the intentional Notelets
  demo). Enough to show the features and make the framework legible, not so
  much that first paint looks busy.

## 9. Success criteria

- New/returning visitors see the daily-driver framework on first paint;
  screenshots on the landing page + README reflect it.
- The framework reads as **immediately usable** — a first-time user can see
  where their own routines, urgent/important work, TODOs, and meeting notes
  would go without instruction.
- **Meetings** is a visibly single home for meeting notes, with each meeting
  rendering as its own page in Notelets.
- Tag tree, filter view, and Notelets each have real content to show.
- No regressions: full unit + e2e suites green after the fixture/string
  updates; all four views render the seed cleanly.

## 10. Decisions & open questions

**Decided (2026-09-26):**

1. **Title & root = `My day`** — both the tab title and the root node.
2. **Subject labels — keep them brief.** Locked: **Morning Routine ·
   Urgent · Important · To-dos · Meetings**. ("To-do today" shortened to
   "To-dos"; "Morning Routine" kept as explicitly requested.) If you want
   maximal brevity later, "Morning Routine → Routine" is the only remaining
   trim.
3. **Three example meetings, notes in:** **Standup · 1:1 with manager ·
   Brainstorming** — each with a short Markdown note that becomes its
   Notelets page. Notes are core to the concept, not optional dressing.
4. **New default, but keep the old example (don't delete it).** The techie
   daily-driver becomes the first-paint `DEFAULT_YAML`; the previous
   **"Wedding planning"** map is **retained as a bundled example**, not
   removed. Recommended home: a committed `examples/wedding-planning.clobmap.yaml`
   (and keep the string reachable for tests). It becomes the natural first
   entry when the "New from template" gallery (future work) lands. No
   template picker is built now.

**Still open:**

5. **Marketing-site update (not a "screenshot" — hand-authored HTML).** The
   clobmap.com hero is hardcoded in `public/landing.html`, decoupled from
   the app seed (see §2). Matching it to the new default means, by hand:
   - **(a)** rewrite the inline YAML `<pre>` block (`~L379–394`) to the new
     `My day` content, and
   - **(b)** **redraw the inline `<svg>` tree (`~L398–467`)** — new labels
     *and* new coordinates/connectors, since it's hand-plotted. The new
     shape is 5 subjects × 2–3 children (vs. today's 4×2), so it's a
     re-layout, not a relabel. Optional bonus: depict a note→page to hint at
     Notelets, since the SVG is fully under our control.
   - **(c)** README and any social `og:image` — confirm whether either
     embeds the old map (README currently references no committed
     screenshot PNGs; verify before ship).

## 11. Rollout

1. Edit the first-paint seed + its comment in `src/App.tsx` (per R1).
2. Save the old wedding content as a retained example — e.g.
   `examples/wedding-planning.clobmap.yaml` — do **not** delete it (R1b).
3. Update first-paint-seed references in tests/e2e fixtures (per R5).
4. Update the marketing site by hand (per §10.5): rewrite the `<pre>` YAML
   and redraw the `<svg>` tree in `public/landing.html`.
5. Sync docs: `CHANGELOG` (`### Changed` — new welcome sample), the
   manual-testing-guide first-launch step if it names the old content, and
   README/social `og:image` if either shows the old map.
6. Verify: `npm run lint && npm run typecheck && npm test && npm run e2e`.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Stale asserts on old seed strings break CI | Grep for the old labels first; update fixtures in the same change (R5) |
| Tags/notes make first paint look busy | Keep to a light touch; screenshot-review before merging |
| A label reads as a specific product/brand | Use generic role words only (§8) |
| Marketing site drifts from the app seed (it's hand-authored + decoupled) | Update `public/landing.html` (`<pre>` YAML + hand-drawn `<svg>`) in the same PR as the seed change (§10.5) |
| Redrawn `<svg>` tree misaligns (hand-plotted coordinates) | Treat it as a re-layout, not a relabel; eyeball against the live hero before merge |
```
