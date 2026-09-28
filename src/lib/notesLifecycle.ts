/**
 * Folder-mode note lifecycle (Phase 3): what happens to a node's `.md` file
 * when the node is deleted, and how to tidy the folder.
 *
 * - Node RENAME needs nothing here: filenames are id-stable, so the link
 *   survives; the next save keeps writing to the existing file (Phase 1).
 * - Node DELETE archives the file (rename to a hidden `.Deleted-…`), never a
 *   hard delete (spec §11.4).
 * - TIDY removes archives + orphaned files on demand.
 *
 * Pure planners (`planDeleteArchive`, `planTidy`) are exhaustively unit-tested;
 * the executors do the I/O through the FS adapter. The store-reading triggers
 * live in fileActions.ts (gated on folder mode).
 */
import type { MindDocument, MindNode } from "../model/types";
import { isPathReference, resolveNotesPath } from "./notes";
import { deletedArchiveName, noteRelPath } from "./notesFolder";
import * as fs from "./fsAdapter";

function normalizeFolder(folder: string): string {
  return folder
    .replace(/\\/g, "/")
    .replace(/^\.?\/+/, "")
    .replace(/\/+$/, "");
}

function parentDir(path: string): string {
  return path.replace(/[/\\][^/\\]+$/, "");
}

/**
 * Plan the archive rename for a deleted node's note file. Returns the `from`/
 * `to` doc-relative field paths, or null when the node has no file-backed note
 * (inline or none → nothing on disk to archive). The archive lands in the same
 * directory as the original so relative paths stay valid.
 */
export function planDeleteArchive(
  node: Pick<MindNode, "id" | "text" | "notes">,
  deletedAtISO: string,
): { from: string; to: string } | null {
  const notes = node.notes;
  if (!notes || !isPathReference(notes)) return null;
  const rel = notes.trim().replace(/\\/g, "/");
  const slash = rel.lastIndexOf("/");
  const dir = slash >= 0 ? rel.slice(0, slash) : ".";
  const archive = deletedArchiveName(node.id, node.text, deletedAtISO);
  return { from: notes, to: `${dir}/${archive}` };
}

/**
 * Given the document and the filenames currently in the notes folder, decide
 * which to delete: every `.Deleted-*` archive, plus any file no live node
 * references (an orphan). Empty-but-referenced files are kept (they're reused).
 */
export function planTidy(doc: MindDocument, folder: string, filesInFolder: string[]): string[] {
  const norm = normalizeFolder(folder);
  const referenced = new Set<string>();
  const walk = (node: MindNode): void => {
    const notes = node.notes;
    if (notes && isPathReference(notes)) {
      const rel = notes.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
      if (rel.startsWith(`${norm}/`)) referenced.add(rel.slice(norm.length + 1));
    }
    for (const child of node.children) walk(child);
  };
  walk(doc.root);
  return filesInFolder.filter((name) => name.startsWith(".Deleted-") || !referenced.has(name));
}

/** Archive a deleted node's note file (rename → hidden `.Deleted-…`).
 * Best-effort: returns false if there was nothing to archive or the rename
 * failed. */
export async function archiveNoteFile(
  node: Pick<MindNode, "id" | "text" | "notes">,
  docPath: string,
  deletedAtISO: string,
): Promise<boolean> {
  const plan = planDeleteArchive(node, deletedAtISO);
  if (!plan) return false;
  const from = await resolveNotesPath(plan.from, docPath);
  const to = await resolveNotesPath(plan.to, docPath);
  if (!from || !to) return false;
  try {
    await fs.rename(from, to);
    return true;
  } catch {
    return false;
  }
}

/** Delete every archive + orphan in the notes folder. Returns the count
 * removed. Best-effort per file. */
export async function tidyNotesFolder(
  doc: MindDocument,
  docPath: string,
  folder: string,
): Promise<number> {
  const probe = await resolveNotesPath(noteRelPath(folder, "x"), docPath);
  if (!probe) return 0;
  const folderAbs = parentDir(probe);
  let files: string[];
  try {
    files = await fs.readDir(folderAbs);
  } catch {
    return 0;
  }
  const toDelete = planTidy(doc, folder, files);
  for (const name of toDelete) {
    await fs.remove(`${folderAbs}/${name}`).catch(() => {});
  }
  return toDelete.length;
}
