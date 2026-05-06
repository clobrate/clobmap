import { useUIStore, type ViewMode } from "../store/ui";

const tabs: ReadonlyArray<{ value: ViewMode; label: string }> = [
  { value: "yaml", label: "YAML" },
  { value: "split", label: "Split" },
  { value: "mindmap", label: "Mind-map" },
];

export function ViewToggle() {
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);

  return (
    <div
      role="tablist"
      aria-label="View mode"
      className="flex items-center gap-0.5 rounded-md bg-neutral-200 p-0.5 text-xs dark:bg-neutral-800"
    >
      {tabs.map(({ value, label }) => {
        const active = viewMode === value;
        // Split view is desktop-only — too cramped on phone screens.
        const mobileHidden = value === "split" ? "hidden sm:inline-flex" : "";
        return (
          <button
            key={value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => setViewMode(value)}
            className={
              (active
                ? "rounded bg-white px-2.5 py-1 text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-50"
                : "rounded px-2.5 py-1 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200") +
              (mobileHidden ? ` ${mobileHidden}` : "")
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
