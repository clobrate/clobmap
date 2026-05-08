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

type Mode = "edit" | "preview";

/**
 * Modal Markdown notes editor for the active node. Single-pane: either
 * full edit or full preview, toggled via a button. Double-clicking a
 * paragraph in preview drops you back into edit with the cursor near
 * what you just clicked.
 *
 * Shortcuts:
 *   Esc            cancel (close popup)
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
  const [mode, setMode] = useState<Mode>("edit");
  const [renderedHtml, setRenderedHtml] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // We preserve the textarea's scroll + selection across mode switches so
  // toggling "Preview" → "Edit" via the button drops the user back where
  // they were. Captured every time we leave edit mode.
  const editScrollRef = useRef(0);
  const editSelectionRef = useRef<[number, number]>([0, 0]);

  // Read existing notes (inline value or sidecar file content).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadNotes(node?.notes, currentFilePath);
      if (cancelled) return;
      setLoaded(result);
      setContent(result.content);
      // Read-only notes (sidecar we can't edit on this platform) open
      // straight in preview — there's nothing to type.
      if (result.readOnly) setMode("preview");
    })();
    return () => {
      cancelled = true;
    };
  }, [node?.notes, currentFilePath]);

  // Lazy-load micromark and re-render preview on every content change. We
  // re-render even while in edit mode so toggling to preview is instant.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
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
  }, [content]);

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

  // Focus the textarea on first open of edit mode.
  useEffect(() => {
    if (mode !== "edit") return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
  }, [mode]);

  // Snapshot edit state right before we leave edit mode, so we can
  // restore it on the way back without having to re-find anything.
  const captureEditState = (): void => {
    const el = textareaRef.current;
    if (!el) return;
    editScrollRef.current = el.scrollTop;
    editSelectionRef.current = [el.selectionStart, el.selectionEnd];
  };

  const goToPreview = (): void => {
    captureEditState();
    setMode("preview");
  };

  // Restore edit-mode state. If `cursor` is supplied, place the caret there
  // (used by double-click-in-preview); otherwise restore the previously
  // captured selection + scroll.
  const goToEdit = (cursor?: number): void => {
    setMode("edit");
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      if (typeof cursor === "number") {
        const clamped = Math.max(0, Math.min(cursor, el.value.length));
        el.setSelectionRange(clamped, clamped);
        // Approximate scrollTop: jump so the caret line lands roughly mid-pane.
        const linesBefore = (el.value.slice(0, clamped).match(/\n/g) ?? []).length;
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 16;
        el.scrollTop = Math.max(0, linesBefore * lineHeight - el.clientHeight / 2);
      } else {
        const [s, e] = editSelectionRef.current;
        el.setSelectionRange(s, e);
        el.scrollTop = editScrollRef.current;
      }
      el.focus();
    });
  };

  const onPreviewDoubleClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (readOnly) return;
    const cursor = mapPreviewClickToSourceOffset(
      previewRef.current,
      e.nativeEvent,
      content,
    );
    goToEdit(cursor ?? undefined);
  };

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
            {!readOnly && (
              <ModeToggle
                mode={mode}
                onSwitch={() => (mode === "edit" ? goToPreview() : goToEdit())}
              />
            )}
            <button
              type="button"
              onClick={close}
              className="rounded px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              aria-label="Close"
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

        <div className="flex min-h-0 flex-1 flex-col">
          {mode === "edit" ? (
            <>
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
                className="min-h-0 flex-1 resize-none border-0 bg-transparent p-4 font-mono text-sm text-neutral-900 outline-none dark:text-neutral-100"
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
                <span>Cmd+Enter to save · Esc to cancel · click Preview to render</span>
              </div>
            </>
          ) : (
            <div
              ref={previewRef}
              onDoubleClick={onPreviewDoubleClick}
              title={readOnly ? undefined : "Double-click to jump back to edit"}
              className="clobmap-md min-h-0 flex-1 cursor-text overflow-auto p-4 text-sm"
              /* Styles for headings / lists / code / blockquote come from
                 .clobmap-md in src/index.css. micromark output is CommonMark;
                 user HTML is escaped by default. */
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
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

function ModeToggle({ mode, onSwitch }: { mode: Mode; onSwitch: () => void }) {
  return (
    <button
      type="button"
      onClick={onSwitch}
      className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
      title={mode === "edit" ? "Switch to preview" : "Switch back to edit"}
    >
      {mode === "edit" ? "Preview" : "Edit"}
    </button>
  );
}

/**
 * Translate a click in the rendered preview pane to a source-offset in
 * the markdown text the user typed. The mapping is heuristic — micromark
 * doesn't expose source positions on its HTML output — but works well
 * for prose: we measure the rendered text-content length up to the click,
 * then locate a recent ~30-char "needle" of that text inside the source.
 *
 * Returns null if we can't locate the click (unknown node, no caret API,
 * etc.). The caller falls back to "open edit at last cursor".
 */
function mapPreviewClickToSourceOffset(
  previewEl: HTMLDivElement | null,
  ev: MouseEvent,
  source: string,
): number | null {
  if (!previewEl) return null;
  const range = caretRangeAt(ev.clientX, ev.clientY);
  if (!range) return null;
  // Compose a Range from the start of the preview to the click point.
  const renderedRange = document.createRange();
  renderedRange.setStart(previewEl, 0);
  try {
    renderedRange.setEnd(range.startContainer, range.startOffset);
  } catch {
    return null;
  }
  const renderedPrefix = renderedRange.toString();
  if (renderedPrefix.length === 0) return 0;

  // Take the last ~30 chars as a search needle. If the user clicked very
  // close to the start, fall back to the whole prefix.
  const NEEDLE_LEN = 30;
  const needle = renderedPrefix
    .slice(Math.max(0, renderedPrefix.length - NEEDLE_LEN))
    .trim();
  if (needle.length < 3) return Math.min(renderedPrefix.length, source.length);

  // First exact match in the source, after the cumulative rendered prefix
  // length (so duplicates pick the right occurrence).
  const earliestPlausible = Math.max(0, renderedPrefix.length - NEEDLE_LEN);
  const idx = source.indexOf(needle, earliestPlausible);
  if (idx < 0) {
    // Fall back to a global search.
    const idxGlobal = source.indexOf(needle);
    if (idxGlobal < 0) return Math.min(renderedPrefix.length, source.length);
    return idxGlobal + needle.length;
  }
  return idx + needle.length;
}

interface CaretPositionFromPoint {
  caretPositionFromPoint(x: number, y: number): { offsetNode: Node; offset: number } | null;
}

function caretRangeAt(x: number, y: number): Range | null {
  // Chromium / Firefox
  const docWithCaret = document as Document & Partial<CaretPositionFromPoint>;
  if (typeof docWithCaret.caretPositionFromPoint === "function") {
    const pos = docWithCaret.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const r = document.createRange();
    r.setStart(pos.offsetNode, pos.offset);
    r.collapse(true);
    return r;
  }
  // Safari fallback (deprecated but still supported)
  if (typeof document.caretRangeFromPoint === "function") {
    return document.caretRangeFromPoint(x, y);
  }
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
