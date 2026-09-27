/**
 * Folder-mode migration (Phase 2). When a document is opened while folder
 * storage is on, existing **inline** notes and **legacy sidecar** references
 * are moved into per-node files under the notes folder, once, losslessly.
 *
 * Split in two:
 * - `planMigration` — PURE. Walks the tree and returns the ops needed. No I/O,
 *   so it's exhaustively unit-testable.
 * - `migrateDocToFolder` — the executor. Reads/writes via the FS adapter and
 *   returns a new tree with the `notes:` fields rewritten. The store-reading
 *   trigger lives in fileActions.ts (gated on folder mode).
 *
 * Non-destructive: legacy sidecar files are COPIED into the folder, not
 * deleted — the field is repointed, the old file is left as a harmless orphan
 * that a later "tidy" pass (Phase 3) can remove. The whole thing is applied as
 * one tree change, so a single undo reverts it.
 */
import type { MindDocument, MindNode } from "../model/types";
import { updateNode } from "../model";
import { isPathReference, resolveNotesPath } from "./notes";
import { noteFilename, noteRelPath } from "./notesFolder";
import * as fs from "./fsAdapter";

export type MigrationAction = "inline-to-file" | "sidecar-to-file";

export interface MigrationOp {
  nodeId: string;
  action: MigrationAction;
  /** New YAML field value: `./<folder>/<nodeId>-<slug>.md`. */
  newField: string;
  /** inline-to-file: the content to write. */
  content?: string;
  /** sidecar-to-file: the existing path-ref to read from and re-home. */
  sourceField?: string;
}

function normalizeFolder(folder: string): string {
  return folder
    .replace(/\\/g, "/")
    .replace(/^\.?\/+/, "")
    .replace(/\/+$/, "");
}

/** Directory portion of an absolute path (strips the final segment). */
function parentDir(path: string): string {
  return path.replace(/[/\\][^/\\]+$/, "");
}

/**
 * Decide what needs migrating. A node is:
 * - inline (non-empty, not a path ref) → `inline-to-file`.
 * - a path ref NOT already under the folder → `sidecar-to-file` (re-home).
 * - a path ref already under `<folder>/` → skipped (already migrated ⇒ idempotent).
 * - empty / no notes → skipped.
 */
export function planMigration(doc: MindDocument, folder: string): MigrationOp[] {
  const norm = normalizeFolder(folder);
  const ops: MigrationOp[] = [];
  const walk = (node: MindNode): void => {
    const notes = node.notes;
    if (notes && notes.trim().length > 0) {
      const newField = noteRelPath(norm, noteFilename(node.id, node.text));
      if (!isPathReference(notes)) {
        ops.push({ nodeId: node.id, action: "inline-to-file", newField, content: notes });
      } else {
        const stripped = notes.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
        if (!stripped.startsWith(`${norm}/`)) {
          ops.push({ nodeId: node.id, action: "sidecar-to-file", newField, sourceField: notes });
        }
        // else: already under the folder → nothing to do.
      }
    }
    for (const child of node.children) walk(child);
  };
  walk(doc.root);
  return ops;
}

/**
 * Execute the migration: write per-node files and return a tree with the
 * `notes:` fields repointed. `changed` is false when nothing needed migrating
 * (so the caller can skip dirtying the document).
 */
export async function migrateDocToFolder(
  doc: MindDocument,
  docPath: string,
  folder: string,
): Promise<{ doc: MindDocument; changed: boolean }> {
  const ops = planMigration(doc, folder);
  if (ops.length === 0) return { doc, changed: false };

  let next = doc;
  for (const op of ops) {
    const dest = await resolveNotesPath(op.newField, docPath);
    if (!dest) continue; // unresolvable (no docPath) — shouldn't happen here.

    let content = op.content ?? "";
    if (op.action === "sidecar-to-file" && op.sourceField) {
      const src = await resolveNotesPath(op.sourceField, docPath);
      // Best-effort read; an unreadable legacy sidecar migrates as empty
      // rather than aborting the whole document.
      content = src ? await fs.readTextFile(src).catch(() => "") : "";
    }

    await fs.mkdirp(parentDir(dest));
    await fs.writeTextFile(dest, content);
    next = updateNode(next, op.nodeId, { notes: op.newField });
  }
  return { doc: next, changed: true };
}
