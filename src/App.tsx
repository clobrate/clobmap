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
import { clearDraft, loadDraft, saveDraft } from "./lib/draft";
import { applyTheme, resolveTheme, watchSystemTheme } from "./lib/theme";
import { checkForUpdate, shouldRunScheduledCheck } from "./lib/updater";
import { UpdateBanner } from "./components/UpdateBanner";
import { SplitPanes } from "./components/SplitPanes";
import { saveSplitRatioPref } from "./lib/settings";
import { bootstrapOpenFromOs } from "./lib/openFromOs";

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
  const availableUpdate = useUIStore((s) => s.availableUpdate);
  const setAvailableUpdate = useUIStore((s) => s.setAvailableUpdate);
  const reset = useDocumentStore((s) => s.reset);
  const viewMode = useUIStore((s) => s.viewMode);
  const toggleViewMode = useUIStore((s) => s.toggleViewMode);
  const splitOrientation = useUIStore((s) => s.splitOrientation);
  const splitRatio = useUIStore((s) => s.splitRatio);
  const setSplitRatio = useUIStore((s) => s.setSplitRatio);
  const setAutoSave = useUIStore((s) => s.setAutoSave);
  const setSplitOrientation = useUIStore((s) => s.setSplitOrientation);
  const setThemePreference = useUIStore((s) => s.setThemePreference);
  const setResolvedTheme = useUIStore((s) => s.setResolvedTheme);
  const setFontSize = useUIStore((s) => s.setFontSize);
  const themePreference = useUIStore((s) => s.themePreference);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);
  const liveAnnouncement = useUIStore((s) => s.liveAnnouncement);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const currentFilePath = useDocumentStore((s) => s.currentFilePath);
  const yamlText = useDocumentStore((s) => s.yamlText);
  const parseError = useDocumentStore((s) => s.parseError);
  const autoSave = useUIStore((s) => s.autoSave);
  useDebouncedParse(150);

  // Seed initial document on mount. If a draft exists from a previous session,
  // restore it as the starting state; otherwise use the welcome sample.
  useEffect(() => {
    const draft = loadDraft();
    const initialText = draft ?? DEFAULT_YAML;
    const result = parseLiveYaml(initialText);
    if (result.ok) reset(initialText, result.value.tree, result.value.doc);
    else reset(initialText, null);
  }, [reset]);

  // Persist a draft of the in-progress YAML so closing the tab never loses work.
  // Saves while dirty (debounced); clears when the document is clean (just
  // saved, just opened, etc.).
  useEffect(() => {
    if (!isDirty) {
      clearDraft();
      return;
    }
    const handle = setTimeout(() => saveDraft(yamlText), 500);
    return () => clearTimeout(handle);
  }, [yamlText, isDirty]);

  // Hydrate persisted settings on mount.
  useEffect(() => {
    void loadSettings().then((s) => {
      setAutoSave(s.autoSave);
      setSplitOrientation(s.splitOrientation);
      setSplitRatio(s.splitRatio);
      setThemePreference(s.themePreference);
      setFontSize(s.fontSize);
      const resolved = resolveTheme(s.themePreference);
      setResolvedTheme(resolved);
      applyTheme(resolved);
    });
  }, [
    setAutoSave,
    setSplitOrientation,
    setSplitRatio,
    setThemePreference,
    setFontSize,
    setResolvedTheme,
  ]);

  // Re-resolve and apply theme whenever preference changes.
  useEffect(() => {
    const resolved = resolveTheme(themePreference);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, [themePreference, setResolvedTheme]);

  // When the user picked "system", follow OS preference live.
  useEffect(() => {
    if (themePreference !== "system") return;
    return watchSystemTheme((resolved) => {
      setResolvedTheme(resolved);
      applyTheme(resolved);
    });
  }, [themePreference, setResolvedTheme]);

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
    // Web: native beforeunload prompt. Modern browsers ignore the custom
    // message but still display their own "Leave site?" prompt when
    // preventDefault + returnValue are set. Older Safari respects a returned
    // string. The localStorage draft (above) is the real safety net if the
    // browser suppresses the prompt.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useDocumentStore.getState().isDirty) return undefined;
      const msg = "You have unsaved changes. Leave anyway?";
      e.preventDefault();
      e.returnValue = msg;
      return msg;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // OS-driven file opens: argv on launch + RunEvent::Opened during runtime.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void bootstrapOpenFromOs().then((stop) => {
      unlisten = stop;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // Scheduled update check: 30s after launch, then once per 24h.
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;

    const run = async () => {
      if (!shouldRunScheduledCheck()) return;
      const update = await checkForUpdate();
      if (!cancelled && update) {
        setAvailableUpdate({
          version: update.version,
          date: update.date,
          body: update.body,
          install: update.install,
        });
      }
    };

    const startup = setTimeout(run, 30_000);
    const intervalId = setInterval(run, 60 * 60 * 1000); // hourly poll; gated by 24h check inside

    return () => {
      cancelled = true;
      clearTimeout(startup);
      clearInterval(intervalId);
    };
  }, [setAvailableUpdate]);

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
    <main className="flex h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {availableUpdate && (
        <UpdateBanner update={availableUpdate} onDismiss={() => setAvailableUpdate(null)} />
      )}
      <header className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium tracking-tight">clobmap</h1>
          <FileMenu />
        </div>
        <div className="flex items-center gap-2">
          {!isTauri() && (
            <a
              href="https://github.com/clobrate/clobmap/releases/latest"
              target="_blank"
              rel="noreferrer"
              className="rounded border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:border-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              title="Install clobmap as a desktop app"
            >
              Install
            </a>
          )}
          <ViewToggle />
          <SettingsMenu />
        </div>
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
          <SplitPanes
            orientation={splitOrientation}
            ratio={splitRatio}
            onRatioChange={setSplitRatio}
            onRatioCommit={(r) => void saveSplitRatioPref(r)}
            first={<YamlEditor />}
            second={<MindMap />}
          />
        )}
      </div>
      <StatusBar />
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-resolved-theme={resolvedTheme}
      >
        {liveAnnouncement}
      </div>
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
