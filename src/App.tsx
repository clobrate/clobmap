import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import { YamlEditor } from "./components/YamlEditor";
import { MindMap } from "./components/MindMap";
import { StatusBar } from "./components/StatusBar";
import { ViewToggle } from "./components/ViewToggle";
import { FileMenu } from "./components/FileMenu";
import { useDocumentStore } from "./store/document";
import { useUIStore } from "./store/ui";
import { useDebouncedParse } from "./store/useDebouncedParse";
import { parseLiveYaml } from "./model";
import { openFile, saveFile, saveFileAs } from "./lib/fileActions";
import { tauriStorage } from "./lib/storage";

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

function basename(path: string | null): string {
  if (!path) return "Untitled";
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function App() {
  const reset = useDocumentStore((s) => s.reset);
  const viewMode = useUIStore((s) => s.viewMode);
  const toggleViewMode = useUIStore((s) => s.toggleViewMode);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const currentFilePath = useDocumentStore((s) => s.currentFilePath);
  useDebouncedParse(150);

  // Seed initial document on mount.
  useEffect(() => {
    const result = parseLiveYaml(DEFAULT_YAML);
    if (result.ok) reset(DEFAULT_YAML, result.value.tree, result.value.doc);
    else reset(DEFAULT_YAML, null);
  }, [reset]);

  // App-wide keyboard shortcuts (capture phase to beat CodeMirror).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd) return;

      if (!e.shiftKey && !e.altKey && e.key === "/") {
        e.preventDefault();
        e.stopPropagation();
        toggleViewMode();
        return;
      }
      const key = e.key.toLowerCase();
      if (!e.shiftKey && !e.altKey && key === "o") {
        e.preventDefault();
        e.stopPropagation();
        void openFile();
        return;
      }
      if (e.shiftKey && !e.altKey && key === "s") {
        e.preventDefault();
        e.stopPropagation();
        void saveFileAs();
        return;
      }
      if (!e.shiftKey && !e.altKey && key === "s") {
        e.preventDefault();
        e.stopPropagation();
        void saveFile();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [toggleViewMode]);

  // Reflect filename + dirty marker in the OS window title.
  useEffect(() => {
    const title = `${isDirty ? "● " : ""}${basename(currentFilePath)} — clobmap`;
    void getCurrentWindow().setTitle(title);
  }, [isDirty, currentFilePath]);

  // Confirm before discarding unsaved changes on window close.
  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win
      .onCloseRequested(async (event) => {
        if (!useDocumentStore.getState().isDirty) return;
        const ok = await confirm("Discard unsaved changes?", {
          title: "Unsaved changes",
          kind: "warning",
          okLabel: "Discard and quit",
          cancelLabel: "Keep editing",
        });
        if (!ok) event.preventDefault();
      })
      .then((u) => {
        unlisten = u;
      });
    return () => {
      unlisten?.();
    };
  }, []);

  // Watch the open file for external modifications.
  useEffect(() => {
    if (!currentFilePath) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void tauriStorage
      .watch(currentFilePath, () => {
        if (cancelled) return;
        void handleExternalChange(currentFilePath);
      })
      .then((stopFn) => {
        if (cancelled) stopFn();
        else stop = stopFn;
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [currentFilePath]);

  return (
    <main className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-3 py-2">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium tracking-tight">clobmap</h1>
          <FileMenu />
        </div>
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

async function handleExternalChange(path: string) {
  const state = useDocumentStore.getState();
  if (state.currentFilePath !== path) return;
  let next: string;
  try {
    next = await tauriStorage.read(path);
  } catch {
    return;
  }
  if (next === state.yamlText) return;

  if (state.isDirty) {
    const ok = await confirm("The file changed on disk. Reload and discard your unsaved changes?", {
      title: "External change",
      kind: "warning",
      okLabel: "Reload",
      cancelLabel: "Keep editing",
    });
    if (!ok) return;
  }
  const parsed = parseLiveYaml(next);
  if (parsed.ok) {
    state.reset(next, parsed.value.tree, parsed.value.doc, path);
  } else {
    state.reset(next, null, null, path);
    state.applyParseError(parsed.error);
  }
}

export default App;
