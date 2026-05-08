import { useCallback, useEffect, useRef, useState } from "react";
import { useDocumentStore } from "../store/document";
import { useUIStore } from "../store/ui";
import { findById, updateNode } from "../model";
import {
  loadNotes,
  NOTES_INLINE_LIMIT,
  saveNotes,
  type LoadedNotes,
} from "../lib/notes";
import { isMobile, isTauri } from "../lib/env";

/**
 * Modal Markdown notes editor for the active node. Edit textarea on
 * the left, live preview on the right (single-pane on phone widths).
 *
 * Shortcuts:
 *   Esc            cancel
 *   Cmd/Ctrl+Enter save
 */
export function NotesPopup() {
  const nodeId = useUIStore((s) => s.notesEditorNodeId);
  if (!nodeId) return null;
  // Re-mount per node so loadNotes runs cleanly on every open.
  return <NotesPopupInner key={nodeId} nodeId={nodeId} />;
}

function NotesPopupInner({ nodeId }: { nodeId: string }) {
  const close = useUIStore((s) => s.closeNotesEditor);
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);
  const currentFilePath = useDocumentStore((s) => s.currentFilePath);
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);

  const node = parsedDoc ? findById(parsedDoc, nodeId) : null;
  const [content, setContent] = useState<string>("");
  const [loaded, setLoaded] = useState<LoadedNotes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [renderedHtml, setRenderedHtml] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Read existing notes (inline value or sidecar file content).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadNotes(node?.notes, currentFilePath);
      if (cancelled) return;
      setLoaded(result);
      setContent(result.content);
    })();
    return () => {
      cancelled = true;
    };
  }, [node?.notes, currentFilePath]);

  // Lazy-load micromark and re-render preview on every content change.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!showPreview) return;
      try {
        const { micromark } = await import("micromark");
        if (cancelled) return;
        setRenderedHtml(micromark(content));
      } catch (err) {
        if (cancelled) return;
        setRenderedHtml(
          `<p style="color:#dc2626">Preview failed: ${escapeHtml(
            err instanceof Error ? err.message : String(err),
          )}</p>`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [content, showPreview]);

  const readOnly = loaded?.readOnly ?? false;
  // Browser/iOS limit. Desktop's "limit" is just the auto-extract threshold.
  const isWebOrMobile = !isTauri() || isMobile();
  const overLimit = isWebOrMobile && content.length > NOTES_INLINE_LIMIT;

  const onSave = useCallback(async (): Promise<void> => {
    if (readOnly || saving || !parsedDoc || !node) return;
    setError(null);
    setSaving(true);
    try {
      const result = await saveNotes(
        content,
        node.notes,
        currentFilePath,
        nodeId,
        node.text,
      );
      const next = updateNode(parsedDoc, nodeId, { notes: result.fieldValue });
      applyTreeChange(next);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }, [
    readOnly,
    saving,
    parsedDoc,
    node,
    content,
    currentFilePath,
    nodeId,
    applyTreeChange,
    close,
  ]);

  // Esc / Cmd+Enter handlers, attached at window level so they fire even
  // when the textarea isn't focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void onSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, onSave]);

  // Focus the textarea on open.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  if (!node) {
    // Node disappeared (deleted while popup open). Just close.
    close();
    return null;
  }

  const showingSidecarPath = loaded?.isPathRef && !readOnly;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Notes for ${node.text}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        // Click on the backdrop (not the dialog body) cancels.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="flex h-[min(80vh,640px)] w-[min(900px,95vw)] flex-col overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800">
          <div className="min-w-0 truncate">
            <span className="text-neutral-500">Notes —</span>{" "}
            <span className="font-medium">{node.text}</span>
            {showingSidecarPath && (
              <span className="ml-2 text-xs text-neutral-500" title={loaded?.resolvedPath ?? ""}>
                {node.notes}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="rounded px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              {showPreview ? "Hide preview" : "Show preview"}
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              ✕
            </button>
          </div>
        </header>

        {loaded?.message && (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
            {loaded.message}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-0 sm:flex-row">
          <div className="flex min-h-0 flex-1 flex-col">
            <textarea
              ref={textareaRef}
              value={content}
              readOnly={readOnly}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                readOnly
                  ? ""
                  : "Markdown notes — supports headings, bold, italic, lists, links, code blocks…"
              }
              className="flex-1 resize-none border-0 bg-transparent p-4 font-mono text-xs text-neutral-900 outline-none dark:text-neutral-100"
            />
            <div className="flex shrink-0 items-center justify-between border-t border-neutral-200 px-4 py-1.5 text-[11px] text-neutral-500 dark:border-neutral-800">
              <span>
                {content.length} chars
                {isWebOrMobile && (
                  <>
                    {" "}/ {NOTES_INLINE_LIMIT} max
                    {overLimit && (
                      <span className="ml-2 text-red-600 dark:text-red-400">
                        Over limit — install desktop for sidecar files
                      </span>
                    )}
                  </>
                )}
              </span>
              <span>Cmd+Enter to save · Esc to cancel</span>
            </div>
          </div>
          {showPreview && (
            <div className="min-h-0 flex-1 overflow-auto border-t border-neutral-200 p-4 text-sm dark:border-neutral-800 sm:border-l sm:border-t-0">
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                /* The HTML comes from micromark's CommonMark parser, so it
                   doesn't include arbitrary user HTML by default. Still
                   trusted-source-only — these are user's own notes from
                   their own document. */
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800">
          <div className="min-w-0 truncate text-xs">
            {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={readOnly || saving || overLimit}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

