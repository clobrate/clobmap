import { useEffect } from "react";
import { YamlEditor } from "./components/YamlEditor";
import { MindMap } from "./components/MindMap";
import { StatusBar } from "./components/StatusBar";
import { ViewToggle } from "./components/ViewToggle";
import { useDocumentStore } from "./store/document";
import { useUIStore } from "./store/ui";
import { useDebouncedParse } from "./store/useDebouncedParse";
import { parseLiveYaml } from "./model";

const DEFAULT_YAML = `title: Welcome to clobmap
version: 1
root:
  id: n1
  text: Mind map
  children:
    - id: n2
      text: Edit me — this is YAML
      children: []
    - id: n3
      text: Toggle the Mind-map button to see this rendered
      children:
        - id: n4
          text: Tab indent works
          children: []
        - id: n5
          text: Cmd/Ctrl+Z undoes
          children: []
`;

function App() {
  const reset = useDocumentStore((s) => s.reset);
  const viewMode = useUIStore((s) => s.viewMode);
  const toggleViewMode = useUIStore((s) => s.toggleViewMode);
  useDebouncedParse(150);

  useEffect(() => {
    const result = parseLiveYaml(DEFAULT_YAML);
    if (result.ok) reset(DEFAULT_YAML, result.value.tree, result.value.doc);
    else reset(DEFAULT_YAML, null);
  }, [reset]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === "/") {
        e.preventDefault();
        e.stopPropagation();
        toggleViewMode();
      }
    };
    // capture: run before CodeMirror's keymap (which binds Cmd+/ to toggle-comment).
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [toggleViewMode]);

  return (
    <main className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-3 py-2">
        <h1 className="text-sm font-medium tracking-tight">clobmap</h1>
        <ViewToggle />
      </header>
      <div className="flex min-h-0 flex-1">
        {viewMode === "yaml" && (
          <div className="flex-1">
            <YamlEditor />
          </div>
        )}
        {viewMode === "mindmap" && (
          <div className="flex-1">
            <MindMap />
          </div>
        )}
        {viewMode === "split" && (
          <>
            <div className="flex-1 border-r border-neutral-800">
              <YamlEditor />
            </div>
            <div className="flex-1">
              <MindMap />
            </div>
          </>
        )}
      </div>
      <StatusBar />
    </main>
  );
}

export default App;
