import { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "../store/document";
import { openFile as openFileAction, openRecent, saveFile, saveFileAs } from "../lib/fileActions";
import { getRecentFiles } from "../lib/recentFiles";

const cmdKey = typeof navigator !== "undefined" && /mac/i.test(navigator.platform) ? "⌘" : "Ctrl";

export function FileMenu() {
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const currentFilePath = useDocumentStore((s) => s.currentFilePath);

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
        onClick={() => setOpen((o) => !o)}
        className="rounded px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
      >
        File
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 min-w-[260px] rounded-md border border-neutral-700 bg-neutral-900 py-1 text-sm text-neutral-100 shadow-lg">
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
          {recents.length > 0 && (
            <>
              <div className="my-1 border-t border-neutral-800" />
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
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left hover:bg-neutral-800"
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
