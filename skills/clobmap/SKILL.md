---
name: clobmap
description: >-
  Create and edit clobmap mind-map documents (.clobmap.yaml) from the command
  line — add/move/rename/delete nodes, edit notes (inline or a notes folder),
  manage tags and the tag tree, set color/size/layout/positions, query, export
  notes to markdown, and batch many edits atomically. Use whenever you need to
  author or modify a .clobmap.yaml file without opening the app.
---

# clobmap — headless document toolkit

Author and edit `.clobmap.yaml` documents from the command line. Every command
goes through clobmap's own model layer, so edits **round-trip losslessly** —
comments, key order, and formatting are preserved.

## When to use this

- Create a new mind map and populate it programmatically.
- Add / rename / move / delete / duplicate nodes.
- Write, append, prepend, or clear a node's notes (inline or in a notes folder).
- Add / remove tags on nodes; restructure the tag tree.
- Set a node's color, size, edge sides, or manual position; toggle layout.
- Query nodes, or export all notes to markdown.
- Apply many edits in one atomic batch.

## The one hard rule

**Never hand-edit a `.clobmap.yaml` file, and never write one with a text
editor or `echo`/`cat`.** Always use this CLI. It preserves comments and key
order, keeps ids unique, keeps the tag tree consistent, and sandboxes note
files. Hand-editing silently corrupts those invariants.

## Running it

From the repo root:

```bash
npm run clobmap -- <command> <file> [args]
# or directly:
npx tsx skills/clobmap/cli.ts <command> <file> [args]
```

Global flags on any mutating command:

- `--dry-run` — print a unified diff of the change, write nothing.
- `--json` — machine-readable output (`{ok, file, affected}` on success,
  `{error}` on failure). Exit code is `0` on success, `1` on error.

## Addressing a node (`<ref>`)

A `<ref>` resolves in this order:

1. **Exact node id** (e.g. `n2`) — preferred; unambiguous and stable.
2. **Path** containing `›` (e.g. `"Wedding › Venue › Ceremony"`) — matches by
   title down the tree.
3. **Title** (e.g. `"Venue"`) — errors if more than one node has that title.

**In scripts, prefer ids.** Titles are convenient for one-offs but ambiguous.
Get ids from `tree`, `find --json`, or the `affected` array of a prior command.
Tag refs are similar: a **tag id** or a **tag name** (errors if ambiguous).

## Command reference

Structure:

```
new <file> [--title T] [--force]
info|tree|validate <file>
add-child <file> --parent <ref> --text T [--index N]
add-sibling <file> --after <ref> --text T
rename <file> <ref> --text T
delete|duplicate <file> <ref>
move <file> <ref> --to <ref> [--index N]
reorder <file> <ref> --up|--down
collapse <file> <ref> --on|--off
```

Notes (inline under ~800 chars, else a folder file; `--notes-mode` forces it):

```
note-get <file> <ref>
note-set|note-append|note-prepend <file> <ref> --text T | --from PATH
note-clear <file> <ref>
  flags: --notes-mode inline|folder   --notes-folder NAME   (default: infer, ./notelets)
```

Tags + tag tree (tag refs are name or tag id):

```
tag-add|tag-remove <file> <ref> --tags a,b
tag-rename <file> <old> <new>       # cascades to every node + the tree
tag-delete <file> <name>            # cascades
tag-move <file> <tag> [--under <parent>]
tag-reorder <file> <tag> --up|--down
```

Appearance + layout:

```
color-set <file> <ref> --color <value>   |   color-clear <file> <ref>
size <file> <ref> [--max-width N] [--max-height N]   # 0 clears that dimension
layout <file> --auto|--manual
pos-set <file> <ref> --x N --y N          # switches the doc to manual layout
pos-clear <file> [<ref>]                  # no ref clears every node's position
edge-side <file> <ref> [--from side] [--to side]   # top|right|bottom|left
```

Read-side + batch:

```
export-notes <file> [--out PATH]          # markdown of every node's notes
find <file> [--text q] [--tag t] [--color c]
apply <file> --ops <ops.json>             # atomic JSON op-list (see below)
```

## Batch edits — the JSON op-list

`apply <file> --ops ops.json` runs many edits against one in-memory tree, **in
order**, then writes **once**, atomically. Created ids stay unique across the
batch. **A single bad op aborts the whole batch — nothing is written.** Use
`--dry-run` to preview the combined diff.

Each op is an object whose `op` field names a mutating command; the rest are its
arguments (flag names without the dashes; `--parent` → `parent`, `--text` →
`text`, tags as a list or `"a,b"`):

```json
[
  { "op": "add-child", "parent": "n1", "text": "Venue" },
  { "op": "add-child", "parent": "n1", "text": "Guests" },
  { "op": "color-set", "ref": "Venue", "color": "#f59e0b" },
  { "op": "tag-add",   "ref": "Guests", "tags": ["vip", "family"] },
  { "op": "note-set",  "ref": "Venue", "text": "# Booked\n\nGrand Hall, 6pm" }
]
```

Note ops accept `notesMode` / `notesFolder` per op (same meaning as the flags).

## Recipes

### 1. Create a document and add a subject with pages

```bash
npm run clobmap -- new trip.clobmap.yaml --title "Japan Trip"
ROOT=$(npm run --silent clobmap -- tree trip.clobmap.yaml | head -1 | sed -E 's/.*\[([^]]+)\].*/\1/')
npm run clobmap -- add-child trip.clobmap.yaml --parent "$ROOT" --text "Flights" --json
npm run clobmap -- add-child trip.clobmap.yaml --parent "$ROOT" --text "Hotels"  --json
```

### 2. Add notes to a node (folder mode — one .md per node)

```bash
# For multi-line notes use bash $'...' (real newlines) or --from PATH;
# a plain "...\n..." passes a literal backslash-n, not a newline.
npm run clobmap -- note-set trip.clobmap.yaml "Flights" \
  --text $'# Depart\n\nSFO → HND, 11:00' --notes-mode folder
npm run clobmap -- note-append trip.clobmap.yaml "Flights" --text "Seat 32A"
```

### 3. Tag + color a subtree

```bash
npm run clobmap -- tag-add   trip.clobmap.yaml "Hotels" --tags "booked,paid"
npm run clobmap -- color-set trip.clobmap.yaml "Hotels" --color "#22c55e"
npm run clobmap -- tag-move  trip.clobmap.yaml "paid" --under "booked"
```

### 4. Batch several edits atomically

```bash
cat > ops.json <<'JSON'
[
  { "op": "rename",    "ref": "Flights", "text": "Air travel" },
  { "op": "add-child", "parent": "Air travel", "text": "Return" },
  { "op": "tag-add",   "ref": "Air travel", "tags": ["confirmed"] }
]
JSON
npm run clobmap -- apply trip.clobmap.yaml --ops ops.json --dry-run   # preview
npm run clobmap -- apply trip.clobmap.yaml --ops ops.json             # commit
```

### 5. Query and export

```bash
npm run clobmap -- find trip.clobmap.yaml --tag booked --json
npm run clobmap -- export-notes trip.clobmap.yaml --out trip-notes.md
```

## Notes-folder & safety

- Inline notes live in the YAML until ~800 chars; past that (or with
  `--notes-mode folder`) each node's note is a `<id>-<slug>.md` file under the
  notes folder (default `./notelets`, doc-relative).
- Note files are **sandboxed** to the document's own directory subtree — a
  `notes:` value pointing outside it (via `../`, absolute, `~`) is refused.
- `--dry-run` never touches note files either.
