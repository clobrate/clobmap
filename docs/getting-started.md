# Getting started

A 5-minute tour of clobmap. If you've never used a mind-map tool before,
start here.

## What's a mind map?

A way to break a topic into branches and sub-branches. You start with one
central idea (the **root**), then add **children** for the parts of it,
then children of those, and so on.

It's the same shape as a file tree, an org chart, or a nested bullet
list — just rendered as a tree of boxes you can see all at once.

When clobmap first opens you'll see a sample mind map for **wedding
planning** — "Our wedding" branches into Venue / Guests / Vendors /
Schedule, each of which has its own children. That's the shape.

## Your first edits (3 keystrokes)

Click any node to select it (a green border appears). Then:

| Press | What happens |
|---|---|
| `Tab` | Add a child below the selected node, ready to type |
| `Enter` | Add a sibling next to the selected node |
| `F2` | Rename the selected node |

That's all you need to build a tree from scratch. Starting from an empty
"Untitled" doc:

1. Click the root node.
2. `F2`, type **Trip to Tokyo**, press Enter.
3. `Tab` (adds a child), type **Flights**, Enter.
4. `Enter` (adds a sibling), type **Hotels**, Enter.
5. `Enter`, type **Things to do**, Enter.

You now have a 4-node mind map. It looks like:

```
Trip to Tokyo ─┬─ Flights
               ├─ Hotels
               └─ Things to do
```

## Moving around without the mouse

Once a node is selected, arrow keys navigate:

| Press | What happens |
|---|---|
| `↑` / `↓` | Move to the previous/next sibling |
| `→` | Move to the first child (auto-expands collapsed branches) |
| `←` | Move to the parent |
| `Space` | Collapse / expand the selected node |
| `Delete` / `Backspace` | Delete the selected subtree (root is protected) |
| `Esc` | Cancel rename / clear clipboard |
| `Cmd+0` | Fit the whole map to the viewport |

For more long-range moves, you can also drag a node onto another node
to reparent it. Or **cut/paste**: `Cmd+X` on the source to mark it
(it dims), select a target, `Cmd+V`.

## Two views, one document

The toggle in the header (or `Cmd/Ctrl + /`) switches between three
layouts:

- **Mind-map** — the visual tree.
- **YAML** — the same document as text. Useful for bulk renames,
  copy/paste between maps, or writing nodes faster than clicking.
- **Split** — both at once.

Edits in either propagate to the other. Selecting a node in the
mind-map jumps the YAML cursor to that line.

The YAML format is straightforward — every node has `id`, `text`, and
optionally `children`, `note`, `color`, `collapsed`. See
[the README](../README.md#yaml-format) for the full schema.

## Files

- `Cmd+N` — new file (new tab on desktop)
- `Cmd+O` — open
- `Cmd+S` — save
- `Cmd+Shift+S` — save as

Mind maps save as `.clobmap.yaml` files. The trailing `.yaml` is so
every YAML-aware tool (vim, VS Code, GitHub diff) syntax-highlights
them automatically; the `.clobmap.yaml` compound suffix lets the OS
register clobmap as the handler for *just* mind-map files without
hijacking every YAML file on your disk. Plain `.yaml` / `.yml` files
also open.

## What clobmap is good for

- Trip plans, party planning, project breakdowns, meeting notes,
  reading lists, interview prep — anything you'd put in nested bullet
  points.
- Working out the structure of something before writing it long-form
  (an essay, a talk, a doc).
- Capturing a brain-dump from a conversation, then editing the YAML
  to clean it up later.

## What clobmap is NOT good for

- Real-time collaboration. It's a single-user file editor.
- Free-form positioning / arbitrary layouts. Every node belongs to
  exactly one parent — no diagrams with cross-links between branches.
- Whiteboarding with images / drawings. Just text nodes.

If those are what you want, look at Mural, FigJam, Excalidraw, or
Obsidian Canvas instead.

## Keep going

- All keyboard shortcuts and the mind-map view's full action list:
  [README → Use it](../README.md#use-it).
- Privacy: [PRIVACY.md](../PRIVACY.md) — local-first; nothing leaves
  your disk unless you explicitly turn on Sentry.
- Issues / feedback: <https://github.com/clobrate/clobmap/issues>.
