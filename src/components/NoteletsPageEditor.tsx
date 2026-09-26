import { useCallback, useEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { useNodeNotes } from "../lib/useNodeNotes";
import { useUIStore } from "../store/ui";

function buildBaseTheme(fontSize: number) {
  return EditorView.theme({
    "&": { fontSize: `${fontSize}px` },
    ".cm-content": {
      minHeight: "5rem",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    ".cm-scroller": { lineHeight: "1.5" },
  });
}

/**
 * In-page Markdown editor for one Notelets page. A CodeMirror view bound to
 * the shared `useNodeNotes` write path (load / dirty-tracking / 1s auto-save /
 * inline↔sidecar / over-limit rules all come from the hook). Mounted only for
 * the page being edited (the container keeps one editor at a time). Blur or
 * `Esc` saves and exits.
 *
 * Mirrors YamlEditor.tsx's imperative CodeMirror wiring, minus the YAML
 * linter/gutter/line-numbers, plus Markdown.
 */
export function NoteletsPageEditor({
  nodeId,
  title,
  onExit,
}: {
  nodeId: string;
  title: string;
  onExit: () => void;
}) {
  const { content, setContent, save, hasLoaded, saving, isDirty, overLimit, autoSavedAt, error } =
    useNodeNotes(nodeId);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);
  const fontSize = useUIStore((s) => s.fontSize);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const fontCompartment = useRef(new Compartment());
  // Latest content, so the mount effect can seed the doc without depending on
  // `content` (which changes on every keystroke and would remount the editor).
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Save-then-exit. Await the flush FIRST — the hook's 1s auto-save debounce is
  // cleared on unmount, so this is the only thing preventing lost sub-second
  // edits. Guard against double-exit (blur + unmount, or Esc + blur).
  const exitedRef = useRef(false);
  const exit = useCallback(async (): Promise<void> => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    await save();
    onExit();
  }, [save, onExit]);
  const exitRef = useRef(exit);
  useEffect(() => {
    exitRef.current = exit;
  }, [exit]);

  // Mount CodeMirror once, after notes have loaded so the doc is seeded with
  // real content (not the pre-load empty string).
  useEffect(() => {
    if (!hasLoaded || !containerRef.current) return;
    const dark = useUIStore.getState().resolvedTheme === "dark";
    const font = useUIStore.getState().fontSize;
    const state = EditorState.create({
      doc: contentRef.current,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        // markdown() adds Enter → continue-list-marker and Backspace →
        // delete-marker (a nice notebook affordance, like typical MD editors).
        markdown(),
        EditorView.lineWrapping,
        themeCompartment.current.of(dark ? [oneDark] : []),
        fontCompartment.current.of(buildBaseTheme(font)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) setContent(u.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          keydown: (e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              void exitRef.current();
              return true;
            }
            return false;
          },
          blur: () => {
            void exitRef.current();
            return false;
          },
        }),
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [hasLoaded, setContent]);

  // Mirror external `content` changes into the view (initial post-load seed is
  // already handled at mount; this catches edits from elsewhere, e.g. the
  // popup on the same node). Equality check breaks the updateListener loop.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === content) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: content } });
  }, [content]);

  // Re-theme / re-font on app changes (copied from YamlEditor).
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(resolvedTheme === "dark" ? [oneDark] : []),
    });
  }, [resolvedTheme]);
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: fontCompartment.current.reconfigure(buildBaseTheme(fontSize)),
    });
  }, [fontSize]);

  return (
    <div className="mt-2">
      <div
        ref={containerRef}
        role="textbox"
        aria-label={`Notes for ${title}`}
        className="overflow-hidden rounded border border-neutral-300 focus-within:border-blue-500 dark:border-neutral-700"
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-500">
        <span>
          {content.length} chars
          {overLimit && (
            <span className="ml-2 text-red-600 dark:text-red-400">
              Over limit — install desktop for sidecar files
            </span>
          )}
        </span>
        <span>
          {error ? (
            <span className="text-red-600 dark:text-red-400">{error}</span>
          ) : saving ? (
            "Saving…"
          ) : isDirty ? (
            <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span>
          ) : autoSavedAt ? (
            <span className="text-emerald-600 dark:text-emerald-400">Saved automatically</span>
          ) : (
            "Esc or click away to save"
          )}
        </span>
      </div>
    </div>
  );
}
