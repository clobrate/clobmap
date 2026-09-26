import { useCallback, useEffect, useState } from "react";
import { useDocumentStore } from "../store/document";
import { findById, updateNode } from "../model";
import { loadNotes, NOTES_INLINE_LIMIT, saveNotes, type LoadedNotes } from "./notes";
import { isMobile, isTauri } from "./env";

export interface UseNodeNotes {
  /** Current editor content (markdown). */
  content: string;
  setContent: (s: string) => void;
  /** Raw load result — exposes isPathRef / resolvedPath / message. */
  loaded: LoadedNotes | null;
  /** True once the initial load has settled. */
  hasLoaded: boolean;
  /**
   * Persist the current content (writing a sidecar file on desktop when
   * applicable). Does NOT close any UI. Returns true on success so callers
   * can decide what to do next (e.g. close a popup). No-ops (returns false)
   * when read-only, already saving, or the node is gone.
   */
  save: () => Promise<boolean>;
  saving: boolean;
  error: string | null;
  /** Timestamp of the last successful save, for "Saved automatically" UI. */
  autoSavedAt: number | null;
  isDirty: boolean;
  readOnly: boolean;
  /** True when content exceeds the inline cap on a build without sidecars. */
  overLimit: boolean;
}

/**
 * The notes IO state machine — load, dirty-tracking, debounced auto-save,
 * and the inline-vs-sidecar / read-only / over-limit rules — extracted from
 * NotesPopup so every notes surface (the popup and the Notelets view) shares
 * ONE implementation. This is what keeps the inline/sidecar split invisible
 * and identical everywhere.
 *
 * Intended to be used under a component keyed by `nodeId`, so the one-shot
 * load runs cleanly whenever the target node changes.
 */
export function useNodeNotes(nodeId: string): UseNodeNotes {
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);
  const currentFilePath = useDocumentStore((s) => s.currentFilePath);
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);
  const node = parsedDoc ? findById(parsedDoc, nodeId) : null;

  const [content, setContent] = useState<string>("");
  /** Last successfully-persisted content; `content !== savedContent` is dirty. */
  const [savedContent, setSavedContent] = useState<string>("");
  const [loaded, setLoaded] = useState<LoadedNotes | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<number | null>(null);

  // Load existing notes ONCE per mount. We deliberately don't depend on
  // node.notes — auto-save changes it, and re-running would clobber the
  // user's in-progress typing with a fresh read.
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
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readOnly = loaded?.readOnly ?? false;
  // Browser/iOS limit. Desktop's "limit" is just the auto-extract threshold.
  const isWebOrMobile = !isTauri() || isMobile();
  const overLimit = isWebOrMobile && content.length > NOTES_INLINE_LIMIT;
  const isDirty = hasLoaded && content !== savedContent;

  const save = useCallback(async (): Promise<boolean> => {
    if (readOnly || saving || !parsedDoc || !node) return false;
    // Snapshot content so we know the exact string we successfully saved
    // (it may change again before the await resolves).
    const snapshot = content;
    setError(null);
    setSaving(true);
    try {
      const result = await saveNotes(snapshot, node.notes, currentFilePath, nodeId, node.text);
      const next = updateNode(parsedDoc, nodeId, { notes: result.fieldValue });
      applyTreeChange(next);
      setSavedContent(snapshot);
      setAutoSavedAt(Date.now());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [readOnly, saving, parsedDoc, node, content, currentFilePath, nodeId, applyTreeChange]);

  // Auto-save: 1 s after the last edit, write WITHOUT closing anything.
  // Skipped when not dirty, over the inline-only cap, read-only, or while a
  // save is already in flight.
  useEffect(() => {
    if (readOnly || !isDirty || overLimit || saving) return;
    const handle = window.setTimeout(() => {
      void save();
    }, 1000);
    return () => window.clearTimeout(handle);
  }, [content, isDirty, overLimit, readOnly, saving, save]);

  return {
    content,
    setContent,
    loaded,
    hasLoaded,
    save,
    saving,
    error,
    autoSavedAt,
    isDirty,
    readOnly,
    overLimit,
  };
}
