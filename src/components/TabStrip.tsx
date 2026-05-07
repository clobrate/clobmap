import { useTabsStore, type Tab } from "../store/tabs";
import { useDocumentStore } from "../store/document";
import { closeTabAction } from "../lib/fileActions";

function basename(path: string | null | undefined): string {
  if (!path) return "Untitled";
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const name = idx >= 0 ? path.slice(idx + 1) : path;
  return name || "Untitled";
}

export function TabStrip() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const switchTo = useTabsStore((s) => s.switchTo);

  // Live values for the active tab's title + dirty state — these change
  // faster than the per-tab snapshot, which only updates on switch.
  const activePath = useDocumentStore((s) => s.currentFilePath);
  const activeDirty = useDocumentStore((s) => s.isDirty);

  // Hide the strip entirely when there's only one tab — keeps the header
  // clean for the typical "single-doc editing" case.
  if (tabs.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label="Open documents"
      className="flex shrink-0 items-stretch gap-px overflow-x-auto border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const path = isActive ? activePath : tab.snapshot.currentFilePath;
        const dirty = isActive ? activeDirty : tab.snapshot.isDirty;
        return (
          <TabItem
            key={tab.id}
            tab={tab}
            label={basename(path)}
            dirty={dirty}
            isActive={isActive}
            onActivate={() => switchTo(tab.id)}
          />
        );
      })}
    </div>
  );
}

function TabItem({
  tab,
  label,
  dirty,
  isActive,
  onActivate,
}: {
  tab: Tab;
  label: string;
  dirty: boolean;
  isActive: boolean;
  onActivate: () => void;
}) {
  return (
    <div
      role="tab"
      aria-selected={isActive}
      className={
        "group flex min-w-[120px] max-w-[220px] items-center gap-1.5 px-3 py-1.5 text-xs " +
        (isActive
          ? "bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100")
      }
    >
      <button
        type="button"
        onClick={onActivate}
        className="flex flex-1 items-center gap-1.5 truncate text-left"
        title={label}
      >
        {dirty && (
          <span className="text-emerald-500" aria-label="unsaved changes">
            ●
          </span>
        )}
        <span className="truncate">{label}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void closeTabAction(tab.id);
        }}
        aria-label={`Close ${label}`}
        className="rounded px-1 text-neutral-400 opacity-0 hover:bg-neutral-200 hover:text-neutral-700 group-hover:opacity-100 aria-selected:opacity-100 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
        // Force visible on the active tab via aria-selected on parent.
        aria-selected={isActive}
      >
        ×
      </button>
    </div>
  );
}
