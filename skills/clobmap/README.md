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

Two ways to get the CLI.

### Bundled with the desktop app (easiest — no Node, no clone)

The CLI ships **inside the desktop installer** as a self-contained binary.
Install clobmap, then accept the first-run prompt or open **Settings →
Command-line tool → Install**. The command is `clobmap` on macOS/Windows and
**`clobmap-cli` on Linux** (the Linux GUI binary already owns the name
`clobmap`). Linux `.deb`/`.rpm` packages also put it on PATH at install time.

```bash
clobmap tree ~/Documents/mymap.clobmap.yaml       # macOS / Windows
clobmap-cli tree ~/Documents/mymap.clobmap.yaml   # Linux
```

The desktop app watches its open file for external changes, so CLI edits show up
live (and vice-versa) — just avoid holding unsaved edits on both sides at once.

### From the source repo (for development)

The repo runs the CLI from TypeScript via `tsx` — no compiled binary needed:

```bash
git clone https://github.com/clobrate/clobmap.git
cd clobmap
npm install                       # provides tsx, the runner
npm run clobmap -- --help         # run from the repo root
```

`npm run clobmap` **must be run from the repo root** (where `package.json`
lives). Optionally alias it so you don't have to `cd` in each time — point at the
repo's local `tsx` + `cli.ts` (absolute paths) in `~/.zshrc` / `~/.bashrc`:

```bash
alias clobmap='/ABS/PATH/TO/clobmap/node_modules/.bin/tsx /ABS/PATH/TO/clobmap/skills/clobmap/cli.ts'
```

### Using it from an AI agent

With the bundled CLI on PATH, an agent can just run `clobmap` / `clobmap-cli`
directly. [`SKILL.md`](./SKILL.md) is written in **Claude Code's** skill format,
so Claude Code can auto-discover and invoke it; other agents (e.g. Codex) don't
read that format, so point them at `SKILL.md` as the command reference and have
them call the CLI (`clobmap …`, or `npm run clobmap -- …` from a repo clone).

To install the skill for Claude Code from the terminal:

```bash
clobmap skill install     # copies SKILL.md to ~/.claude/skills/clobmap/
clobmap skill status      # installed? which version? (--json for scripts)
clobmap skill uninstall   # removes it — only if clobmap installed it
```

It uses `$CLAUDE_CONFIG_DIR` when set. The desktop app's **Settings → Claude
Code skill** does the same thing, and the two recognize each other's install
via the `.clobmap-install.json` marker (`skill-install.ts` here,
`src-tauri/src/skill_tool.rs` in the app — keep them in step; the contract is in
[`docs/clobmap-skill-app-install-product-doc.md`](../../docs/clobmap-skill-app-install-product-doc.md)
§9). A folder without that marker — e.g. your own symlink to this repo — is
never modified. The marketplace plugin (`clobmap@clobmap`) is the alternative
route; install one or the other.

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
| `skill-install.ts` | `skill status/install/uninstall` — the Claude Code skill in `~/.claude/skills/clobmap`. |
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
