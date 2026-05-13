import { useEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { yaml } from "@codemirror/lang-yaml";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { search, searchKeymap, openSearchPanel } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { parseYaml } from "../model";
import { useDocumentStore } from "../store/document";
import { useUIStore } from "../store/ui";

const yamlLinter = linter((view) => {
  const text = view.state.doc.toString();
  const result = parseYaml(text);
  if (result.ok) return [];
  const totalLines = view.state.doc.lines;
  const targetLine = Math.max(1, Math.min(result.error.line, totalLines));
  const line = view.state.doc.line(targetLine);
  const colOffset = Math.max(0, result.error.col - 1);
  const from = Math.min(line.from + colOffset, line.to);
  const to = Math.max(from + 1, line.to);
  const diagnostic: Diagnostic = {
    from,
    to,
    severity: "error",
    message: result.error.message,
  };
  return [diagnostic];
});

function findIdLine(text: string, id: string): number {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^\\s*-?\\s*id:\\s*['"\`]?${escaped}['"\`]?\\s*$`, "m");
  const match = regex.exec(text);
  if (!match) return -1;
  return text.slice(0, match.index).split("\n").length;
}

function buildBaseTheme(fontSize: number) {
  return EditorView.theme({
    "&": { height: "100%", fontSize: `${fontSize}px` },
    ".cm-scroller": {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    },
  });
}

export function YamlEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef(new Compartment());
  const fontCompartmentRef = useRef(new Compartment());
  const setYamlText = useDocumentStore((s) => s.setYamlText);

  const yamlText = useDocumentStore((s) => s.yamlText);
  const viewMode = useUIStore((s) => s.viewMode);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);
  const fontSize = useUIStore((s) => s.fontSize);

  // Mount the editor once.
  useEffect(() => {
    if (!containerRef.current) return;
    const initial = useDocumentStore.getState().yamlText;
    const initialTheme = useUIStore.getState().resolvedTheme;
    const initialFont = useUIStore.getState().fontSize;

    const onChange = EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        setYamlText(u.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: initial,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        search({ top: true }),
        // The keymap facet doesn't dispatch Mod-f reliably in this setup
        // (something in our DOM ancestry seems to swallow it before the
        // editor's keydown handler can run). Wire it via a dom-event
        // handler at the editor level, which fires directly off the
        // contentDOM keydown — same firing point CodeMirror's keymap
        // uses, but unambiguous about precedence.
        EditorView.domEventHandlers({
          keydown(event, view) {
            if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "f") {
              event.preventDefault();
              openSearchPanel(view);
              return true;
            }
            return false;
          },
        }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        yaml(),
        yamlLinter,
        lintGutter(),
        themeCompartmentRef.current.of(initialTheme === "dark" ? [oneDark] : []),
        EditorView.lineWrapping,
        fontCompartmentRef.current.of(buildBaseTheme(initialFont)),
        onChange,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [setYamlText]);

  // Switch CodeMirror theme when the app theme changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(resolvedTheme === "dark" ? [oneDark] : []),
    });
  }, [resolvedTheme]);

  // Reapply font size on change.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: fontCompartmentRef.current.reconfigure(buildBaseTheme(fontSize)),
    });
  }, [fontSize]);

  // Mirror external yamlText changes (e.g. from mind-map edits) into the editor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === yamlText) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: yamlText },
    });
  }, [yamlText]);

  // When the YAML view becomes visible with a selected node, jump cursor to it.
  useEffect(() => {
    if (viewMode === "mindmap" || !selectedNodeId) return;
    const view = viewRef.current;
    if (!view) return;
    const text = view.state.doc.toString();
    const lineNum = findIdLine(text, selectedNodeId);
    if (lineNum < 1) return;
    const line = view.state.doc.line(Math.min(lineNum, view.state.doc.lines));
    view.dispatch({
      selection: { anchor: line.from, head: line.from },
      scrollIntoView: true,
    });
    if (viewMode === "yaml") view.focus();
  }, [viewMode, selectedNodeId]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
