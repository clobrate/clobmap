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

// Persisted popup geometry. Stored as plain pixel values; CSS clamps to
// 20–80% of the viewport so a resized-then-windowsmall scenario stays in
// bounds without us doing math.
const STORAGE_WIDTH = "clobmap.notesPopup.width";
const STORAGE_HEIGHT = "clobmap.notesPopup.height";
const STORAGE_FONT = "clobmap.notesPopup.fontSize";

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 540;
const DEFAULT_FONT = 14;
const MIN_FONT = 10;
const MAX_FONT = 28;

function readNumberPref(key: string, fallback: number): number {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return fallback;
    return n;
  } catch {
    return fallback;
  }
}

function writeNumberPref(key: string, value: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // private mode / quota — non-fatal
  }
}

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
  // Persisted geometry, restored on open. The user resizes via the
  // browser's CSS resize handle (drag bottom-right) and a ResizeObserver
  // writes the new dims back to localStorage — React state isn't the
  // source of truth for resize, so we don't need a setter.
  const [popupWidth] = useState<number>(() =>
    readNumberPref(STORAGE_WIDTH, DEFAULT_WIDTH),
  );
  const [popupHeight] = useState<number>(() =>
    readNumberPref(STORAGE_HEIGHT, DEFAULT_HEIGHT),
  );
  const [fontSize, setFontSize] = useState<number>(() => {
    const stored = readNumberPref(STORAGE_FONT, DEFAULT_FONT);
    return Math.max(MIN_FONT, Math.min(MAX_FONT, Math.round(stored)));
  });
  const bumpFont = useCallback((delta: number) => {
    setFontSize((s) => Math.max(MIN_FONT, Math.min(MAX_FONT, s + delta)));
  }, []);
  const resetFont = useCallback(() => setFontSize(DEFAULT_FONT), []);

  const [content, setContent] = useState<string>("");
  /** The last successfully-persisted content. `content !== savedContent`
   * is our dirty signal for auto-save and accidental-close protection. */
  const [savedContent, setSavedContent] = useState<string>("");
  const [loaded, setLoaded] = useState<LoadedNotes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("edit");
  const [renderedHtml, setRenderedHtml] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // We preserve the textarea's scroll + selection across mode switches so
  // toggling "Preview" → "Edit" via the button drops the user back where
  // they were. Captured every time we leave edit mode.
  const editScrollRef = useRef(0);
  const editSelectionRef = useRef<[number, number]>([0, 0]);

  // Load existing notes ONCE per mount. The popup is keyed by nodeId at
  // the wrapper, so opening notes for a different node remounts and
  // reloads. We deliberately don't depend on node.notes here — auto-save
  // changes node.notes, and re-running this effect would clobber the
  // user's in-progress typing with a fresh read.
  const [hasLoaded, setHasLoaded] = useState(false);
  useEffect(() => {
    if (hasLoaded) return;
    let cancelled = false;
    void (async () => {
      const result = await loadNotes(node?.notes, currentFilePath);
      if (cancelled) return;
      setLoaded(result);
      setContent(result.content);
      setSavedContent(result.content);
      setHasLoaded(true);
      // Read-only notes (sidecar we can't edit on this platform) open
      // straight in preview — there's nothing to type.
      if (result.readOnly) setMode("preview");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const isDirty = hasLoaded && content !== savedContent;

  /**
   * Write the current content back to the document store (and to a
   * sidecar file on desktop, when applicable).
   *
   * - When `closeAfter` is true, fires from the explicit Save button or
   *   Cmd+Enter, and dismisses the popup on success.
   * - When false, fires from the auto-save debouncer — the popup stays
   *   open so the user keeps typing.
   *
   * Concurrent calls short-circuit via `saving`; the auto-save effect
   * waits for in-flight writes before scheduling the next one.
   */
  const persist = useCallback(
    async (closeAfter: boolean): Promise<void> => {
      if (readOnly || saving || !parsedDoc || !node) return;
      // Snapshot content so we know the exact string we successfully saved
      // (the textarea may have changed by the time the await resolves).
      const snapshot = content;
      setError(null);
      setSaving(true);
      try {
        const result = await saveNotes(
          snapshot,
          node.notes,
          currentFilePath,
          nodeId,
          node.text,
        );
        const next = updateNode(parsedDoc, nodeId, { notes: result.fieldValue });
        applyTreeChange(next);
        setSavedContent(snapshot);
        setAutoSavedAt(Date.now());
        if (closeAfter) {
          close();
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!closeAfter) setSaving(false);
      }
    },
    [
      readOnly,
      saving,
      parsedDoc,
      node,
      content,
      currentFilePath,
      nodeId,
      applyTreeChange,
      close,
    ],
  );

  // Manual save (Save button + Cmd/Ctrl+Enter): saves and closes.
  const onSave = useCallback(() => persist(true), [persist]);

  // Auto-save: 1 s after the last edit, write to disk WITHOUT closing.
  // Skipped when not dirty, when over the inline-only cap, on read-only
  // notes, or while a save is already in flight.
  useEffect(() => {
    if (readOnly || !isDirty || overLimit || saving) return;
    const handle = window.setTimeout(() => {
      void persist(false);
    }, 1000);
    return () => window.clearTimeout(handle);
  }, [content, isDirty, overLimit, readOnly, saving, persist]);

  // Esc / Cmd+Enter handlers, attached at window level so they fire even
  // when the textarea isn't focused. Esc only closes if the popup is
  // clean (saved). Cmd+Enter saves and closes regardless.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isDirty) {
          // Refuse to close on Esc if there are unsaved changes — auto-save
          // will catch up within ~1 s; or use Cmd+Enter to save & close.
          return;
        }
        e.preventDefault();
        close();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void onSave();
        return;
      }
      // Cmd/Ctrl + (=, +, -, 0) — popup-scoped font zoom. The same
      // keystrokes would normally zoom the browser viewport; we override
      // here so they only zoom the notes text.
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          bumpFont(1);
          return;
        }
        if (e.key === "-") {
          e.preventDefault();
          bumpFont(-1);
          return;
        }
        if (e.key === "0") {
          e.preventDefault();
          resetFont();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bumpFont, close, isDirty, onSave, resetFont]);

  // Focus the textarea on first open of edit mode.
  useEffect(() => {
    if (mode !== "edit") return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
  }, [mode]);

  // Persist user-drag-resize. ResizeObserver fires on every dimension
  // change; we throttle the localStorage write so a smooth drag doesn't
  // hammer it. The min/max constraints are enforced via CSS so we just
  // mirror whatever the browser settled on.
  useEffect(() => {
    const el = popupRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let saveTimer: number | null = null;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        writeNumberPref(STORAGE_WIDTH, Math.round(r.width));
        writeNumberPref(STORAGE_HEIGHT, Math.round(r.height));
      }, 200);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (saveTimer !== null) window.clearTimeout(saveTimer);
    };
  }, []);

  // Persist font-size changes synchronously (rare event compared to drag).
  useEffect(() => {
    writeNumberPref(STORAGE_FONT, fontSize);
  }, [fontSize]);

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
        // Click on the backdrop (not the dialog body) cancels — but only
        // if there are no unsaved changes. Auto-save catches up within
        // ~1 s, so brief lingering on the backdrop is fine. The Cancel
        // and Save buttons inside the dialog are the explicit-intent
        // close paths.
        if (e.target !== e.currentTarget) return;
        if (isDirty) return;
        close();
      }}
    >
      <div
        ref={popupRef}
        style={{
          width: `${popupWidth}px`,
          height: `${popupHeight}px`,
          minWidth: "20vw",
          minHeight: "20vh",
          maxWidth: "80vw",
          maxHeight: "80vh",
          // resize: both gives the user a drag-handle in the bottom-right
          // corner. overflow:hidden is required for resize to render.
          resize: "both",
          overflow: "hidden",
        }}
        className="flex flex-col rounded-lg border border-neutral-300 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
      >
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
            <FontSizeControls
              size={fontSize}
              onSmaller={() => bumpFont(-1)}
              onLarger={() => bumpFont(1)}
              onReset={resetFont}
            />
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
                style={{ fontSize: `${fontSize}px`, lineHeight: 1.5 }}
                placeholder={
                  readOnly
                    ? ""
                    : "Markdown notes — supports headings, bold, italic, lists, links, code blocks…"
                }
                className="min-h-0 flex-1 resize-none border-0 bg-transparent p-4 font-mono text-neutral-900 outline-none dark:text-neutral-100"
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
              style={{ fontSize: `${fontSize}px` }}
              className="clobmap-md min-h-0 flex-1 cursor-text overflow-auto p-4"
              /* Styles for headings / lists / code / blockquote come from
                 .clobmap-md in src/index.css. micromark output is CommonMark;
                 user HTML is escaped by default. */
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800">
          <div className="min-w-0 truncate text-xs">
            {error ? (
              <span className="text-red-600 dark:text-red-400">{error}</span>
            ) : saving ? (
              <span className="text-neutral-500">Saving…</span>
            ) : isDirty ? (
              <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span>
            ) : autoSavedAt ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                Saved automatically
              </span>
            ) : null}
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

function FontSizeControls({
  size,
  onSmaller,
  onLarger,
  onReset,
}: {
  size: number;
  onSmaller: () => void;
  onLarger: () => void;
  onReset: () => void;
}) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded border border-neutral-300 dark:border-neutral-600">
      <button
        type="button"
        onClick={onSmaller}
        disabled={size <= MIN_FONT}
        title="Decrease text size  (Cmd/Ctrl + −)"
        className="px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800"
        aria-label="Decrease text size"
      >
        A−
      </button>
      <button
        type="button"
        onClick={onReset}
        title="Reset text size  (Cmd/Ctrl + 0)"
        className="border-x border-neutral-300 px-2 py-0.5 font-mono text-[10px] tabular-nums text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800"
        aria-label="Reset text size"
      >
        {size}
      </button>
      <button
        type="button"
        onClick={onLarger}
        disabled={size >= MAX_FONT}
        title="Increase text size  (Cmd/Ctrl + =)"
        className="px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800"
        aria-label="Increase text size"
      >
        A+
      </button>
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
