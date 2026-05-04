import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { yaml } from "@codemirror/lang-yaml";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";
import { parseYaml } from "../model";
import { useDocumentStore } from "../store/document";

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

export function YamlEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const setYamlText = useDocumentStore((s) => s.setYamlText);

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
    return () => view.destroy();
  }, [setYamlText]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
