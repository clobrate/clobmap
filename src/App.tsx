import { useEffect } from "react";
import { YamlEditor } from "./components/YamlEditor";
import { MindMap } from "./components/MindMap";
import { StatusBar } from "./components/StatusBar";
import { ViewToggle } from "./components/ViewToggle";
import { FileMenu } from "./components/FileMenu";
import { SettingsMenu } from "./components/SettingsMenu";
import { useDocumentStore } from "./store/document";
import { useUIStore } from "./store/ui";
import { useDebouncedParse } from "./store/useDebouncedParse";
import { parseLiveYaml } from "./model";
import { openFile, saveFile, saveFileAs } from "./lib/fileActions";
import { storage } from "./lib/storage";
import { loadSettings } from "./lib/settings";
import { isTauri } from "./lib/env";

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
  const splitOrientation = useUIStore((s) => s.splitOrientation);
  const setAutoSave = useUIStore((s) => s.setAutoSave);
  const setSplitOrientation = useUIStore((s) => s.setSplitOrientation);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const currentFilePath = useDocumentStore((s) => s.currentFilePath);
  const yamlText = useDocumentStore((s) => s.yamlText);
  const parseError = useDocumentStore((s) => s.parseError);
  const autoSave = useUIStore((s) => s.autoSave);
  useDebouncedParse(150);

  // Seed initial document on mount.
  useEffect(() => {
    const result = parseLiveYaml(DEFAULT_YAML);
    if (result.ok) reset(DEFAULT_YAML, result.value.tree, result.value.doc);
    else reset(DEFAULT_YAML, null);
  }, [reset]);

  // Hydrate persisted settings (auto-save, split orientation) on mount.
  useEffect(() => {
    void loadSettings().then((s) => {
      setAutoSave(s.autoSave);
      setSplitOrientation(s.splitOrientation);
    });
  }, [setAutoSave, setSplitOrientation]);

  // Auto-save: debounced disk write when YAML is valid and the doc has a path.
  useEffect(() => {
    if (!autoSave || !currentFilePath || parseError || !isDirty) return;
    const handle = setTimeout(() => {
      void saveFile();
    }, 1000);
    return () => clearTimeout(handle);
  }, [autoSave, currentFilePath, parseError, isDirty, yamlText]);

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

  // Reflect filename + dirty marker in the window/document title.
  useEffect(() => {
    const title = `${isDirty ? "● " : ""}${basename(currentFilePath)} — clobmap`;
    document.title = title;
    if (!isTauri()) return;
    let cancelled = false;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      if (cancelled) return;
      void getCurrentWindow().setTitle(title);
    });
    return () => {
      cancelled = true;
    };
  }, [isDirty, currentFilePath]);

  // Confirm before discarding unsaved changes when the user tries to close.
  useEffect(() => {
    if (isTauri()) {
      let unlisten: (() => void) | undefined;
      let cancelled = false;
      void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        if (cancelled) return;
        void import("@tauri-apps/plugin-dialog").then(async ({ confirm }) => {
          if (cancelled) return;
          unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
            if (!useDocumentStore.getState().isDirty) return;
            const ok = await confirm("Discard unsaved changes?", {
              title: "Unsaved changes",
              kind: "warning",
              okLabel: "Discard and quit",
              cancelLabel: "Keep editing",
            });
            if (!ok) event.preventDefault();
          });
        });
      });
      return () => {
        cancelled = true;
        unlisten?.();
      };
    }
    // Web: native beforeunload prompt.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useDocumentStore.getState().isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Watch the open file for external modifications (Tauri only — web watcher is a no-op).
  useEffect(() => {
    if (!currentFilePath || !isTauri()) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void storage
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
        <div className="flex items-center gap-2">
          <ViewToggle />
          <SettingsMenu />
        </div>
      </header>
      <div
        className={
          viewMode === "split" && splitOrientation === "vertical"
            ? "flex min-h-0 flex-1 flex-col"
            : "flex min-h-0 flex-1"
        }
      >
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
            <div
              className={
                splitOrientation === "horizontal"
                  ? "flex-1 border-r border-neutral-800"
                  : "flex-1 border-b border-neutral-800"
              }
            >
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
    next = await storage.read(path);
  } catch {
    return;
  }
  if (next === state.yamlText) return;

  if (state.isDirty) {
    const { confirm } = await import("@tauri-apps/plugin-dialog");
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
