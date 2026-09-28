import { useDocumentStore } from "../store/document";
import { useUIStore } from "../store/ui";
import { findById } from "../model";
import { isPathReference } from "../lib/notes";
import { strings } from "../i18n/strings";

export function StatusBar() {
  const parseError = useDocumentStore((s) => s.parseError);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);
  const currentFilePath = useDocumentStore((s) => s.currentFilePath);
  const autoSave = useUIStore((s) => s.autoSave);
  const viewMode = useUIStore((s) => s.viewMode);
  const noteletsMode = useUIStore((s) => s.noteletsMode);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);

  // In the Notelets one-page view, surface the current page's note file so the
  // user knows which file on disk backs it (folder mode / sidecar). Inline or
  // note-less pages have no file to show.
  let noteFile: string | null = null;
  if (viewMode === "notelets" && noteletsMode === "page" && parsedDoc && selectedNodeId) {
    const notes = findById(parsedDoc, selectedNodeId)?.notes;
    if (notes && isPathReference(notes)) {
      noteFile = notes.trim().replace(/^\.\/+/, "");
    }
  }

  const status = parseError
    ? `Invalid: line ${parseError.line} — ${parseError.message}`
    : parsedDoc
      ? "Valid"
      : "—";

  const tone = parseError
    ? "text-red-600 dark:text-red-400"
    : "text-emerald-600 dark:text-emerald-400";

  const autoSaveBlocked = autoSave && !currentFilePath;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
      <span className={tone} aria-live="polite">
        {status}
      </span>
      {autoSaveBlocked && (
        <span
          className="truncate text-amber-600 dark:text-amber-400"
          aria-live="polite"
        >
          {strings.status.autoSaveNeedsFileName}
        </span>
      )}
      {noteFile && (
        <span
          className="truncate font-mono text-neutral-500 dark:text-neutral-400"
          title={noteFile}
          aria-label={`Note file: ${noteFile}`}
        >
          {noteFile}
        </span>
      )}
      <span className="tabular-nums">{isDirty ? "● modified" : "saved"}</span>
    </div>
  );
}
