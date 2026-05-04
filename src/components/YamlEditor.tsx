import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { yaml } from "@codemirror/lang-yaml";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
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

export function YamlEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const setYamlText = useDocumentStore((s) => s.setYamlText);

  const yamlText = useDocumentStore((s) => s.yamlText);
  const viewMode = useUIStore((s) => s.viewMode);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);

  // Mount the editor once.
  useEffect(() => {
    if (!containerRef.current) return;
    const initial = useDocumentStore.getState().yamlText;

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
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        yaml(),
        yamlLinter,
        lintGutter(),
        oneDark,
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { height: "100%", fontSize: "14px" },
          ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
        }),
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
