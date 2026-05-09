import { useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useDocumentStore } from "../store/document";
import {
  newFile,
  newTab,
  openFile as openFileAction,
  openRecent,
  saveFile,
  saveFileAs,
} from "../lib/fileActions";
import {
  exportAllNotes,
  exportPdf,
  exportPng,
  exportSvg,
} from "../lib/exportActions";
import { isMobile } from "../lib/env";
import { getRecentFiles } from "../lib/recentFiles";
import { useUIStore } from "../store/ui";

const cmdKey = typeof navigator !== "undefined" && /mac/i.test(navigator.platform) ? "⌘" : "Ctrl";

export function FileMenu() {
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const currentFilePath = useDocumentStore((s) => s.currentFilePath);
  const reactFlow = useReactFlow();
  const viewMode = useUIStore((s) => s.viewMode);

  // Image/PDF capture only works when the canvas is rendered. In YAML-only
  // view there's no .react-flow__viewport in the DOM.
  const canExportImage = viewMode !== "yaml";

  const handleExport = async (
    fn: (rf: typeof reactFlow) => Promise<void>,
  ): Promise<void> => {
    setOpen(false);
    try {
      await fn(reactFlow);
    } catch (err) {
      console.error("export failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      // Cheap surfacing — the alert is loud but it's the simplest way to
      // tell the user "switch to mind-map view" from a menu action.
      window.alert(`Export failed: ${msg}`);
    }
  };

  const handleExportAllNotes = async (): Promise<void> => {
    setOpen(false);
    try {
      await exportAllNotes();
    } catch (err) {
      console.error("export failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`Export failed: ${msg}`);
    }
  };

  useEffect(() => {
    if (!open) return;
    getRecentFiles()
      .then(setRecents)
      .catch(() => setRecents([]));
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open, currentFilePath]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
      >
        File
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 z-50 mt-1 min-w-[260px] rounded-md border border-neutral-200 bg-white py-1 text-sm text-neutral-900 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        >
          <Item
            label="New"
            shortcut={`${cmdKey}+N`}
            onClick={() => {
              setOpen(false);
              void newFile();
            }}
          />
          {!isMobile() && (
            <Item
              label="New tab"
              shortcut={`${cmdKey}+T`}
              onClick={() => {
                setOpen(false);
                void newTab();
              }}
            />
          )}
          <Item
            label="Open…"
            shortcut={`${cmdKey}+O`}
            onClick={() => {
              setOpen(false);
              void openFileAction();
            }}
          />
          <Item
            label="Save"
            shortcut={`${cmdKey}+S`}
            onClick={() => {
              setOpen(false);
              void saveFile();
            }}
          />
          <Item
            label="Save As…"
            shortcut={`${cmdKey}+⇧+S`}
            onClick={() => {
              setOpen(false);
              void saveFileAs();
            }}
          />
          <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />
          <div className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wider text-neutral-500">
            Export
          </div>
          <Item
            label="PNG (image)"
            disabled={!canExportImage}
            title={canExportImage ? undefined : "Switch to Mind-map or Split view first"}
            onClick={() => void handleExport(exportPng)}
          />
          <Item
            label="SVG (vector)"
            disabled={!canExportImage}
            title={canExportImage ? undefined : "Switch to Mind-map or Split view first"}
            onClick={() => void handleExport(exportSvg)}
          />
          <Item
            label="PDF"
            disabled={!canExportImage}
            title={canExportImage ? undefined : "Switch to Mind-map or Split view first"}
            onClick={() => void handleExport(exportPdf)}
          />
          <Item
            label="All notes (Markdown)"
            title="Export every node's long-form notes into a single Markdown file"
            onClick={() => void handleExportAllNotes()}
          />
          {recents.length > 0 && (
            <>
              <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />
              <div className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wider text-neutral-500">
                Recent
              </div>
              {recents.map((path) => (
                <Item
                  key={path}
                  label={shortenPath(path)}
                  title={path}
                  onClick={() => {
                    setOpen(false);
                    void openRecent(path);
                  }}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Item({
  label,
  shortcut,
  onClick,
  title,
  disabled,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={
        "flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left " +
        (disabled
          ? "cursor-not-allowed text-neutral-400 dark:text-neutral-600"
          : "hover:bg-neutral-100 dark:hover:bg-neutral-800")
      }
    >
      <span className="truncate">{label}</span>
      {shortcut && <span className="text-xs text-neutral-500">{shortcut}</span>}
    </button>
  );
}

function shortenPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return `…/${parts.slice(-2).join("/")}`;
}
