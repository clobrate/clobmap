import { useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useUIStore, type ThemePreference } from "../store/ui";
import { useDocumentStore } from "../store/document";
import {
  saveAutoSavePref,
  saveFontSizePref,
  saveNoteStoragePref,
  saveNotesFolderPref,
  saveSplitOrientationPref,
  saveTelemetryPref,
  saveThemePref,
} from "../lib/settings";
import { validateNotesFolder } from "../lib/notesFolder";
import { tidyNotes } from "../lib/fileActions";
import { isMobile, isTauri } from "../lib/env";
import { checkForUpdate, clearLastCheckTime } from "../lib/updater";
import { openExternal } from "../lib/openExternal";
import { isTelemetryAvailable } from "../lib/telemetry";
import { clearAllPositions, setLayoutMode, type LayoutMode } from "../model";
import { materializeManualPositions } from "../lib/layout";

const PRIVACY_URL = "https://github.com/clobrate/clobmap/blob/main/PRIVACY.md";
const ISSUE_URL = "https://github.com/clobrate/clobmap/issues/new?labels=bug";

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const autoSave = useUIStore((s) => s.autoSave);
  const setAutoSave = useUIStore((s) => s.setAutoSave);
  const splitOrientation = useUIStore((s) => s.splitOrientation);
  const setSplitOrientation = useUIStore((s) => s.setSplitOrientation);
  const themePreference = useUIStore((s) => s.themePreference);
  const setThemePreference = useUIStore((s) => s.setThemePreference);
  const fontSize = useUIStore((s) => s.fontSize);
  const setFontSize = useUIStore((s) => s.setFontSize);
  const telemetryEnabled = useUIStore((s) => s.telemetryEnabled);
  const setTelemetryEnabled = useUIStore((s) => s.setTelemetryEnabled);
  const telemetryAvailable = isTelemetryAvailable();
  const setAvailableUpdate = useUIStore((s) => s.setAvailableUpdate);

  const noteStorage = useUIStore((s) => s.noteStorage);
  const setNoteStorage = useUIStore((s) => s.setNoteStorage);
  const notesFolder = useUIStore((s) => s.notesFolder);
  const setNotesFolder = useUIStore((s) => s.setNotesFolder);
  const [folderDraft, setFolderDraft] = useState(notesFolder);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [tidyStatus, setTidyStatus] = useState<string | null>(null);

  const commitFolder = () => {
    const result = validateNotesFolder(folderDraft);
    if (!result.ok) {
      setFolderError(result.error);
      return;
    }
    setFolderError(null);
    setFolderDraft(result.value);
    setNotesFolder(result.value);
    void saveNotesFolderPref(result.value);
  };

  const onTidy = async () => {
    setTidyStatus("Tidying…");
    const removed = await tidyNotes();
    setTidyStatus(removed > 0 ? `Removed ${removed} file${removed === 1 ? "" : "s"}` : "Nothing to tidy");
    setTimeout(() => setTidyStatus(null), 3000);
  };

  // Per-document layout mode (auto vs manual). Stored in YAML so it
  // survives across launches and travels with the file.
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);
  const layoutMode: LayoutMode = parsedDoc?.layoutMode ?? "auto";
  const reactFlow = useReactFlow();

  const onLayoutMode = (next: LayoutMode) => {
    if (!parsedDoc || layoutMode === next) return;
    if (next === "manual") {
      // Snapshot the *currently rendered* positions so the visual
      // doesn't jump on toggle. React Flow's node positions reflect the
      // measurement-driven layout (tight gaps); materializing without
      // them would re-run the layout with cap-sized slots and produce
      // a much wider canvas.
      const overrides = new Map<string, { x: number; y: number }>();
      for (const n of reactFlow.getNodes()) {
        overrides.set(n.id, { x: n.position.x, y: n.position.y });
      }
      applyTreeChange(setLayoutMode(materializeManualPositions(parsedDoc, overrides), "manual"));
    } else {
      // Stored positions remain in YAML so a later switch back to
      // manual restores the user's previous arrangement.
      applyTreeChange(setLayoutMode(parsedDoc, "auto"));
    }
  };

  // Wipe every saved position AND switch to auto. The whole point is
  // a fresh start — no memory of previously-stored manual coords —
  // so toggling back to manual later goes through the standard
  // materialize-from-auto path instead of resurrecting old coords.
  const onResetToAuto = () => {
    if (!parsedDoc) return;
    const cleared = clearAllPositions(parsedDoc);
    applyTreeChange(setLayoutMode(cleared, "auto"));
    setOpen(false);
  };

  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "none">("idle");

  const onCheckForUpdates = async () => {
    setUpdateStatus("checking");
    clearLastCheckTime();
    const update = await checkForUpdate();
    if (update) {
      setAvailableUpdate({
        version: update.version,
        date: update.date,
        body: update.body,
        install: update.install,
      });
      setUpdateStatus("idle");
      setOpen(false);
    } else {
      setUpdateStatus("none");
      setTimeout(() => setUpdateStatus("idle"), 3000);
    }
  };

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
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Settings"
        onClick={() => setOpen((o) => !o)}
        title="Settings"
        className="rounded px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
      >
        ⚙
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[280px] rounded-md border border-neutral-200 bg-white py-1 text-sm text-neutral-900 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        >
          {!isMobile() && (
            <>
              <Toggle
                label="Auto-save"
                sub="Save on the fly when YAML is valid"
                checked={autoSave}
                onChange={(v) => {
                  setAutoSave(v);
                  void saveAutoSavePref(v);
                }}
              />
              <Divider />
            </>
          )}
          {parsedDoc && (
            <>
              <div className="px-3 py-1.5">
                <div className="text-neutral-600 dark:text-neutral-400">
                  Layout
                  <span className="ml-1 text-[10px] uppercase tracking-wider text-neutral-500">
                    this document
                  </span>
                </div>
                <div className="mt-1 flex gap-1">
                  <SegButton
                    active={layoutMode === "auto"}
                    onClick={() => onLayoutMode("auto")}
                    label="Auto"
                  />
                  <SegButton
                    active={layoutMode === "manual"}
                    onClick={() => onLayoutMode("manual")}
                    label="Manual"
                  />
                </div>
                <button
                  type="button"
                  onClick={onResetToAuto}
                  className="mt-2 w-full rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  title="Wipe every saved position and switch to Auto. No memory of previous manual coordinates is kept."
                >
                  Reset to Auto (clear saved positions)
                </button>
              </div>
              <Divider />
            </>
          )}
          <div className="px-3 py-1.5">
            <div className="text-neutral-600 dark:text-neutral-400">Theme</div>
            <div className="mt-1 flex gap-1">
              {THEMES.map((t) => (
                <SegButton
                  key={t.value}
                  active={themePreference === t.value}
                  onClick={() => {
                    setThemePreference(t.value);
                    void saveThemePref(t.value);
                  }}
                  label={t.label}
                />
              ))}
            </div>
          </div>
          <div className="px-3 py-1.5">
            <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
              <span>Font size</span>
              <span className="tabular-nums text-xs">{fontSize}px</span>
            </div>
            <input
              type="range"
              min={10}
              max={24}
              value={fontSize}
              onChange={(e) => {
                const next = Number(e.target.value);
                setFontSize(next);
                void saveFontSizePref(next);
              }}
              className="mt-1 w-full accent-emerald-500"
              aria-label="Font size"
            />
          </div>
          <Divider />
          <div className="px-3 py-1.5">
            <div className="text-neutral-600 dark:text-neutral-400">Split orientation</div>
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
          {isTauri() && !isMobile() && (
            <>
              <Divider />
              <div className="px-3 py-1.5">
                <div className="text-neutral-600 dark:text-neutral-400">Note storage</div>
                <div className="mt-1 flex gap-1">
                  <SegButton
                    active={noteStorage === "inline"}
                    onClick={() => {
                      setNoteStorage("inline");
                      void saveNoteStoragePref("inline");
                    }}
                    label="Inline"
                  />
                  <SegButton
                    active={noteStorage === "folder"}
                    onClick={() => {
                      setNoteStorage("folder");
                      void saveNoteStoragePref("folder");
                    }}
                    label="Notes folder"
                  />
                </div>
                {noteStorage === "folder" && (
                  <>
                    <label
                      htmlFor="notes-folder-input"
                      className="mt-2 block text-xs text-neutral-500"
                    >
                      Folder (relative to the document)
                    </label>
                    <input
                      id="notes-folder-input"
                      type="text"
                      value={folderDraft}
                      onChange={(e) => setFolderDraft(e.target.value)}
                      onBlur={commitFolder}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitFolder();
                      }}
                      aria-label="Notes folder name"
                      className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                    {folderError && (
                      <div className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                        {folderError}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => void onTidy()}
                      className="mt-2 w-full rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      title="Remove archived (deleted) and orphaned note files from the folder."
                    >
                      Tidy notes folder
                    </button>
                    {tidyStatus && (
                      <div className="mt-0.5 text-xs text-neutral-500">{tidyStatus}</div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
          {isTauri() && (
            <>
              <Divider />
              <button
                type="button"
                role="menuitem"
                onClick={() => void onCheckForUpdates()}
                disabled={updateStatus === "checking"}
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
              >
                <span>Check for updates</span>
                <span className="text-xs text-neutral-500">
                  {updateStatus === "checking"
                    ? "Checking…"
                    : updateStatus === "none"
                      ? "Up to date"
                      : ""}
                </span>
              </button>
            </>
          )}
          {telemetryAvailable && (
            <>
              <Divider />
              <Toggle
                label="Send crash reports"
                sub="Anonymous; only fires on real errors. Never sends document contents."
                checked={telemetryEnabled}
                onChange={(v) => {
                  setTelemetryEnabled(v);
                  void saveTelemetryPref(v);
                }}
              />
            </>
          )}
          <Divider />
          <ExternalItem
            label="Privacy"
            onClick={() => {
              setOpen(false);
              void openExternal(PRIVACY_URL);
            }}
          />
          <ExternalItem
            label="Report an issue"
            onClick={() => {
              setOpen(false);
              void openExternal(ISSUE_URL);
            }}
          />
          {isTauri() && (
            <ActionItem
              label="Open log folder"
              onClick={async () => {
                setOpen(false);
                const { invoke } = await import("@tauri-apps/api/core");
                await invoke("open_log_folder");
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />;
}

function ExternalItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
    >
      <span>{label}</span>
      <span className="text-xs text-neutral-500">↗</span>
    </button>
  );
}

function ActionItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
    >
      <span>{label}</span>
    </button>
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
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-3 px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
    >
      <span>
        <span className="block">{label}</span>
        {sub && <span className="block text-xs text-neutral-500">{sub}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`mt-1 inline-flex h-4 w-7 items-center rounded-full border ${
          checked
            ? "border-emerald-500 bg-emerald-500/40"
            : "border-neutral-400 bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-800"
        }`}
      >
        <span
          className={`h-3 w-3 rounded-full bg-white transition-transform dark:bg-neutral-100 ${
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
      aria-pressed={active}
      className={
        active
          ? "flex-1 rounded bg-neutral-200 px-2 py-1 text-xs text-neutral-900 dark:bg-neutral-700 dark:text-neutral-50"
          : "flex-1 rounded bg-neutral-100/60 px-2 py-1 text-xs text-neutral-600 hover:text-neutral-900 dark:bg-neutral-800/60 dark:text-neutral-400 dark:hover:text-neutral-100"
      }
    >
      {label}
    </button>
  );
}
