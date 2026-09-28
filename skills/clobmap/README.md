# clobmap skill

A headless, CLI-only toolkit for creating and editing `.clobmap.yaml`
documents. It reuses clobmap's own pure model layer (`src/model`), so every
edit **round-trips losslessly** — comments, key order, and formatting survive.

For the full command reference, addressing model, batch format, and recipes,
see **[SKILL.md](./SKILL.md)** — that's the file an agent reads to use this.

## Quick start

```bash
npm run clobmap -- new demo.clobmap.yaml --title "Demo"
npm run clobmap -- tree demo.clobmap.yaml
npm run clobmap -- add-child demo.clobmap.yaml --parent <id|title> --text "Idea"
```

`npm run clobmap -- --help` prints the command list.

## Setup on another machine

**This skill ships in the clobmap _source repo_, not the installed desktop
app.** The `.dmg` / `.msi` / `.AppImage` you install is only the GUI — it does
not include this CLI, `package.json`, or `npm`. So `npm run clobmap` fails with
"could not read package.json" unless you run it from a clone of the repo, and
there is no globally-installed "skill" for an agent to auto-discover.

To use it on a new machine:

```bash
# 1. Clone the repo (once)
git clone https://github.com/clobrate/clobmap.git
cd clobmap

# 2. Install dev deps — this provides tsx, the runner
npm install

# 3. Run it — from the repo root
npm run clobmap -- --help
```

`npm run clobmap` **must be run from the repo root** (where `package.json`
lives). It operates on any `.clobmap.yaml` file, anywhere — including maps you
created in the desktop app:

```bash
npm run clobmap -- tree ~/Documents/mymap.clobmap.yaml
```

The desktop app watches its open file for external changes, so CLI edits show up
live (and vice-versa) — just avoid holding unsaved edits on both sides at once.

### Run it from anywhere (optional alias)

Point an alias at the repo's local `tsx` + `cli.ts` (absolute paths) so you
don't have to `cd` in each time. In `~/.zshrc` / `~/.bashrc`:

```bash
alias clobmap='/ABS/PATH/TO/clobmap/node_modules/.bin/tsx /ABS/PATH/TO/clobmap/skills/clobmap/cli.ts'
```

Then from any directory: `clobmap tree ~/anything.clobmap.yaml`. (Replace the
path with your clone; the repo still needs `npm install` done once.)

### Using it from an AI agent

[`SKILL.md`](./SKILL.md) is written in **Claude Code's** skill format, so Claude
Code can auto-discover and invoke it. Other agents (e.g. Codex) don't read that
format — there's nothing to "install." To have any agent use it, point it at
this repo and tell it to run `npm run clobmap -- <command>`, using `SKILL.md` as
the command reference. It's a plain CLI underneath — no special registration.

## Layout

| File | Role |
|------|------|
| `cli.ts` | Command dispatch; `run(argv)` (testable) + a process entrypoint. |
| `core.ts` | Round-trip engine: `loadDoc` → mutate → `serialize` → `atomicWrite`. |
| `addressing.ts` | `resolveNodeId` — id / `A › B` path / title (ambiguity error). |
| `helpers.ts` | Shared resolvers (mode, tag id, list/side/number parsing). |
| `notes-fs.ts` | Node twin of the app's note I/O; sandboxed to the doc's folder. |
| `export.ts` | `export-notes` markdown (app-identical) + `find`. |
| `batch.ts` | `apply` — atomic JSON op-list applier. |
| `format.ts` | `tree` outline + dry-run line diff. |
| `__tests__/` | Unit + recipe smoke suites (`vitest`). |

## Design notes

- **Never hand-edit `.clobmap.yaml`** — go through this CLI. It keeps ids
  unique, the tag tree consistent, and note files sandboxed.
- Pure model reuse only: no Tauri, no React, no browser globals. Disk access is
  Node `fs`; note-file naming/validation is shared with the app via
  `src/lib/notesFolder.ts`.
- Runs under `tsx` (`npm run clobmap`). Typechecked via `tsconfig.skills.json`.

The design rationale lives in
[`docs/clobmap-skill-product-doc.md`](../../docs/clobmap-skill-product-doc.md)
and the phased plan in
[`docs/clobmap-skill-implementation-plan.md`](../../docs/clobmap-skill-implementation-plan.md).
