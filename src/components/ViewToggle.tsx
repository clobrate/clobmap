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
    <div className="flex items-center gap-0.5 rounded-md bg-neutral-800 p-0.5 text-xs">
      {tabs.map(({ value, label }) => {
        const active = viewMode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setViewMode(value)}
            className={
              active
                ? "rounded bg-neutral-700 px-2.5 py-1 text-neutral-50"
                : "rounded px-2.5 py-1 text-neutral-400 hover:text-neutral-200"
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
