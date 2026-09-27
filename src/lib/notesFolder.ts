/**
 * Pure helpers for the desktop "notes folder" storage mode — one Markdown
 * file per node under a document-relative subfolder (see
 * docs/desktop-notes-folder-storage-*.md). Phase 0: no I/O, no wiring — just
 * the naming + validation building blocks the later phases compose.
 *
 * This module is intentionally a LEAF: it imports nothing from `notes.ts`
 * (which will depend on it in a later phase), so there's no import cycle and
 * it's trivially unit-testable.
 */
import type { Result } from "../model/types";

/**
 * Desktop note-storage policy.
 * - `inline` — today's behavior: notes inline in YAML up to a size cap, then a
 *   sidecar `.md`.
 * - `folder` — one visible `.md` per node under a doc-relative subfolder,
 *   irrespective of size ("inline notes OFF").
 */
export type NoteStorageMode = "inline" | "folder";

/** Default subfolder name for folder-mode notes (product spec §11.1). */
export const DEFAULT_NOTES_FOLDER = "notelets";

export function isNoteStorageMode(v: unknown): v is NoteStorageMode {
  return v === "inline" || v === "folder";
}

/**
 * Filename-safe slug from arbitrary node text. Mirrors the legacy sidecar
 * segment rules so folder-mode and legacy names stay consistent: strip
 * path-dangerous characters, collapse whitespace to `-`, drop leading dots /
 * dashes, cap length, and never return empty.
 */
export function slugify(text: string): string {
  return (
    text
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, "-")
      .replace(/^[.-]+/, "")
      .slice(0, 32) || "node"
  );
}

/** Make a node id safe as a filename segment without truncating (ids must stay
 * unique, so we only replace unsafe characters — we don't slice). */
function safeId(nodeId: string): string {
  return nodeId.replace(/[\\/:*?"<>|.\s]+/g, "-").replace(/^-+/, "") || "node";
}

/** ISO timestamps contain `:` / `.` which are unsafe on some filesystems. */
function safeStamp(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

/**
 * Per-node note filename: `<nodeId>-<slug>.md` (spec §11.3). The id prefix
 * keeps the file linked across renames and guarantees uniqueness; the slug
 * makes the folder browsable.
 */
export function noteFilename(nodeId: string, nodeText: string): string {
  return `${safeId(nodeId)}-${slugify(nodeText)}.md`;
}

/**
 * Hidden archive name for a deleted node's note file (spec §11.4). Leading `.`
 * hides it; the timestamp keeps each deletion unique so a re-created id never
 * collides. The file is renamed to this — never hard-deleted.
 */
export function deletedArchiveName(
  nodeId: string,
  nodeText: string,
  deletedAtISO: string,
): string {
  return `.Deleted-${safeId(nodeId)}-${slugify(nodeText)}-${safeStamp(deletedAtISO)}.md`;
}

/**
 * The YAML `notes:` value for a folder-mode note: `./<folder>/<file>.md`
 * (leading `./`, forward slashes) — a valid path-reference that resolves
 * relative to the document.
 */
export function noteRelPath(folder: string, filename: string): string {
  const clean = folder
    .replace(/\\/g, "/")
    .replace(/^\.?\/+/, "")
    .replace(/\/+$/, "");
  return `./${clean}/${filename}`;
}

/**
 * Validate + normalize a user-chosen notes-folder setting (string-level only —
 * the canonicalized "is really inside the doc dir" check lands in Phase 4).
 * On success returns the normalized relative folder (forward slashes, no
 * leading `./`, no trailing slash). Rejects absolute paths, home (`~`), and any
 * `..` escape — the safety boundary from spec §6.3.
 */
export function validateNotesFolder(folder: string): Result<string, string> {
  const raw = folder.trim().replace(/\\/g, "/");
  if (!raw) return { ok: false, error: "Folder name can't be empty." };
  if (/^([a-zA-Z]:|\/|~)/.test(raw)) {
    return {
      ok: false,
      error:
        "Use a relative folder inside the document's folder — not an absolute or home (~) path.",
    };
  }
  const norm = raw.replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (!norm) return { ok: false, error: "Folder name can't be empty." };
  const segments = norm.split("/");
  if (segments.some((s) => s === "..")) {
    return {
      ok: false,
      error: 'The notes folder can\'t step outside the document\'s folder (no "..").',
    };
  }
  if (segments.some((s) => s === "" || s === ".")) {
    return { ok: false, error: "Invalid folder path." };
  }
  return { ok: true, value: norm };
}

/** Coerce a persisted/unknown folder value to a valid normalized folder,
 * falling back to the default when missing or invalid. */
export function coerceNotesFolder(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_NOTES_FOLDER;
  const result = validateNotesFolder(value);
  return result.ok ? result.value : DEFAULT_NOTES_FOLDER;
}
