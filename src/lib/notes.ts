import { isMobile, isTauri } from "./env";
import * as fs from "./fsAdapter";
import {
  coerceNotesFolder,
  DEFAULT_NOTES_FOLDER,
  noteFilename,
  noteRelPath,
  type NoteStorageMode,
} from "./notesFolder";

export const NOTES_INLINE_LIMIT = 800;

/** Directory portion of an absolute path (strips the final path segment). */
function parentDir(path: string): string {
  return path.replace(/[/\\][^/\\]+$/, "");
}

/**
 * A node's `notes` field is stored as a single string in YAML. It can be
 * either inline Markdown content OR a reference to a sidecar `.md` file.
 * The two are disambiguated heuristically: a value is treated as a path
 * reference iff it is a single line AND begins with `./`, `../`, `/`,
 * `~/`, or is a single-line `*.md` filename. Anything else is inline
 * content. Real Markdown content almost always has newlines or is much
 * longer than a filename, so the heuristic almost never misfires; users
 * who want to attach a path under all circumstances can prefix `./`.
 */
export function isPathReference(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  // Multi-line content can never be a path.
  if (trimmed.includes("\n")) return false;
  if (
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("~/")
  ) {
    return true;
  }
  // Bare `name.md` — only if it looks like a filename, not a sentence.
  if (
    trimmed.toLowerCase().endsWith(".md") &&
    trimmed.length < 200 &&
    !trimmed.includes(" ")
  ) {
    return true;
  }
  return false;
}

/** Strip filesystem-hostile characters and clamp to a manageable length. */
function safeFilenameSegment(input: string): string {
  return (
    input
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, "-")
      .replace(/^[.-]+/, "")
      .slice(0, 32) || "node"
  );
}

/**
 * Choose a sidecar filename for a node based on the doc, node id, and
 * node text. Format: `.<docBase>_<nodeId>_<safeText>.md`, leading "."
 * makes the file hidden on macOS / Linux. Always relative-to-doc style
 * `./<filename>` so the value round-trips cleanly through git as a path.
 */
export function suggestedSidecarFilename(
  docPath: string | null,
  nodeId: string,
  nodeText: string,
): string {
  const docBase = docPath
    ? safeFilenameSegment(
        (docPath.split(/[/\\]/).pop() ?? "doc").replace(
          /\.(clobmap\.yaml|yaml|yml)$/i,
          "",
        ),
      )
    : "doc";
  const safeText = safeFilenameSegment(nodeText);
  return `./.${docBase}_${nodeId}_${safeText}.md`;
}

/**
 * Resolve a notes path-reference to an absolute path on the local
 * filesystem. Returns null on web, on iOS, or when the doc has no path
 * to resolve relative paths against.
 *
 * - "/abs/path.md" → "/abs/path.md"
 * - "~/foo.md"     → "<home>/foo.md" (desktop only, async resolution)
 * - "./rel.md"     → "<dir-of-doc>/rel.md"
 * - "rel.md"       → same as "./rel.md"
 */
export async function resolveNotesPath(
  value: string,
  docPath: string | null,
): Promise<string | null> {
  if (!isTauri() || isMobile()) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("~/")) {
    const { homeDir } = await import("@tauri-apps/api/path");
    const home = await homeDir();
    return `${home.replace(/\/$/, "")}/${trimmed.slice(2)}`;
  }
  if (!docPath) return null;
  const dir = docPath.replace(/[/\\][^/\\]+$/, "");
  const stripped = trimmed.replace(/^\.\/+/, "");
  return `${dir}/${stripped}`;
}

export interface LoadedNotes {
  /** Markdown content the editor should display. Empty string for no notes. */
  content: string;
  /** True if the YAML field was a path reference (sidecar file). */
  isPathRef: boolean;
  /** Absolute path resolved from the reference, when applicable. */
  resolvedPath: string | null;
  /** The user can't write to this notes — show as read-only. */
  readOnly: boolean;
  /** Non-fatal explanation surfaced to the user. */
  message?: string;
}

/**
 * Read a node's notes for display in the editor. Inline values are
 * returned as-is; path references are read from the sidecar file on
 * desktop; on iOS / web, path references show as read-only with a
 * platform-appropriate explanation.
 */
export async function loadNotes(
  rawValue: string | undefined,
  docPath: string | null,
): Promise<LoadedNotes> {
  if (!rawValue) {
    return { content: "", isPathRef: false, resolvedPath: null, readOnly: false };
  }
  if (!isPathReference(rawValue)) {
    return { content: rawValue, isPathRef: false, resolvedPath: null, readOnly: false };
  }
  // Path reference. On web / iOS we can't read it.
  if (!isTauri()) {
    return {
      content: "",
      isPathRef: true,
      resolvedPath: null,
      readOnly: true,
      message: "Sidecar notes files aren't accessible in browser builds.",
    };
  }
  if (isMobile()) {
    return {
      content: "",
      isPathRef: true,
      resolvedPath: null,
      readOnly: true,
      message: "Sidecar notes files aren't accessible on iOS builds yet.",
    };
  }
  const resolved = await resolveNotesPath(rawValue, docPath);
  if (!resolved) {
    return {
      content: "",
      isPathRef: true,
      resolvedPath: null,
      readOnly: true,
      message: "Save the document first so we can resolve relative notes paths.",
    };
  }
  try {
    const content = await fs.readTextFile(resolved);
    return { content, isPathRef: true, resolvedPath: resolved, readOnly: false };
  } catch (err) {
    return {
      content: "",
      isPathRef: true,
      resolvedPath: resolved,
      readOnly: false,
      message: `Could not read notes file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface SaveNotesResult {
  /** The new YAML field value to set on the node, or undefined to delete. */
  fieldValue: string | undefined;
  /** True if a sidecar file was written. */
  wroteSidecar: boolean;
  /** Where the sidecar landed, when applicable. */
  sidecarPath?: string;
}

export interface SaveNotesOptions {
  /** Desktop storage policy. Defaults to `inline` (2.0.2 behavior). */
  noteStorage?: NoteStorageMode;
  /** Doc-relative subfolder for folder-mode notes. */
  notesFolder?: string;
}

/**
 * Persist edited notes content. Returns the new YAML field value the
 * caller should write back into the node. Behavior depends on the storage
 * mode, content length, and platform:
 *
 * Common to all modes:
 * - existing field is a path-ref (desktop) → write to that path, keep the
 *   path value in YAML (shared sidecars — multiple nodes → one .md file).
 *
 * `inline` mode (default):
 * - empty content → field is deleted (returns `undefined`).
 * - content fits inline (≤ NOTES_INLINE_LIMIT) → return inline string.
 * - content overflows on desktop → auto-extract to a sidecar `./<name>.md`.
 * - content overflows on web / iOS → throw (the editor caps before here).
 *
 * `folder` mode (desktop only — see docs/desktop-notes-folder-storage-*.md):
 * - non-empty content → write `./<folder>/<nodeId>-<slug>.md`, ANY size.
 * - empty content when the node already points at a file → keep an EMPTY,
 *   reusable file (spec §11.4); otherwise delete the field.
 */
export async function saveNotes(
  rawContent: string,
  existingValue: string | undefined,
  docPath: string | null,
  nodeId: string,
  nodeText: string,
  options: SaveNotesOptions = {},
): Promise<SaveNotesResult> {
  const noteStorage = options.noteStorage ?? "inline";
  const content = rawContent;
  const isDesktop = isTauri() && !isMobile();
  const folderMode = noteStorage === "folder" && isDesktop;

  if (content.trim().length === 0) {
    // Folder mode: if the node already points at a file, keep it as an EMPTY
    // reusable file rather than deleting (spec §11.4).
    if (folderMode && existingValue && isPathReference(existingValue) && docPath) {
      const resolved = await resolveNotesPath(existingValue, docPath);
      if (resolved) {
        await writeSidecar(resolved, "");
        return { fieldValue: existingValue, wroteSidecar: true, sidecarPath: resolved };
      }
    }
    // Otherwise: drop the link. If there was a sidecar, leave it on disk —
    // deleting orphan files is an explicit gesture, not a surprise.
    return { fieldValue: undefined, wroteSidecar: false };
  }

  // If the existing field already pointed at a sidecar, keep that linkage
  // and write the new content there (shared-sidecar path — both modes).
  if (existingValue && isPathReference(existingValue) && isDesktop) {
    const resolved = await resolveNotesPath(existingValue, docPath);
    if (resolved) {
      await writeSidecar(resolved, content);
      return {
        fieldValue: existingValue,
        wroteSidecar: true,
        sidecarPath: resolved,
      };
    }
  }

  // Folder mode: write a NEW per-node file under the folder, irrespective of
  // size (no inline cap in this mode).
  if (folderMode) {
    if (!docPath) {
      throw new Error("Save the document first so we can write the notes file next to it.");
    }
    const folder = coerceNotesFolder(options.notesFolder ?? DEFAULT_NOTES_FOLDER);
    const relValue = noteRelPath(folder, noteFilename(nodeId, nodeText));
    const resolved = await resolveNotesPath(relValue, docPath);
    if (!resolved) {
      throw new Error("Could not resolve a notes-folder path for the notes.");
    }
    await fs.mkdirp(parentDir(resolved));
    await writeSidecar(resolved, content);
    return { fieldValue: relValue, wroteSidecar: true, sidecarPath: resolved };
  }

  if (content.length <= NOTES_INLINE_LIMIT) {
    return { fieldValue: content, wroteSidecar: false };
  }

  // Overflow.
  if (!isTauri() || isMobile()) {
    throw new Error(
      `Notes too long (${content.length} chars) for this build. The browser and ` +
        `iOS builds cap inline notes at ${NOTES_INLINE_LIMIT}; install the desktop ` +
        `app to use sidecar files for longer notes.`,
    );
  }
  if (!docPath) {
    throw new Error("Save the document first so we can write the sidecar file next to it.");
  }
  const sidecarValue = suggestedSidecarFilename(docPath, nodeId, nodeText);
  const resolved = await resolveNotesPath(sidecarValue, docPath);
  if (!resolved) {
    throw new Error("Could not resolve a sidecar path for the notes.");
  }
  await writeSidecar(resolved, content);
  return { fieldValue: sidecarValue, wroteSidecar: true, sidecarPath: resolved };
}

async function writeSidecar(absolutePath: string, content: string): Promise<void> {
  await fs.writeTextFile(absolutePath, content);
}
