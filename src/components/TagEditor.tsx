import { useEffect, useMemo, useRef, useState } from "react";
import { useDocumentStore } from "../store/document";
import { useUIStore } from "../store/ui";
import { findById, idGeneratorForDocument, OpError, tagsAdd, tagsRemove } from "../model";

/**
 * Compact modal for editing the tags on a single data-node. Opened from
 * either the context-menu item ("Edit tags…") or the `T` keyboard
 * shortcut. Free-text input, with commit-on-Enter so the user can keep
 * typing tags in one session; existing tags show as removable chips.
 *
 * The editor commits each tags-add / tags-remove eagerly via the model
 * ops — there's no separate "Save" step. The Close button just dismisses
 * the popup; the underlying changes are already on the document.
 */
export function TagEditor() {
  const nodeId = useUIStore((s) => s.tagEditorNodeId);
  if (!nodeId) return null;
  return <TagEditorInner key={nodeId} nodeId={nodeId} />;
}

function TagEditorInner({ nodeId }: { nodeId: string }) {
  const close = useUIStore((s) => s.closeTagEditor);
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);

  const node = parsedDoc ? findById(parsedDoc, nodeId) : null;
  const currentTags = useMemo(() => node?.tags ?? [], [node]);

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (!node) {
    close();
    return null;
  }

  const commitInput = (): void => {
    setError(null);
    // Split on commas (and trim) so users can type "a, b, c" in one go.
    const names = input
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (names.length === 0) return;
    const tree = useDocumentStore.getState().parsedDoc;
    if (!tree) return;
    try {
      const ids = idGeneratorForDocument(tree);
      applyTreeChange(tagsAdd(tree, nodeId, names, ids));
      setInput("");
    } catch (e) {
      if (e instanceof OpError) setError(e.message);
      else throw e;
    }
  };

  const removeOne = (name: string): void => {
    setError(null);
    const tree = useDocumentStore.getState().parsedDoc;
    if (!tree) return;
    try {
      applyTreeChange(tagsRemove(tree, nodeId, [name]));
    } catch (e) {
      if (e instanceof OpError) setError(e.message);
      else throw e;
    }
  };

  return (
    <div
      role="dialog"
      aria-label={`Edit tags for ${node.text}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="flex w-[420px] max-w-[90vw] flex-col gap-3 rounded-lg border border-neutral-300 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onKeyDown={(e) => {
          // Inside the modal, swallow keys so canvas-level shortcuts
          // (Delete, Tab, etc.) don't fire while the user is typing tags.
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-medium">
            Tags <span className="text-neutral-500">— {node.text}</span>
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            ×
          </button>
        </header>

        <div className="flex flex-wrap gap-1.5" aria-label="Current tags">
          {currentTags.length === 0 ? (
            <span className="text-xs text-neutral-500">No tags yet.</span>
          ) : (
            currentTags.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-200/80 px-2 py-0.5 text-xs text-neutral-800 dark:bg-neutral-700/80 dark:text-neutral-100"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeOne(t)}
                  aria-label={`Remove tag ${t}`}
                  className="text-neutral-500 hover:text-red-600 dark:hover:text-red-300"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>

        <div>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitInput();
              }
            }}
            placeholder="Add tags — Enter to commit, commas for batch"
            aria-label="Add tag"
            className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-emerald-400"
          />
          {error && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <footer className="flex justify-end">
          <button
            type="button"
            onClick={close}
            className="rounded border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
