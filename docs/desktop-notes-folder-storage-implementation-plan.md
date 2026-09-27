# Desktop Notes-Folder Storage — Phased Implementation Plan

Status: **Proposed** — 2026-09-26. Branch: TBD (suggest `feature/notes-folder`).
Target: **desktop only**, a later minor (**2.1.0**). Web/iOS get read-only support only.
Product spec: [`desktop-notes-folder-storage-product-spec.md`](./desktop-notes-folder-storage-product-spec.md) (the *what/why*; this is the *how*). All §-refs point there unless noted.

---

## Guiding architecture (read first)

Three principles shape every phase:

1. **One notes code path.** NotesPopup and the Notelets view both go through
   `useNodeNotes` → `loadNotes`/`saveNotes` in `src/lib/notes.ts`. Folder mode
   is a **new write policy inside that path**, not a parallel one.

2. **Pure planner + thin FS adapter.** The hard logic (which files to
   write/rename/archive, which `notes:` fields to rewrite, path validation)
   is written as **pure functions over an in-memory model** — no `@tauri-apps`
   imports. A tiny adapter (`writeTextFile`/`mkdir`/`rename`/`exists`/`readDir`/
   `remove`) is the *only* thing that touches the disk. This is what makes the
   feature unit-testable despite being desktop-FS-bound (see Testing reality).

3. **Never widen the trust boundary.** All note file access stays inside the
   document's directory subtree, validated on the **canonicalized** path
   (§9). The Tauri FS capability is currently wide (`"path": "**"` in
   `src-tauri/capabilities/default.json`) — enforcement is at the resolver, and
   Phase 4 optionally tightens the native side.

### Testing reality (important)
Playwright web e2e **cannot** exercise desktop file writes (it runs the web
build; FS ops are Tauri-only). So the test strategy is:
- **Unit tests carry the weight** — the pure planner/validator/slug/filename
  helpers get exhaustive coverage against a mock FS.
- **A manual desktop matrix** (added to `docs/manual-testing-guide.md`) covers
  the real Tauri path.
- Existing web/inline e2e must stay green (folder mode is desktop-gated, so web
  behavior is unchanged).

---

## Phase 0 — Foundations: settings + pure helpers (no behavior change)

**Goal:** land the setting and the pure building blocks with zero user-visible
change (folder mode not yet wired into save/open).

- **Settings** (`src/lib/settings.ts`): add `noteStorage: "inline" | "folder"`
  and `notesFolder: string` (default `notelets/`, §11.1) to `PersistedSettings`,
  with `KEY_NOTE_STORAGE` / `KEY_NOTES_FOLDER`, load/save via the existing
  `LazyStore` (desktop) + localStorage (web) plumbing. Desktop-only in effect;
  on web the setting exists but folder mode is inert (Phase 4). Default is
  **`folder` on desktop** (§11.2) but **gated behind a feature flag** until
  Phases 1–2 are done, so nothing migrates yet.
- **Pure helpers** (new `src/lib/notesFolder.ts`, sibling to `notes.ts`):
  - `slugify(text): string` — safe, length-capped, unicode-aware slug.
  - `noteFilename(nodeId, text): string` → `<nodeId>-<slug>.md` (§11.3).
  - `deletedArchiveName(nodeId, text, deletedAtISO)` → `.Deleted-<nodeId>-<slug>-<ts>.md` (§11.4).
  - `folderIsInsideDoc(folderSetting, docPath): Result` — validates a relative
    subfolder, rejects absolute/`~`/`..`-escape (string-level; canonical check
    is Phase 4).
  - `noteRelPath(folder, filename)` → `./<folder>/<file>.md` (forward slashes).
- **Tests:** unit-test every helper (slug edge cases, collisions handled by id
  prefix, path rejection cases). No FS, no wiring.

**DoD:** setting persists; helpers 100% unit-covered; app behaves exactly as
2.0.2 (flag off).

## Phase 1 — Folder-mode write path (new notes → files)

**Goal:** with the flag on, **saving** a note in folder mode writes a per-node
`.md` (any size) and stores the relative path — for notes authored while the
doc is already in folder mode. (Migration of *existing* inline notes is Phase 2.)

- **FS adapter** (new `src/lib/fsAdapter.ts`): wrap `@tauri-apps/plugin-fs`
  (`writeTextFile`, `mkdir`, `exists`, `rename`, `remove`, `readDir`). Single
  chokepoint; trivially mockable.
- **`saveNotes` extension** (`src/lib/notes.ts`): when `noteStorage === "folder"`
  and desktop and doc has a path:
  - ensure `<docDir>/<folder>/` exists (`mkdir` recursive);
  - write `<folder>/<noteFilename>.md` **irrespective of `NOTES_INLINE_LIMIT`**;
  - set the YAML field to `./<folder>/<file>.md`.
  - Reuse today's rule: if the field **already** points at a file, keep writing
    to that file (this is the existing behavior at `notes.ts` "keep that
    linkage" branch — folder mode just makes it the default for new notes too).
  - **Empty note → write/keep an empty file**, field still points at it (§11.4),
    so the next edit reuses it. (Differs from inline mode, which clears.)
- **`loadNotes`** already resolves `./<folder>/x.md` via `resolveNotesPath`;
  add a **subtree guard** stub (full enforcement Phase 4).
- **Wiring:** thread the active `noteStorage`/`notesFolder` into
  `useNodeNotes` → `saveNotes`/`loadNotes` (from settings/store).
- **Tests:** unit `saveNotes` in folder mode against the mock FS — writes file,
  stores relative path, bypasses the 800-char cap, empty keeps file, existing
  file-link preserved.

**DoD:** in folder mode, a brand-new note of any length round-trips as a visible
file; inline mode unchanged; web unaffected.

## Phase 2 — Migration on open (inline + legacy sidecars → folder)

**Goal:** opening a doc in folder mode **silently** moves existing inline notes
and legacy root dotfile sidecars into the folder, once, losslessly, undoably.

- **Pure migration planner** (`src/lib/notesFolder.ts`):
  `planMigration(tree, docPath, folder): MigrationPlan` — walks nodes, returns a
  list of ops: `{ nodeId, action: "inline→file" | "sidecar→file" | "noop",
  filename, content, fieldUpdate }`. No FS; fully unit-testable.
- **Executor** (in the notes layer): apply the plan via the FS adapter (write
  files, then rewrite the `notes:` fields in the doc model), as **one undo
  transaction** so `Cmd/Ctrl+Z` reverts the whole migration (§11.6). The doc
  becomes dirty and autosaves per existing rules.
- **Legacy sidecars:** today's `./.<doc>_<id>_<text>.md` (from
  `suggestedSidecarFilename`) are read and **re-homed** to
  `<folder>/<nodeId>-<slug>.md`; old file removed (or archived — decide).
- **Idempotency:** a node already pointing at `<folder>/…` is a `noop`; opening
  an already-migrated doc does nothing.
- **Trigger:** on document load (in the cold-load/bootstrap path in `App.tsx`
  that already sequences argv/draft/last-file/seed), when folder mode is on.
- **Tests:** planner unit tests — inline→file, sidecar→file, mixed, empty,
  already-migrated (noop), lossless content, stable filenames; executor against
  mock FS; undo reverts.

**DoD:** any pre-existing doc, opened once in folder mode, ends up with all
notes as files + a `.yaml` of paths; re-open is a noop; undo restores prior
state; no content lost.

## Phase 3 — Lifecycle: rename, delete, empty, tidy

**Goal:** keep the folder correct as the tree changes.

- **Node rename:** filename is id-stable, so the link never breaks; optionally
  refresh the slug (rename the file `<id>-<oldSlug>.md` → `<id>-<newSlug>.md`
  and update the field) for browsability. Id prefix guarantees no collision.
- **Node delete:** **archive, never hard-delete** — `rename` the file to
  `<folder>/.Deleted-<nodeId>-<slug>-<deletedAtISO>.md` (§11.4). Hook the
  existing `deleteNode` op.
- **Empty note:** keep the empty file (Phase 1 already does this on save);
  confirm on the delete-key/clear paths.
- **"Tidy notes folder" action** (optional, ⚙ menu): purge `.Deleted-*`
  archives and any orphaned files (files with no matching node). Pure
  `planTidy(tree, folderListing)` → deletions; adapter executes.
- **Tests:** unit for rename/delete/tidy planners; archive-name uniqueness via
  timestamp; orphan detection.

**DoD:** rename keeps links; delete archives (recoverable, hidden); tidy removes
archives/orphans on demand; nothing is ever silently destroyed.

## Phase 4 — Safety sandbox + cross-platform + web/iOS read-only

**Goal:** make the trust boundary real and the behavior correct off-desktop.

- **Canonicalized subtree enforcement** (§9): before any read/write, resolve +
  canonicalize (symlinks included) and assert the path is inside `<docDir>`.
  Out-of-subtree `notes:` refs are **refused on load** — shown read-only /
  flagged, never read. Implement in `resolveNotesPath` + a guard; for
  symlink-real-path resolution, add a small **Rust command** (`canonicalize` +
  containment check) since JS can't fully canonicalize on all platforms.
- **Tauri capability** (`src-tauri/capabilities/default.json`): keep functional,
  but document that the *effective* scope is enforced app-side; optionally add
  the native containment command as the authoritative check.
- **Cross-platform paths:** store forward-slash relative paths; resolve per-OS
  (Windows separators) in the adapter.
- **Web / iOS:** folder notes are **read-only** — no FS writes; show the
  existing sidecar read-only banner with copy explaining desktop-only. Folder
  mode's *setting* is inert there.
- **Tests:** unit — reject `../`, absolute, `~`, and (mocked) symlink-escape;
  path-normalization per-OS; web returns read-only for folder refs.

**DoD:** a hostile `.clobmap.yaml` cannot read/write outside its folder;
Windows/macOS/Linux paths resolve correctly; web/iOS degrade to read-only.

## Phase 5 — Settings UI, default-on, docs, release

**Goal:** expose it, flip the default, ship it.

- **Settings UI** (⚙): "Note storage" toggle (Inline / Notes folder) + a folder-
  name field with inline validation (rejects invalid folders per Phase 0/4).
  Desktop-only section; on web show it disabled with a "desktop only" note.
- **Flip default-on** (§11.2): remove the Phase-0 flag; desktop default =
  `folder`. First open of any doc migrates silently (Phase 2).
- **Docs:** `README` (note-storage section), `docs/manual-testing-guide.md`
  (new desktop matrix: migrate, add/edit/clear/delete, move folder, rename
  folder, out-of-subtree refusal, web read-only), `CHANGELOG` `### Added`,
  `ARCHITECTURE` (the planner/adapter split + trust boundary).
- **Version:** `npm run version:bump -- 2.1.0` (new feature → minor).
- **Release:** per `RELEASING.md`; the desktop build is the real gate (this is
  a desktop-behavior change touching the FS) — verify a local `tauri build`
  and let CI do the signed cross-platform build before publish.

**DoD:** the setting is discoverable and validated; desktop defaults to folder
mode; docs synced; `npm test` + `npm run e2e` + a desktop build all green;
released as 2.1.0.

---

## Test plan (summary)

- **Unit (primary):** slug/filename/archive-name; folder validation + subtree
  containment; `planMigration` / `planTidy` / rename / delete planners;
  `saveNotes`/`loadNotes` folder branch against a **mock FS adapter**. Target:
  the pure `notesFolder.ts` + the notes-layer branches at/near 100%.
- **e2e (guardrail):** existing web/inline suites stay green (folder mode is
  desktop-gated). No new web e2e for FS (can't).
- **Manual desktop matrix:** the real Tauri path (Phase 5 doc), run before
  release on macOS at minimum.
- **Security:** explicit unit cases for path-escape / symlink / absolute / `~`.

## Data model & compatibility

- **No `.clobmap.yaml` schema change** — `notes:` stays a string (inline *or*
  path). Old docs open unchanged; inline mode is fully preserved.
- **Forward/back:** folder→inline switch is **non-destructive** (§11.5, R4) —
  existing files stay files; only new notes on note-less nodes go inline.
- **Legacy dotfile sidecars** are migrated in (Phase 2), not orphaned.

## Rollback / safety net

- Feature flag (Phases 0–4) keeps `main` shippable at any point.
- Migration is one undo transaction + a normal dirty edit → `Cmd/Ctrl+Z` / git.
- Deletes archive rather than destroy; tidy is opt-in.

## Risks & mitigations (delta to spec §12)

| Risk | Mitigation |
|---|---|
| FS logic hard to test (desktop-only) | Pure planner + mock FS adapter; keep disk I/O in one thin module |
| Silent default-on migration alarms users | It's undoable + git-friendly; document prominently; archives, never deletes |
| JS can't fully canonicalize symlinks | Native Rust `canonicalize`+containment command as the authoritative guard (Phase 4) |
| Folder name `notelets/` overlaps the Notelets view | Documented, user-overridable; revisit if it confuses in testing |
| Autosave races with migration write | Run migration as one transaction before the dirty-tracker/autosave engages (mirror the App.tsx bootstrap ordering) |

## Suggested commit / PR sequence

1. `feat(notes): note-storage setting + pure folder helpers` (Phase 0)
2. `feat(notes): folder-mode write path for new notes` (Phase 1)
3. `feat(notes): silent migration inline/sidecars → folder on open` (Phase 2)
4. `feat(notes): rename/delete(archive)/empty/tidy lifecycle` (Phase 3)
5. `feat(notes): subtree sandbox + cross-platform + web read-only` (Phase 4)
6. `feat(notes): settings UI, default-on; docs; chore: bump 2.1.0` (Phase 5)

Phases 1–4 can land behind the flag in any order that keeps CI green; the
default only flips in Phase 5.

## Out of scope (per spec §13)

External/non-subtree note locations; cloud sync; WYSIWYG; web/iOS write support;
the `lean-yaml`/positions-file idea (§11.7, deferred).
