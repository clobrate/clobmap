# clobmap Skill — Phased Implementation Plan

Status: **Proposed** — 2026-09-28. Branch: TBD (suggest `feature/clobmap-skill`).
Author: Kiran (with Claude)
Product doc: [`clobmap-skill-product-doc.md`](./clobmap-skill-product-doc.md) (the *what/why* + the 6 decisions). Op surface: [`operations-catalog.md`](./operations-catalog.md). All §-refs point to the product doc unless noted.

---

## Goal (recap)

Build a **CLI-only** (§11.1) clobmap skill that lets an agent create/edit
`.clobmap.yaml` documents + their notes folder **headless**, covering the **full
operation catalog** (§11.3), by **importing `src/model` directly in-repo**
(§11.4) and **sharing `notesFolder.ts`** (§11.5). Batch edits via a **JSON
op-list** (§11.6). Node addressing by **id / title / path** (§11.2).

## Guiding architecture (read first)

1. **Reuse, don't re-type.** Every structural edit goes model-layer:
   `parseLiveYaml` → `ops.*` → `applyTreeToDocument` → `serializeLiveYaml`. This
   is the *only* way we mutate — it guarantees valid output + preserves comments
   and key order. Hand-writing YAML is banned (that's the whole point).
2. **Rules shared, I/O local.** The pure rules — `src/model/**` and
   `src/lib/notesFolder.ts` (naming, `validateNotesFolder`, `isInsideDir`) and
   the pure planners (`planMigration`, `planTidy`, `planDeleteArchive`) — are
   imported as-is. All disk I/O is done with **Node `fs/promises`** in the CLI
   (the app's `fsAdapter.ts` is Tauri-only; the CLI is its Node twin).
3. **One document = one file (+ notes folder).** No app, no IPC. Output stays
   openable in the app with zero repair.

### Where it lives
```
skills/clobmap/
  cli.ts            # arg parse (node:util parseArgs) + command dispatch
  core.ts           # withDoc(): load → mutate(tree) → save (atomic, round-trip)
  addressing.ts     # resolveNodeId(tree, ref): id | title | path (ambiguity error)
  notes-fs.ts       # Node-fs note I/O reusing notesFolder.ts rules + pure planners
  commands/*.ts     # one module per group (tree, notes, tags, appearance, layout, export, batch)
  SKILL.md          # agent-facing instructions (Phase 6)
```
Imports `../../src/model` and `../../src/lib/notesFolder` (+ the pure planners)
directly. No build step for dev.

### Runner (a real setup task)
No TS runner is installed. **Add `tsx` as a devDependency** (Phase 0); the skill
invokes `npx tsx skills/clobmap/cli.ts …`. (Node 26 native TS is close but
extensionless/ESM import resolution is fiddly; `tsx` is the low-risk choice. An
`esbuild` single-file bundle for distribution is a later nicety.)

### Testing strategy
- **Vitest** (already in the repo). Core (`withDoc`), `addressing`, and the note
  planners are pure → unit-tested directly.
- **Command tests** call the command functions against a **temp dir** (real Node
  `fs`, `os.tmpdir()`), asserting the written YAML + note files, then re-parse to
  prove round-trip. No spawning needed.
- **Round-trip identity** test: load a commented fixture, apply a no-op, save →
  byte-for-byte (or AST-equal) identical.
- Add a `test:skill` vitest project/glob so skill tests run alongside the suite.

---

## Phase 0 — Scaffolding + round-trip engine + addressing

**Goal:** the engine — load/mutate/save with round-trip fidelity — and node
addressing. No commands yet.

- `tsx` devDependency + a `skills/clobmap/` tree; a `clobmap` npm script
  (`tsx skills/clobmap/cli.ts`).
- **`core.ts`**:
  - `loadDoc(path)` → `{ tree: MindDocument, live }` via `readFile` + `parseLiveYaml`
    (throw a clean error on parse failure, surfacing line/message).
  - `saveDoc(path, live)` → `serializeLiveYaml` + **atomic write** (temp file →
    rename).
  - `withDoc(path, mutate: (tree)=>MindDocument, {dryRun})` → load →
    `applyTreeToDocument(live, mutate(tree))` → serialize → (print diff if
    dryRun, else write). Returns the new text.
- **`addressing.ts`**: `resolveNodeId(tree, ref)` — exact id hit wins; else match
  by `text` (error if >1) ; else parse a `A › B › C` path. Clear errors:
  `not found`, `ambiguous title`.
- **Tests:** round-trip identity (commented fixture); `resolveNodeId` (id/title/
  path/ambiguous/missing).

**DoD:** a fixture round-trips unchanged; the resolver is exhaustively tested;
nothing user-facing yet.

## Phase 1 — Doc + tree commands

**Goal:** author structure end-to-end.

- **`cli.ts`**: `parseArgs`-based dispatch, global flags `--dry-run`, `--json`,
  `--file`. Uniform error → nonzero exit + JSON error on `--json`.
- **Commands** (each = `withDoc` + a model op; nodes resolved via `addressing`):
  - `new <file> [--title]` (from `emptyDocument`), `info`/`tree` (print the
    outline), `validate`.
  - `add-child --parent <ref> --text`, `add-sibling --after <ref> --text`,
    `delete <ref>`, `rename <ref> --text` (`updateText`), `move <ref> --to <ref>
    [--index]` (`moveNode`), `reorder <ref> --up|--down` (`moveSibling`),
    `duplicate <ref>`, `collapse <ref> --on|--off` (`updateNode`).
- **`--json`** returns the affected node id(s); **`--dry-run`** prints a unified
  diff of the YAML.
- **Tests:** each command writes the expected tree + round-trips; dry-run writes
  nothing; new file opens clean.

**DoD:** an agent can build a full tree from scratch and restructure it; every
result re-parses and round-trips.

## Phase 2 — Notes (inline + folder, append/insert, sandbox)

**Goal:** the note operations, matching app behavior, for both storage modes.

- **`notes-fs.ts`** (Node twin of the app's note I/O), reusing `notesFolder.ts`:
  - Path resolution: `docDir + relPath` via `node:path` (the app's
    `resolveNotesPath` is Tauri-gated, so re-do resolution here).
  - `readNote(tree, id, docPath)` — inline value or read the file.
  - `writeNote(...)` — **mode-aware**: `inline` → set field to text (extract to a
    sidecar over the cap, mirroring `NOTES_INLINE_LIMIT`); `folder` → `mkdir -p`
    the folder + write `<id>-<slug>.md` (via `noteFilename`/`noteRelPath`), set
    field to the rel path. Empty → keep-empty-file (folder) / clear (inline).
  - **Sandbox:** every resolved path passes `isInsideDir(resolved, docDir)`;
    refuse `..`/absolute/`~`.
- **Mode flags:** `--notes-mode inline|folder` (default: **infer** — folder if
  any node already points at a folder file, else inline) + `--notes-folder`
  (default `notelets`, validated).
- **Commands:** `note-get <ref>`, `note-set <ref> --text|--file`,
  `note-append <ref> --text`, `note-prepend <ref> --text`, `note-clear <ref>`.
  Append/insert = read → splice → write (never a stale copy).
- **Tests (temp dir):** inline set/append; folder set writes the `.md` + rel
  path; append across both modes; empty-keeps-file; sandbox rejection; round-trip
  the YAML.

**DoD:** notes can be created/read/edited/appended/cleared in both modes;
filenames match the app exactly (shared rules); nothing escapes the doc folder.

## Phase 3 — Tags + tag tree

**Goal:** node tags and the tag-tree structure.

- **Commands** over the model ops: `tag-add <ref> --tags a,b` (`tagsAdd`),
  `tag-remove <ref> --tag a` (`tagsRemove`), `tag-rename <old> <new>`
  (`updateTagName` — cascades), `tag-delete <name>` (`tagDelete` — cascades),
  `tag-move <tag> --under <parent>` (`moveTagNode`), `tag-reorder <tag> --up|--down`
  (`moveTagSibling`).
- Tag refs resolve by tag name (case-insensitive, per the model's normalize).
- **Tests:** node tag add/remove; cascading rename + delete across nodes and the
  tag tree; tag-tree restructure; round-trip.

**DoD:** full tag + tag-tree editing; cascades are correct; YAML `tagRoot`
round-trips.

## Phase 4 — Appearance + layout/edges/positions

**Goal:** the remaining per-node/document fields (completes the full catalog).

- **Commands** via `updateNode` / `setLayoutMode` / `setPositions` /
  `clearAllPositions`:
  - `color-set <ref> --color <hex>`, `color-clear <ref>`,
    `size <ref> --max-width --max-height`.
  - `layout <file> --auto|--manual`, `pos-set <ref> --x --y`,
    `pos-clear [<ref>]`, `edge-side <ref> --from <side> --to <side>`
    (`edgeFrom`/`edgeTo`; validate side ∈ top/right/bottom/left).
- **Tests:** each field sets/clears + round-trips; invalid color/side rejected.

**DoD:** every catalog field is reachable from the CLI.

## Phase 5 — Export / query + batch (JSON op-list)

**Goal:** read-side ops + atomic multi-op edits.

- **`export-notes <file> [--out]`** — reimplement the app's section builder (it's
  IO-interleaved) with Node fs: per node, read the note, emit
  `# <text> (<id>)` + `tags:` + `color:` (when set) + demoted body. Keep the
  format identical to `exportActions.exportAllNotes`.
- **`find --text <q> | --tag <t>`** — list matching node ids + titles (`--json`).
- **`tree <file>`** — the outline (already in Phase 1; finalize `--json` shape).
- **`apply <file> --ops ops.json`** — a **JSON op-list** (§11.6): validate, then
  apply each op to one in-memory tree (+ note-fs side effects), serialize **once**,
  write atomically. Each op = `{ op, ...args }` mirroring the CLI commands.
  `--dry-run` shows the combined diff.
- **Tests:** export matches the app format (incl. tags/color lines); find by
  text/tag; a multi-op batch applies in order and round-trips; a bad op in the
  list aborts the whole batch (no partial write).

**DoD:** query + export parity with the app; batch edits are atomic and ordered.

## Phase 6 — SKILL.md + recipes + packaging

**Goal:** make it an actual, agent-usable skill.

- **`SKILL.md`** — when to use it; the **addressing model** (prefer ids in
  scripts; title/path resolve, error on ambiguity); a **command reference**; the
  hard rule **"use the CLI, never hand-edit `.clobmap.yaml`"**; the **JSON
  op-list** format; and 3–5 **recipes** (create a doc; add a subject + pages with
  notes; tag+color a subtree; append to a note; export notes).
- **Packaging:** `clobmap` npm script + a `skills/clobmap/README.md`; ensure the
  skill is discoverable by Claude Code / the Agent SDK.
- **Docs:** cross-link from `operations-catalog.md`; note the skill in
  ARCHITECTURE.
- **Tests:** run each recipe end-to-end (temp dir) as a smoke suite.

**DoD:** an agent can complete a multi-step authoring task from `SKILL.md` alone;
recipes pass.

## Phase 7 — MCP server (deferred, §11.1)

Out of scope for v1. When wanted: a thin MCP server exposing the same command
functions as tools (reuse `commands/*` + `withDoc`), no engine changes.

---

## Cross-cutting: safety & UX

- **Atomic writes** (temp + rename) so a crash never truncates a doc.
- **`--dry-run` everywhere** that writes; **`--json`** for machine output.
- **Deletes archive** note files (`.Deleted-…`) like the app; never hard-delete.
- **Clear, typed errors** (`NotFound`, `Ambiguous`, `Invalid`, `OutsideFolder`)
  → nonzero exit + JSON error body.
- **No network**; reads/writes only under the doc's folder (enforced by
  `isInsideDir`).

## Testing plan (summary)

- Pure: `withDoc` round-trip, `addressing`, `notes-fs` planners — unit tests.
- Commands: temp-dir integration per command group; assert files + re-parse.
- Parity: `export-notes` vs the app format; note filenames vs `notesFolder.ts`.
- Batch: ordered apply + all-or-nothing abort.
- Add skill tests to the vitest run; keep the main suites untouched (the skill
  imports app code but doesn't change it).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| TS/ESM import resolution of `src/model` from Node | Use `tsx` (Phase 0); a build/bundle only if distribution needs it |
| Note filenames drift from the app | **Share** `notesFolder.ts` (never re-implement the rules) — §11.5 |
| Storage-mode ambiguity headless (no user setting) | `--notes-mode` flag; default to *infer from the doc* |
| Partial writes on multi-op batch | Build the whole tree in memory, serialize once, atomic write; abort on any bad op |
| Reaching into Tauri-only app code by accident | The CLI imports only pure modules (`src/model`, `notesFolder.ts`, pure planners); does its own Node I/O |
| App refactors break the CLI's imports | Skill tests run in the same suite → a breaking model change fails CI |

## Suggested commit / phase sequence

1. `chore(skill): scaffold + tsx; core round-trip engine + addressing` (P0)
2. `feat(skill): doc + tree commands (--dry-run/--json)` (P1)
3. `feat(skill): note ops (inline+folder, append/insert, sandbox)` (P2)
4. `feat(skill): tag + tag-tree commands` (P3)
5. `feat(skill): appearance + layout/edges/positions` (P4)
6. `feat(skill): export/query + JSON op-list batch` (P5)
7. `docs(skill): SKILL.md + recipes + packaging` (P6)

## Out of scope (v1)

MCP server (P7, deferred); a published `@clobmap/core` package (§11.4 — extract
only if a second consumer appears); rendering exports (PNG/SVG/PDF — app-only);
live-app automation; any new file format.
