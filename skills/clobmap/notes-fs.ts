/**
 * Note file I/O for the CLI — the Node twin of the app's Tauri note layer.
 * Reuses the app's PURE rules (§11.5): `notesFolder.ts` for naming + the
 * `isInsideDir` sandbox, `notes.ts` for `isPathReference` / the inline cap /
 * sidecar naming. All disk access is Node `fs` (never the Tauri `fsAdapter`).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { MindDocument, MindNode } from "../../src/model/types";
import { findById, updateNode } from "../../src/model";
import { isPathReference, NOTES_INLINE_LIMIT, suggestedSidecarFilename } from "../../src/lib/notes";
import {
  coerceNotesFolder,
  isInsideDir,
  noteFilename,
  noteRelPath,
} from "../../src/lib/notesFolder";

export type NoteStorageMode = "inline" | "folder";

function docDir(docPath: string): string {
  return path.dirname(path.resolve(docPath));
}

/** Resolve a note field's rel path to an absolute path, enforcing the sandbox
 * (§9): the file must live inside the document's own directory subtree. */
function resolveNoteFile(docPath: string, relValue: string): string {
  const dir = docDir(docPath);
  const stripped = relValue.trim().replace(/^\.\/+/, "");
  const abs = path.resolve(dir, stripped);
  if (!isInsideDir(abs, dir)) {
    throw new Error(`Note file "${relValue}" is outside the document's folder — refused.`);
  }
  return abs;
}

/** Infer the storage mode from the doc: `folder` if any node already points at
 * a file under the folder, else `inline`. */
export function inferMode(tree: MindDocument, folder: string): NoteStorageMode {
  const norm = coerceNotesFolder(folder);
  let found = false;
  const walk = (n: MindNode): void => {
    if (n.notes && isPathReference(n.notes)) {
      const rel = n.notes.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
      if (rel.startsWith(`${norm}/`)) found = true;
    }
    for (const c of n.children) walk(c);
  };
  walk(tree.root);
  return found ? "folder" : "inline";
}

/** Read a node's note content (inline value, or the file — sandboxed). */
export async function readNote(tree: MindDocument, id: string, docPath: string): Promise<string> {
  const node = findById(tree, id);
  if (!node) throw new Error(`Node not found: ${id}`);
  const val = node.notes;
  if (!val) return "";
  if (!isPathReference(val)) return val;
  const abs = resolveNoteFile(docPath, val);
  try {
    return await fs.readFile(abs, "utf8");
  } catch {
    return "";
  }
}

/**
 * Write a node's note and return the updated tree (with the `notes` field
 * set/cleared). Mode-aware; respects `dryRun` (computes the field change but
 * touches no files). Mirrors the app's `saveNotes` policy.
 */
export async function writeNote(
  tree: MindDocument,
  id: string,
  content: string,
  docPath: string,
  opts: { mode: NoteStorageMode; folder: string; dryRun?: boolean },
): Promise<MindDocument> {
  const node = findById(tree, id);
  if (!node) throw new Error(`Node not found: ${id}`);
  const existing = node.notes;
  const write = async (abs: string, text: string): Promise<void> => {
    if (opts.dryRun) return;
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, text, "utf8");
  };

  // Empty content.
  if (content.trim().length === 0) {
    if (opts.mode === "folder" && existing && isPathReference(existing)) {
      // Keep an empty, reusable file (folder mode).
      await write(resolveNoteFile(docPath, existing), "");
      return updateNode(tree, id, { notes: existing });
    }
    return updateNode(tree, id, { notes: undefined });
  }

  // Existing file link → keep writing to it (either mode).
  if (existing && isPathReference(existing)) {
    await write(resolveNoteFile(docPath, existing), content);
    return updateNode(tree, id, { notes: existing });
  }

  // Folder mode: a new per-node file, any size.
  if (opts.mode === "folder") {
    const rel = noteRelPath(coerceNotesFolder(opts.folder), noteFilename(id, node.text));
    await write(resolveNoteFile(docPath, rel), content);
    return updateNode(tree, id, { notes: rel });
  }

  // Inline mode: inline under the cap, else a hidden sidecar (app parity).
  if (content.length <= NOTES_INLINE_LIMIT) {
    return updateNode(tree, id, { notes: content });
  }
  const sidecarRel = suggestedSidecarFilename(docPath, id, node.text);
  await write(resolveNoteFile(docPath, sidecarRel), content);
  return updateNode(tree, id, { notes: sidecarRel });
}

/** Append text to the end of a note (a newline separates if needed). */
export function joinAppend(existing: string, text: string): string {
  if (!existing) return text;
  return existing.endsWith("\n") ? existing + text : `${existing}\n${text}`;
}

/** Prepend text to the start of a note. */
export function joinPrepend(existing: string, text: string): string {
  if (!existing) return text;
  return text.endsWith("\n") ? text + existing : `${text}\n${existing}`;
}
