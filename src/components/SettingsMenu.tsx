import { useEffect, useRef, useState } from "react";
import { useUIStore } from "../store/ui";
import { saveAutoSavePref, saveSplitOrientationPref } from "../lib/settings";

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const autoSave = useUIStore((s) => s.autoSave);
  const setAutoSave = useUIStore((s) => s.setAutoSave);
  const splitOrientation = useUIStore((s) => s.splitOrientation);
  const setSplitOrientation = useUIStore((s) => s.setSplitOrientation);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Settings"
        className="rounded px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
      >
        ⚙
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[260px] rounded-md border border-neutral-700 bg-neutral-900 py-1 text-sm text-neutral-100 shadow-lg">
          <Toggle
            label="Auto-save"
            sub="Save on the fly when YAML is valid"
            checked={autoSave}
            onChange={(v) => {
              setAutoSave(v);
              void saveAutoSavePref(v);
            }}
          />
          <div className="my-1 border-t border-neutral-800" />
          <div className="px-3 py-1.5">
            <div className="text-neutral-400">Split orientation</div>
            <div className="mt-1 flex gap-1">
              <SegButton
                active={splitOrientation === "horizontal"}
                onClick={() => {
                  setSplitOrientation("horizontal");
                  void saveSplitOrientationPref("horizontal");
                }}
                label="Side-by-side"
              />
              <SegButton
                active={splitOrientation === "vertical"}
                onClick={() => {
                  setSplitOrientation("vertical");
                  void saveSplitOrientationPref("vertical");
                }}
                label="Stacked"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-3 px-3 py-1.5 text-left hover:bg-neutral-800"
    >
      <span>
        <span className="block">{label}</span>
        {sub && <span className="block text-xs text-neutral-500">{sub}</span>}
      </span>
      <span
        className={`mt-1 inline-flex h-4 w-7 items-center rounded-full border ${
          checked ? "border-emerald-400 bg-emerald-500/40" : "border-neutral-600 bg-neutral-800"
        }`}
      >
        <span
          className={`h-3 w-3 rounded-full bg-neutral-100 transition-transform ${
            checked ? "translate-x-3" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function SegButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex-1 rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-50"
          : "flex-1 rounded bg-neutral-800/60 px-2 py-1 text-xs text-neutral-400 hover:text-neutral-100"
      }
    >
      {label}
    </button>
  );
}
