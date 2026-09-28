/**
 * clobmap skill CLI — Phase 1: document + tree commands.
 *
 * Every mutation goes through the model layer (via `core.withDoc`/`edit`), so
 * output always round-trips. `run(argv)` is pure-ish (returns code/out/err) for
 * tests; `main` wraps it onto the process.
 *
 * Usage:
 *   clobmap new <file> [--title T] [--force]
 *   clobmap info|tree|validate <file>
 *   clobmap add-child <file> --parent <ref> --text T [--index N]
 *   clobmap add-sibling <file> --after <ref> --text T
 *   clobmap rename <file> <ref> --text T
 *   clobmap delete|duplicate <file> <ref>
 *   clobmap move <file> <ref> --to <ref> [--index N]
 *   clobmap reorder <file> <ref> --up|--down
 *   clobmap collapse <file> <ref> --on|--off
 * Global flags: --dry-run (preview a diff, no write), --json (machine output).
 */
import { promises as fsp } from "node:fs";
import { parseArgs } from "node:util";
import {
  addChild,
  addSibling,
  deleteNode,
  duplicateNode,
  emptyDocument,
  idGeneratorForDocument,
  moveNode,
  moveSibling,
  serializeYaml,
  updateNode,
  updateText,
  applyTreeToDocument,
  type IdGenerator,
} from "../../src/model";
import type { MindDocument } from "../../src/model/types";
import { loadDoc, serialize, atomicWrite } from "./core";
import { resolveNodeId } from "./addressing";
import { outline, lineDiff } from "./format";

export interface RunResult {
  code: number;
  out: string;
  err: string;
}

const OPTIONS = {
  title: { type: "string" },
  parent: { type: "string" },
  after: { type: "string" },
  to: { type: "string" },
  text: { type: "string" },
  index: { type: "string" },
  up: { type: "boolean" },
  down: { type: "boolean" },
  on: { type: "boolean" },
  off: { type: "boolean" },
  force: { type: "boolean" },
  "dry-run": { type: "boolean" },
  json: { type: "boolean" },
} as const;

function req<T>(v: T | undefined, msg: string): T {
  if (v === undefined || v === null || v === "") throw new Error(msg);
  return v;
}

async function fileExists(path: string): Promise<boolean> {
  return fsp.access(path).then(
    () => true,
    () => false,
  );
}

/** Load → mutate (with an id generator) → apply → serialize → write (unless
 * dry-run). Returns before/after text + the affected node ids. */
async function edit(
  file: string,
  dryRun: boolean,
  mutate: (tree: MindDocument, ids: IdGenerator) => { doc: MindDocument; affected: string[] },
): Promise<{ before: string; text: string; affected: string[] }> {
  const live = await loadDoc(file);
  const before = serialize(live);
  const ids = idGeneratorForDocument(live.tree);
  const { doc: next, affected } = mutate(live.tree, ids);
  applyTreeToDocument(live.doc, next);
  const text = serialize(live);
  if (!dryRun) await atomicWrite(file, text);
  return { before, text, affected };
}

export async function run(argv: string[]): Promise<RunResult> {
  const wantsJson = argv.includes("--json");
  try {
    const command = argv[0];
    const { values, positionals } = parseArgs({
      args: argv.slice(1),
      allowPositionals: true,
      options: OPTIONS,
    });
    const json = Boolean(values.json);
    const dryRun = Boolean(values["dry-run"]);
    const file = positionals[0];
    const ref = positionals[1];
    const index = values.index === undefined ? undefined : Number.parseInt(values.index, 10);

    // Format a completed mutation.
    const done = (affected: string[], before: string, text: string, verb: string): RunResult => {
      if (dryRun) return { code: 0, out: lineDiff(before, text), err: "" };
      return {
        code: 0,
        out: json
          ? JSON.stringify({ ok: true, file, affected })
          : `${verb} (${affected.join(", ")})`,
        err: "",
      };
    };

    switch (command) {
      case undefined:
      case "--help":
      case "-h":
        return { code: 0, out: usage(), err: "" };

      case "new": {
        req(file, "Usage: new <file> [--title]");
        if ((await fileExists(file!)) && !values.force) {
          throw new Error(`File exists: ${file} (use --force to overwrite)`);
        }
        const doc = emptyDocument(values.title ?? "Untitled");
        const text = serializeYaml(doc);
        if (dryRun) return { code: 0, out: text, err: "" };
        await atomicWrite(file!, text);
        return {
          code: 0,
          out: json ? JSON.stringify({ ok: true, file, rootId: doc.root.id }) : `Created ${file}`,
          err: "",
        };
      }

      case "info":
      case "tree": {
        const live = await loadDoc(req(file, "Usage: tree <file>")!);
        return { code: 0, out: outline(live.tree), err: "" };
      }

      case "validate": {
        const live = await loadDoc(req(file, "Usage: validate <file>")!);
        return {
          code: 0,
          out: json
            ? JSON.stringify({ valid: true, nodes: countNodes(live.tree) })
            : `Valid (${countNodes(live.tree)} nodes)`,
          err: "",
        };
      }

      case "add-child": {
        req(file, "Usage: add-child <file> --parent <ref> --text T");
        const parent = req(values.parent, "--parent <ref> is required");
        const text = req(values.text, "--text is required");
        const r = await edit(file!, dryRun, (tree, ids) => {
          const res = addChild(tree, resolveNodeId(tree, parent), text, ids, index);
          return { doc: res.doc, affected: [res.newId] };
        });
        return done(r.affected, r.before, r.text, "Added child");
      }

      case "add-sibling": {
        req(file, "Usage: add-sibling <file> --after <ref> --text T");
        const after = req(values.after, "--after <ref> is required");
        const text = req(values.text, "--text is required");
        const r = await edit(file!, dryRun, (tree, ids) => {
          const res = addSibling(tree, resolveNodeId(tree, after), text, ids);
          return { doc: res.doc, affected: [res.newId] };
        });
        return done(r.affected, r.before, r.text, "Added sibling");
      }

      case "rename": {
        req(file, "Usage: rename <file> <ref> --text T");
        req(ref, "<ref> is required");
        const text = req(values.text, "--text is required");
        const r = await edit(file!, dryRun, (tree) => {
          const id = resolveNodeId(tree, ref!);
          return { doc: updateText(tree, id, text), affected: [id] };
        });
        return done(r.affected, r.before, r.text, "Renamed");
      }

      case "delete": {
        req(file, "Usage: delete <file> <ref>");
        req(ref, "<ref> is required");
        const r = await edit(file!, dryRun, (tree) => {
          const id = resolveNodeId(tree, ref!);
          return { doc: deleteNode(tree, id), affected: [id] };
        });
        return done(r.affected, r.before, r.text, "Deleted");
      }

      case "duplicate": {
        req(file, "Usage: duplicate <file> <ref>");
        req(ref, "<ref> is required");
        const r = await edit(file!, dryRun, (tree, ids) => {
          const res = duplicateNode(tree, resolveNodeId(tree, ref!), ids);
          return { doc: res.doc, affected: [res.newId] };
        });
        return done(r.affected, r.before, r.text, "Duplicated");
      }

      case "move": {
        req(file, "Usage: move <file> <ref> --to <ref> [--index N]");
        req(ref, "<ref> is required");
        const to = req(values.to, "--to <ref> is required");
        const r = await edit(file!, dryRun, (tree) => {
          const id = resolveNodeId(tree, ref!);
          return { doc: moveNode(tree, id, resolveNodeId(tree, to), index), affected: [id] };
        });
        return done(r.affected, r.before, r.text, "Moved");
      }

      case "reorder": {
        req(file, "Usage: reorder <file> <ref> --up|--down");
        req(ref, "<ref> is required");
        const dir = values.up ? "up" : values.down ? "down" : undefined;
        if (!dir) throw new Error("--up or --down is required");
        const r = await edit(file!, dryRun, (tree) => {
          const id = resolveNodeId(tree, ref!);
          return { doc: moveSibling(tree, id, dir), affected: [id] };
        });
        return done(r.affected, r.before, r.text, "Reordered");
      }

      case "collapse": {
        req(file, "Usage: collapse <file> <ref> --on|--off");
        req(ref, "<ref> is required");
        if (!values.on && !values.off) throw new Error("--on or --off is required");
        const collapsed = Boolean(values.on);
        const r = await edit(file!, dryRun, (tree) => {
          const id = resolveNodeId(tree, ref!);
          return { doc: updateNode(tree, id, { collapsed }), affected: [id] };
        });
        return done(r.affected, r.before, r.text, collapsed ? "Collapsed" : "Expanded");
      }

      default:
        return { code: 1, out: "", err: `Unknown command: ${command}\n${usage()}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { code: 1, out: "", err: wantsJson ? JSON.stringify({ error: msg }) : msg };
  }
}

function countNodes(tree: MindDocument): number {
  let count = 0;
  const walk = (n: { children: unknown[] }): void => {
    count += 1;
    for (const c of n.children as { children: unknown[] }[]) walk(c);
  };
  walk(tree.root);
  return count;
}

function usage(): string {
  return (
    "clobmap — headless clobmap document toolkit\n" +
    "  new <file> [--title T] [--force]\n" +
    "  info|tree|validate <file>\n" +
    "  add-child <file> --parent <ref> --text T [--index N]\n" +
    "  add-sibling <file> --after <ref> --text T\n" +
    "  rename <file> <ref> --text T\n" +
    "  delete|duplicate <file> <ref>\n" +
    "  move <file> <ref> --to <ref> [--index N]\n" +
    "  reorder <file> <ref> --up|--down\n" +
    "  collapse <file> <ref> --on|--off\n" +
    "  (refs: node id | title | 'A › B › C' path)  flags: --dry-run --json"
  );
}

// Entrypoint (skipped under test import).
if (process.argv[1] && process.argv[1].endsWith("cli.ts")) {
  void run(process.argv.slice(2)).then((r) => {
    if (r.out) process.stdout.write(r.out + "\n");
    if (r.err) process.stderr.write(r.err + "\n");
    process.exit(r.code);
  });
}
