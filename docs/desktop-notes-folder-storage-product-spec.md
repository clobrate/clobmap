# Desktop Note Storage — File-per-Note "Notes Folder" (Product Spec)

Status: **Proposed** — 2026-09-26. Branch: TBD. Target: desktop only (a later minor, e.g. 2.1.0).
Author: Kiran (with Claude)
Grounded in: `src/lib/notes.ts`, `src/lib/settings.ts`, `src/components/NotesPopup.tsx`, `src/lib/useNodeNotes.ts`. Related: `docs/notelets/notelets-product-doc.md`.

---

## 1. Summary

On the **desktop app**, add a note-storage mode where **every node's notes
live as an individual Markdown file** in a subfolder next to the
`.clobmap.yaml` — **regardless of note size** — instead of being inlined into
the YAML. When this mode is on (a.k.a. "inline notes OFF"), opening a document
**automatically migrates** any inline notes to per-node `.md` files under the
folder. The folder is user-configurable but **must be a subfolder of the
document's own directory**; clobmap never reads or writes note files outside
that subtree.

The result: the `.clobmap.yaml` holds structure + short relative paths, and
prose lives in real, editable `.md` files — clean git diffs, portable relative
links, and a folder you can move as a unit without breaking anything.

## 2. Problem / motivation

Today (2.0.2), notes use a **size-driven, invisible split** (`src/lib/notes.ts`):

- Notes ≤ **`NOTES_INLINE_LIMIT` (800 chars)** are stored **inline** in the
  YAML `notes:` field.
- Longer notes are auto-extracted to a **hidden dotfile sidecar** at the doc
  root: `./.<docBase>_<nodeId>_<text>.md`.

This has real friction for the target user (someone who versions docs in git
and thinks of notes as documents):

- **Noisy git diffs.** Long-form prose inlined in the `.yaml` means every note
  edit churns the structure file; multi-line notes bloat it.
- **Hidden, scattered files.** Sidecars are dotfiles at the doc root — easy to
  miss, awkward to browse, and not obviously "the notes."
- **The split is invisible and size-driven.** Whether a note is inline or a
  file depends on a 800-char threshold the user can't see or control.
- **Notes aren't first-class files.** Users can't easily open a node's note in
  their own Markdown editor, grep the folder, or diff a single note.

A consistent **one visible `.md` per node, in a named folder** model fixes all
of these and makes clobmap docs behave like a normal folder of Markdown in git.

## 3. Goals

1. **Desktop file-per-note storage.** A mode where *all* notes are individual
   `.md` files under a doc-relative subfolder, irrespective of size — no
   inline notes, no 800-char cap.
2. **Clean git.** The `.yaml` carries structure + short relative note paths;
   prose lives in per-node files → small, reviewable diffs; `git blame` per
   note works.
3. **Portability via relative paths.** Links are `./<folder>/<file>.md`
   relative to the doc. Moving or renaming the folder (the `.yaml` and its
   subfolder together) never breaks a link.
4. **Sandboxed safety.** Note files are only ever read/written **within the
   document's own directory subtree**. No absolute paths, no `~`, no `..`
   escapes, no symlinks out of the subtree.
5. **Automatic, lossless migration** when the mode is on — inline notes and
   existing sidecars are moved into the folder on open, with no content loss.

## 4. Non-goals

- **No web/iOS write support.** Those platforms can't write local files, so
  folder notes there are **read-only** (exactly how sidecar path-refs behave
  today). This mode is a desktop capability.
- **No arbitrary/external note locations.** The folder must be under the doc
  dir. This is not a vault/sync system or a way to point at notes anywhere.
- **No `.clobmap.yaml` schema change.** The `notes:` field stays a string that
  is *either* inline content *or* a path reference — only the **policy** for
  which one gets written changes. Old docs still open.
- **Inline mode isn't removed.** It stays as a supported, toggleable mode.

## 5. Target user / context

Desktop users who **keep their `.clobmap.yaml` in git** (or just want notes as
real files): developers, writers, and anyone who wants readable diffs, files
they can open in any editor, and a folder they can move/commit/share.

## 6. Proposed design

### 6.1 The setting
- New persisted setting **"Note storage"** with two modes (desktop only,
  `src/lib/settings.ts`):
  - **`inline`** — today's behavior (inline up to 800 chars, then sidecar).
  - **`folder`** — file-per-note under a doc-relative subfolder ("inline notes
    OFF"). **This is the desktop default, on from the first release** (§11.2).
- Plus a **folder name** setting — **default `notelets/`** (§11.1) — editable
  per the constraints in §6.3.

### 6.2 Storage format (folder mode)
- Each node with notes → one file `./<folder>/<filename>.md`.
- The YAML `notes:` field stores the **relative path** `./<folder>/<file>.md`
  (leading `./`, forward slashes) — already a valid path-reference per
  `isPathReference()`; `resolveNotesPath()` resolves it against the doc dir.
- **Filename = `<nodeId>-<slug>.md`** (§11.3) — the stable node id keeps the
  link across renames/moves; the slug (from node text) makes the folder
  browsable. This differs from today's root-level hidden `.<doc>_<id>_<text>.md`
  — folder-mode files are **visible** and grouped.
- Notes are written **irrespective of size** (no `NOTES_INLINE_LIMIT` gate in
  this mode).

### 6.3 Folder rules (the safety boundary)
- The folder is a **relative subfolder of the document's directory**. Default
  is a single subfolder; the user may choose a different one (including nested,
  e.g. `docs/notes/`), but it **must resolve to inside the doc dir**.
- **Rejected:** absolute paths, `~/…`, any path that escapes the doc dir via
  `..`, and symlinks whose real path is outside the subtree. Validation is on
  the **canonicalized** path, not the string.
- **On load**, a `notes:` path that resolves outside the doc subtree is
  **refused** (shown read-only / flagged), never silently read. This is a hard
  security property: a shared `.clobmap.yaml` can't make clobmap read arbitrary
  files off your disk.

### 6.4 Save / load / empty
- **Save (folder mode):** always write the `.md` (even a one-line note); set
  `notes:` to the relative path. Extends `saveNotes()` in `src/lib/notes.ts`.
- **Load:** unchanged path — `loadNotes()` reads the file via
  `resolveNotesPath()`; the Notelets view and NotesPopup both go through
  `useNodeNotes` so they work transparently with folder paths.
- **Empty notes:** clearing a note **leaves an empty `.md` file in place** and
  keeps the `notes:` path pointing at it, so the next edit **reuses the same
  file** — no delete-on-empty (§11.4).
- **Node deleted:** the note file is **never hard-deleted** — it is **renamed
  to a hidden archive** `./<folder>/.Deleted-<nodeId>-<slug>-<deletedAt>.md`
  (the leading `.` hides it; `<deletedAt>` timestamp keeps each deletion unique
  so a re-created id never collides) (§11.4).

### 6.5 Migration (mode = folder, on open)
- On opening a doc while folder mode is on, run a **single migration pass**:
  - Inline `notes:` values → written out to `./<folder>/<file>.md`, field
    replaced with the path.
  - Existing sidecars (today's root dotfiles, or files already elsewhere in the
    subtree) → **re-homed** into the folder, field updated.
  - Then the updated `.yaml` is saved (dirtying the doc; user sees it and can
    undo / rely on git).
- Migration **into** folder mode is **lossless**. Turning **inline mode back
  on is *not* a back-migration**: existing note files are **left as files**
  (even if under 800 chars), and any node already linked to a `.md` keeps
  writing to that same file. Only **new notes added to nodes that currently
  have none** are written inline from then on. (This matches today's
  `saveNotes` rule that a field already pointing at a sidecar keeps that
  linkage — so the switch is non-destructive and no content is ever moved back
  into the YAML.)
- Migration is **silent and undoable** (§11.6): **no confirm dialog and no
  notice** — it lands as a normal dirty edit that `Cmd/Ctrl+Z` (and git)
  reverse.

## 7. Requirements

- **R1** Persisted desktop-only "Note storage" setting (`inline` | `folder`) +
  folder-name setting, in `src/lib/settings.ts`.
- **R2** Folder mode writes one `.md` per node **irrespective of size**; YAML
  stores `./<folder>/<file>.md`.
- **R3** Folder-path validation on the **canonicalized** path: relative,
  inside the doc dir, no `..`/absolute/`~`/symlink escape. Out-of-subtree refs
  are refused on load.
- **R4** Automatic, lossless **migration on open** in folder mode (inline →
  files; existing sidecars → folder). Turning **inline mode on does NOT
  back-migrate** existing note files — they stay as files (even under 800
  chars); only **new notes on note-less nodes** are written inline thereafter.
- **R5** Filenames `<nodeId>-<slug>.md`; node rename keeps the link (id-stable;
  the slug may refresh). **Clearing** a note keeps an empty, reusable file;
  **deleting** a node renames its file to a hidden
  `.Deleted-<nodeId>-<slug>-<deletedAt>.md` archive (never a hard delete).
- **R6** Web/iOS: folder notes are **read-only** (no FS writes), consistent
  with current sidecar handling; a clear banner explains why.
- **R7** Move-safety: relative-only paths so moving the `.yaml` + folder
  together preserves every link. No absolute paths ever written.
- **R8** Reuse/extend `src/lib/notes.ts` (`isPathReference`, `resolveNotesPath`,
  `saveNotes`, `loadNotes`) rather than forking a parallel path; the Notelets
  view + NotesPopup keep working unchanged.

## 8. Design constraints & interactions

- **One code path for notes.** NotesPopup and the Notelets view both read/write
  via `useNodeNotes` → `loadNotes`/`saveNotes`. Folder mode must slot into that
  path, not create a second one.
- **Coexistence.** Docs may already contain inline notes *and* today's hidden
  dotfile sidecars; migration must fold both into the folder cleanly.
- **Filename hygiene.** Sanitize slugs (unsafe chars, length, unicode,
  collisions across nodes with identical text) — id prefix guarantees
  uniqueness.
- **No cap in folder mode.** `NOTES_INLINE_LIMIT` is bypassed; it still governs
  `inline` mode.
- **Cross-platform paths.** Store forward-slash relative paths; resolve per-OS.

## 9. Security & sandboxing (the "no reading outside the folder" rule)

This is a first-class safety property, not just a convenience:

- All note file access is confined to the **document's directory subtree**.
- Validation happens on the **resolved, canonicalized** path (symlinks
  included), so `notes: ../../etc/passwd` or a symlinked folder can't exfiltrate
  files.
- A `.clobmap.yaml` received from someone else can therefore never cause
  clobmap to read or write outside the folder it lives in.
- (Tauri's own FS scope/capabilities should be aligned with this so the
  backend enforces it too, not just the frontend.)

## 10. Success criteria

- With folder mode on, a fresh note of *any* length is saved as a visible
  `.md` under the folder; the `.yaml` shows only a short relative path.
- Opening an inline-notes doc in folder mode migrates it losslessly. Switching
  to inline mode afterward leaves every existing note file untouched (no
  re-inlining, even under 800 chars); only newly authored notes on note-less
  nodes go inline.
- Moving the `.yaml` + its notes folder to a new location (or renaming the
  folder via the setting) keeps every note resolvable.
- A doc referencing a note outside its subtree is refused (read-only/flagged),
  never read.
- git diff of a single note edit touches **only** that one `.md` file.
- Web/iOS open folder-mode docs with notes shown read-only + a clear banner.

## 11. Decisions (resolved 2026-09-26)

1. **Folder name = `notelets/`** — accepted, even though it shares the word
   with the Notelets *view* (user: "It is OK"). Still user-overridable per §6.3.

2. **Desktop default = folder mode ON** from the first release (every desktop
   doc migrates on first open — silently, per §11.6).

3. **Filename scheme = `<nodeId>-<slug>.md`** — the recommended option: a
   stable node-id prefix (survives renames) plus a readable slug from the text.

4. **Empty note & deleted node:**
   - **Empty note → keep the empty `.md` file** (field keeps pointing at it) so
     the next edit reuses the same file — no delete-on-empty.
   - **Deleted node → rename, never delete:** the file becomes a hidden archive
     `.Deleted-<nodeId>-<slug>-<deletedAt>.md` (leading `.` hides it; the
     timestamp keeps each deletion unique so a re-created id never collides).

5. **Inline-mode switch — DECIDED (2026-09-26):** turning inline mode on does
   **not** re-inline or remove existing note files — they stay as files (even
   under 800 chars), and file-linked nodes keep writing to their file. Only
   **new notes on nodes that have none** are written inline thereafter. No
   destructive back-migration.

6. **Migration UX = silent + undoable** — no confirm dialog and no notice; the
   migration lands as a normal dirty edit that `Cmd/Ctrl+Z` (and git) reverse.

7. **Relationship to `lean-yaml` / positions-in-a-separate-file — deferred.**
   The user is still deciding whether to pursue that idea; it is out of scope
   for this spec and nothing here assumes it.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Auto-migration (default-on) mutates the doc/folder on first open | It's a normal dirty edit — `Cmd/Ctrl+Z` and git reverse it; folder mode is the documented desktop default |
| Path-escape / symlink exfiltration | Validate the **canonicalized** resolved path is within the subtree; align Tauri FS scope |
| Filename collisions / unsafe slugs | Id-prefixed filenames guarantee uniqueness; sanitize + length-cap slugs |
| Deleted-node files pile up in the folder | Deletes are archived as hidden `.Deleted-…` files (recoverable + out of the way); an optional "tidy notes folder" action can purge them |
| Two storage modes drift in behavior | Single `notes.ts` code path; mode only changes the *write policy* |
| Moving only the `.yaml` (not the folder) breaks links | Docs/UX make the folder a sibling that travels with the doc; relative paths keep it simple |

## 13. Out of scope (future, if ever)

- Notes anywhere outside the doc subtree; cloud/sync backends.
- Rich-text/WYSIWYG note editing (Markdown-only stays).
- A general "vault" or multi-doc shared-notes store.
- Web/iOS local-file **write** support (platform limitation).
