import { useEffect, useMemo, useRef, useState } from "react";
import { useDocumentStore } from "../store/document";
import { useUIStore } from "../store/ui";
import {
  findById,
  idGeneratorForDocument,
  OpError,
  tagsAdd,
  tagsRemove,
  type TagNode,
} from "../model";

/**
 * Compact modal for editing the tags on a single data-node. Opened from
 * either the context-menu item ("Edit tags…") or the `T` keyboard
 * shortcut. Free-text input with autocomplete against existing
 * tag-tree entries; existing tags on the node show as removable chips.
 *
 * Commits eagerly via `tagsAdd` / `tagsRemove` — there's no separate
 * "Save" step. All close paths (Done, ×, Esc, backdrop) flush any
 * pending input first so a typed-but-not-Enter value isn't lost.
 */
export function TagEditor() {
  const nodeId = useUIStore((s) => s.tagEditorNodeId);
  if (!nodeId) return null;
  return <TagEditorInner key={nodeId} nodeId={nodeId} />;
}

function collectTagNames(root: TagNode | undefined): string[] {
  if (!root) return [];
  const out: string[] = [];
  function walk(n: TagNode, isRoot: boolean): void {
    if (!isRoot) out.push(n.name);
    for (const c of n.children) walk(c, false);
  }
  walk(root, true);
  return out;
}

function TagEditorInner({ nodeId }: { nodeId: string }) {
  const close = useUIStore((s) => s.closeTagEditor);
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);

  const node = parsedDoc ? findById(parsedDoc, nodeId) : null;
  const currentTags = useMemo(() => node?.tags ?? [], [node]);
  const allTagNames = useMemo(() => collectTagNames(parsedDoc?.tagRoot), [parsedDoc]);

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // What's the "active fragment" the user is currently typing? With
  // comma-separated batches we autocomplete against the slice AFTER
  // the last comma — that way typing "alpha, b" suggests "beta" etc.
  const activeFragment = useMemo(() => {
    const lastComma = input.lastIndexOf(",");
    const fragment = lastComma === -1 ? input : input.slice(lastComma + 1);
    return fragment.trim();
  }, [input]);

  const suggestions = useMemo(() => {
    if (activeFragment.length === 0) return [];
    const key = activeFragment.toLowerCase();
    const onNode = new Set(currentTags.map((t) => t.toLowerCase()));
    return allTagNames
      .filter((name) => {
        const nameKey = name.toLowerCase();
        if (onNode.has(nameKey)) return false; // already on this node
        return nameKey.includes(key);
      })
      .slice(0, 8);
  }, [activeFragment, allTagNames, currentTags]);

  // Keep the highlight index in range as suggestions change.
  useEffect(() => {
    if (highlight >= suggestions.length) setHighlight(0);
  }, [suggestions.length, highlight]);

  if (!node) {
    close();
    return null;
  }

  /**
   * Commits the current input field as a batch of tags. Returns `true`
   * on empty input or success, `false` on validation error.
   */
  const commitInput = (): boolean => {
    setError(null);
    const names = input
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (names.length === 0) return true;
    const tree = useDocumentStore.getState().parsedDoc;
    if (!tree) return true;
    try {
      const ids = idGeneratorForDocument(tree);
      applyTreeChange(tagsAdd(tree, nodeId, names, ids));
      setInput("");
      return true;
    } catch (e) {
      if (e instanceof OpError) {
        setError(e.message);
        return false;
      }
      throw e;
    }
  };

  /**
   * Replace the active fragment in the input with the selected
   * suggestion, preserving any earlier comma-separated entries the
   * user already typed.
   */
  const acceptSuggestion = (name: string): void => {
    const lastComma = input.lastIndexOf(",");
    const prefix = lastComma === -1 ? "" : input.slice(0, lastComma + 1);
    setInput(`${prefix}${prefix.length ? " " : ""}${name}`);
    setHighlight(0);
    inputRef.current?.focus();
  };

  const commitAndClose = (): void => {
    if (commitInput()) close();
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
        if (e.target === e.currentTarget) commitAndClose();
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
            commitAndClose();
          }
        }}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-medium">
            Tags <span className="text-neutral-500">— {node.text}</span>
          </h2>
          <button
            type="button"
            onClick={commitAndClose}
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

        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && suggestions.length > 0) {
                e.preventDefault();
                setHighlight((h) => (h + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp" && suggestions.length > 0) {
                e.preventDefault();
                setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if ((e.key === "Tab" || e.key === "ArrowRight") && suggestions.length > 0) {
                // Tab / Right-arrow accept the current highlight without
                // committing — the user can keep editing afterwards.
                e.preventDefault();
                const pick = suggestions[highlight];
                if (pick) acceptSuggestion(pick);
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                // If the autocomplete dropdown is open AND has a
                // suggestion the user has highlighted that doesn't
                // exactly match the active fragment, accept it then
                // commit. Otherwise treat Enter as a plain commit so
                // the user can type a brand-new tag and confirm with
                // one keypress.
                const pick = suggestions[highlight];
                if (
                  pick &&
                  pick.toLowerCase() !== activeFragment.toLowerCase()
                ) {
                  acceptSuggestion(pick);
                  return;
                }
                commitInput();
              }
            }}
            placeholder="Type tag(s), commas for batch — Enter or Done to save"
            aria-label="Add tag"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-emerald-400"
          />
          {suggestions.length > 0 && (
            <ul
              role="listbox"
              aria-label="Tag suggestions"
              className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-auto rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
            >
              {suggestions.map((name, i) => {
                const exactMatch = name.toLowerCase() === activeFragment.toLowerCase();
                const caseOnly = exactMatch && name !== activeFragment;
                return (
                  <li
                    key={name}
                    role="option"
                    aria-selected={i === highlight}
                    onMouseDown={(e) => {
                      // mousedown not click — click fires after blur, by
                      // which time the input has already lost focus and
                      // the dropdown could have dismissed.
                      e.preventDefault();
                      acceptSuggestion(name);
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={`flex cursor-pointer items-center justify-between gap-2 px-2 py-1 text-sm ${
                      i === highlight
                        ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
                        : "text-neutral-800 dark:text-neutral-200"
                    }`}
                  >
                    <span>{name}</span>
                    {caseOnly && (
                      <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-300">
                        case differs
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {error && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <footer className="flex justify-end">
          <button
            type="button"
            onClick={commitAndClose}
            className="rounded border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
