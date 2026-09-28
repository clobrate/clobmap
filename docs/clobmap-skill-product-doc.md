# clobmap Skill — Product Document

Status: **Proposed** — 2026-09-28. Branch: TBD.
Author: Kiran (with Claude)
Related: [`operations-catalog.md`](./operations-catalog.md) (the operation surface this skill wraps), `conversation.md` (plugin/skill/MCP direction).

---

## 1. Summary

A **clobmap skill** lets an AI agent (Claude) **create and edit clobmap
documents** — the tree, notes, tags, and colors — programmatically and safely,
**without the app running**. It works directly on the `.clobmap.yaml` file (and
its notes folder), reusing clobmap's own model layer so every edit is
**validated and round-trip-safe** (structure stays legal; comments and key order
are preserved).

The skill = a **`SKILL.md`** (instructions telling the agent when/how to use it)
+ a small **headless toolkit** (a Node CLI/library) that exposes the
[operations catalog](./operations-catalog.md) as commands over a file.

## 2. Problem / motivation

- **Agents want to author structured docs.** "Turn this transcript into a mind
  map", "add a Meetings subject with one page per attendee", "tag every overdue
  item", "generate a project plan as a clobmap" — these are natural agent tasks,
  but today an agent has no safe way to produce/edit a `.clobmap.yaml`.
- **Hand-editing YAML is fragile.** An agent free-typing YAML will eventually
  break the schema (bad ids, malformed `notes`, broken tag tree), or clobber
  comments/order. clobmap already has the exact code to do this correctly —
  `parseLiveYaml → mutate tree → applyTreeToDocument → serializeLiveYaml`.
- **The format is the API.** A clobmap document is just a YAML file plus
  (optionally) a folder of Markdown notes. That means a skill can operate on
  files on disk — no running app, no IPC — which is the simplest, most robust
  substrate. This is clobmap's structural advantage over binary-format tools.
- **It composes with everything.** Once an agent can emit/edit clobmap docs, it
  can pipe from transcripts, issues, calendars, repos, etc.

## 3. Goals

1. **Safe, validated edits.** Every operation goes through clobmap's model layer;
   the output always parses and round-trips (comments/order preserved).
2. **Cover the operation surface** from the catalog: document lifecycle, tree
   edits, notes (incl. append/insert), tags + tag-tree structure, color, layout,
   export.
3. **Work headless** — a `.clobmap.yaml` (+ notes folder) on disk is the only
   input/output; no app or browser required. Files stay openable in the app.
4. **Agent-legible.** A crisp `SKILL.md` so the agent knows *when* to reach for
   the skill and *how* to address nodes (by id / title / path) and sequence ops.
5. **Deterministic & scriptable** — one node addressing model, clear errors,
   dry-run + diff, so multi-step edits are predictable.

## 4. Non-goals

- **Not a rewrite of the app.** The skill reuses `src/model` (+ the notes rules);
  it doesn't re-implement mind-map rendering, layout math, or the UI.
- **Not "drive the running app."** No screen automation / IPC into a live window.
  (An optional MCP server is a *distribution* choice — see §11 — not the core.)
- **Not a new file format.** Output is ordinary `.clobmap.yaml` + `.md`.
- **No network/cloud** in the skill itself; it reads/writes local files.

## 5. Target users / scenarios

Agents (and power users via the agent) who want to **generate or bulk-edit**
clobmap docs:
- "Create `roadmap.clobmap.yaml` with these 4 subjects and pages."
- "Add a child 'Write tests' under 'Deep work' and give it a note."
- "Append today's standup notes to the Standup page."
- "Tag every node under 'Urgent' with `#p0` and color them red."
- "Rename the `#work` tag to `#office` across the whole doc."
- "Migrate this doc's inline notes into the notes folder."
- "Summarize the tree / export all notes to Markdown."

## 6. What "skill" means here — and the key decision

A **skill** = an instruction file (`SKILL.md`) the agent loads, plus bundled
scripts/resources it can run. The core design decision is **how the skill
mutates a document**. Options, and the recommendation:

| Approach | Verdict |
|---|---|
| **A. Headless toolkit over the model layer** — a Node CLI/lib that imports `src/model` (parse → op → serialize) + Node `fs` for notes files | ✅ **Recommended.** Reuses validated, comment-preserving logic; no app; simplest substrate. |
| B. Agent free-edits the YAML text directly (guided by SKILL.md) | ❌ Fragile — breaks schema/ids/tag tree; loses round-trip guarantees. Fine only as a last-resort fallback. |
| C. MCP server wrapping the toolkit | ➕ Good *distribution* on top of A (tools instead of a CLI) — optional, later. |
| D. Drive the running Tauri app | ❌ Heavy, brittle, needs a live window; defeats the "format is the API" advantage. |

**Recommendation: A now, C later.** Build the headless toolkit first (it's the
engine); the `SKILL.md` calls it. An MCP server can wrap the same toolkit when a
tools-based surface is wanted.

## 7. The operation surface

The skill exposes the full [operations catalog](./operations-catalog.md) (§11.3).
Command groups (each a thin wrapper over an existing model op / notes rule):

- **Doc:** `new <file> [--title]`, `info <file>` (summary/tree), `validate <file>`.
- **Tree:** `add-child <file> --parent <id|title> --text …`, `add-sibling`,
  `delete <id>`, `rename <id> --text`, `move <id> --to <parentId> [--index]`,
  `reorder <id> --up|--down`, `duplicate <id>`, `collapse <id> --on|--off`.
- **Notes:** `note-get <id>`, `note-set <id> --text|--file`, `note-append <id> --text`,
  `note-prepend`, `note-clear <id>`.
- **Tags:** `tag-add <id> --tags a,b`, `tag-remove <id> --tag a`,
  `tag-rename <old> <new>`, `tag-delete <name>`, `tag-move <tag> --under <parent>`.
- **Appearance:** `color-set <id> --color #hex`, `color-clear <id>`,
  `size <id> --max-width <px> --max-height <px>`.
- **Layout / edges:** `layout <file> --auto|--manual`, `pos-set <id> --x --y`,
  `pos-clear [<id>]`, `edge-side <id> --from <side> --to <side>`.
- **Export/query:** `export-notes <file> [--out]`, `find --text|--tag`, `tree <file>`.
- **Batch:** `apply <file> --ops ops.json` (a JSON op-list, §11.6).

Everything also remains doable by **direct YAML edit** (§13 of the catalog) — the
toolkit is the *safe* path, not the only one.

## 8. Architecture

- **Core wrappers (in-repo)** — thin functions in the CLI that import `src/model`
  **directly** (no separate package for now — §11.4): `parseLiveYaml` → `ops.*`
  (addChild, updateText, tagsAdd, updateTagName, …) → `applyTreeToDocument` →
  `serializeLiveYaml`. The model is pure TS (only the `yaml` lib). **This is the
  whole engine.**
- **Notes on disk** — for folder/sidecar notes, **share `notesFolder.ts`** (§11.5)
  for the naming, path validation, and `isInsideDir` sandbox rules; do the actual
  reads/writes with Node `fs`. Sharing (not re-implementing) keeps app + CLI
  filenames identical.
- **`clobmap` CLI** — argument parsing over the core wrappers; reads a `.clobmap.yaml`,
  applies one op, writes it back atomically. Emits JSON on `--json` for chaining.
- **`SKILL.md`** — the agent-facing doc: when to use it, the addressing model
  (§below), a recipe list, and the "prefer the CLI over hand-editing YAML" rule.
- **Node addressing** — canonical **by `id`**; convenience **by title** (search;
  error if ambiguous) and **by path** (`Root › Subject › Page`). One resolver.
- **Batch/transaction** — accept a list of ops (a small JSON script) applied in
  order to one in-memory tree, serialized once → fewer file writes, atomic.

## 9. Safety & correctness

- **Always valid output** — serialize only a successfully-parsed+mutated tree;
  never emit unparseable YAML. `validate` as a standalone command.
- **Round-trip preservation** — comments + key order kept via the live YAML AST.
- **Notes sandbox** — note files confined to the doc's folder subtree (reuse the
  Phase-4 `isInsideDir` guard); refuse `..`/absolute/`~` escapes.
- **Non-destructive by default** — `--dry-run` prints the diff; back up (or lean
  on git) before writing; deletes of note files archive (`.Deleted-…`) like the app.
- **Don't clobber** — id-stable note filenames; append/insert read-modify-write
  the current file, not a stale copy.
- **Clear errors** — "node id not found", "ambiguous title", "tag already exists"
  — so the agent can recover.

## 10. Distribution / packaging

- Ship the **`SKILL.md` + CLI** in the repo (e.g. `skills/clobmap/`), invokable
  by Claude Code / the Agent SDK.
- The CLI can also be a standalone `npx clobmap …` for humans/CI.
- Later: an **MCP server** exposing the same ops as tools (§11).

## 11. Decisions (resolved 2026-09-28)

1. **CLI-only for v1.** Simplest and scriptable; an MCP server can wrap the same
   CLI/core later when a tools surface is wanted (§14 phase 7).
2. **Node addressing = id / title / path**, erroring on an ambiguous title. Ids
   are canonical; title and path are conveniences resolved to an id.
3. **Full operation catalog** in scope — tree, notes (incl. append/insert), tags
   + tag tree, color, layout / edges / positions, export. Phased in
   *implementation* (§14), not scope.
4. **Import `src/model` directly, in-repo** — no separate package for now. The
   model is pure, so extracting `@clobmap/core` later (if a second consumer
   appears) stays a cheap, mechanical refactor.
5. **Share `notesFolder.ts`** as the single source of truth for the pure naming +
   path/sandbox rules; the CLI does its actual file I/O with Node `fs` (the same
   rules-vs-I/O split the app already has via `fsAdapter.ts`). No re-implementation.
6. **Batch edits = a JSON op-list** — a list of ops applied in order to one
   in-memory tree and serialized once.

## 12. Success criteria

- An agent can **create a valid `<name>.clobmap.yaml` from scratch** and open it
  in the app with no repair.
- All v1 ops (§7) apply correctly and the file **still round-trips** (comments/
  order intact) — verified by a test suite over the CLI.
- **Append/insert to a note** works against both inline and folder-mode notes.
- A **tag rename/delete cascades** correctly across nodes + the tag tree.
- `--dry-run` shows an accurate diff; nothing is written without intent.
- The `SKILL.md` is enough for an agent to complete a multi-step task unaided.

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Agent hand-edits YAML anyway and breaks it | `SKILL.md` mandates the CLI; provide a `validate` + `fix`/reformat command |
| Notes-folder rules drift between app and CLI | Share `notesFolder.ts` as one source of truth (§11.5) |
| Silent overwrite of a note edited elsewhere | Read-modify-write current file; `--dry-run`; recommend git |
| Ambiguous title addressing | Resolver errors on ambiguity; prefer ids in scripts |
| Full-catalog scope (§11.3) balloons v1 | Phase the *implementation* — core ops → layout/edges → export/batch — even though v1 targets the whole catalog (§14) |

## 14. Rollout (phased)

v1 targets the **full catalog** (§11.3); the phases order the *implementation*.

1. **Core engine** — in-repo round-trip wrappers over `src/model` (imported
   directly, §11.4) + tests.
2. **CLI (core ops)** — doc/tree/notes/tags/color + addressing + `--dry-run/--json`.
3. **Notes folder** — share `notesFolder.ts` (§11.5); append/insert; sandbox.
4. **Layout/edges/positions** — the rest of the catalog (`color`, `move`, manual
   positions, `edgeFrom`/`edgeTo`, collapse).
5. **Export/query + batch** — `export-notes`, `find`, `tree`, JSON op-lists.
6. **SKILL.md + recipes** — agent instructions, examples, the JSON op-list format.
7. **(Later) MCP server** wrapping the same CLI/core (§11.1).

## 15. Out of scope (for the skill)

- Rendering (PNG/SVG/PDF beyond what the app already does), live-app automation,
  cloud sync, a new file format, and non-standard note embeds/transclusion
  (clobmap's standing "no").
