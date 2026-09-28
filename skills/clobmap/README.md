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
