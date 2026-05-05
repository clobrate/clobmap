import { isTauri } from "./env";
import type { SplitOrientation } from "../store/ui";

const STORE_FILE = "clobmap.json";
const KEY_AUTO_SAVE = "auto-save";
const KEY_SPLIT_ORIENTATION = "split-orientation";
const WEB_KEY_AUTO_SAVE = "clobmap-auto-save";
const WEB_KEY_SPLIT_ORIENTATION = "clobmap-split-orientation";

export interface PersistedSettings {
  autoSave: boolean;
  splitOrientation: SplitOrientation;
}

const DEFAULTS: PersistedSettings = { autoSave: false, splitOrientation: "horizontal" };

export async function loadSettings(): Promise<PersistedSettings> {
  if (isTauri()) {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore(STORE_FILE);
    const [autoSave, splitOrientation] = await Promise.all([
      store.get<boolean>(KEY_AUTO_SAVE),
      store.get<SplitOrientation>(KEY_SPLIT_ORIENTATION),
    ]);
    return {
      autoSave: typeof autoSave === "boolean" ? autoSave : DEFAULTS.autoSave,
      splitOrientation: splitOrientation === "vertical" ? "vertical" : "horizontal",
    };
  }
  return {
    autoSave: localStorage.getItem(WEB_KEY_AUTO_SAVE) === "true",
    splitOrientation:
      localStorage.getItem(WEB_KEY_SPLIT_ORIENTATION) === "vertical" ? "vertical" : "horizontal",
  };
}

export async function saveAutoSavePref(value: boolean): Promise<void> {
  if (isTauri()) {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore(STORE_FILE);
    await store.set(KEY_AUTO_SAVE, value);
    await store.save();
    return;
  }
  localStorage.setItem(WEB_KEY_AUTO_SAVE, String(value));
}

export async function saveSplitOrientationPref(value: SplitOrientation): Promise<void> {
  if (isTauri()) {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore(STORE_FILE);
    await store.set(KEY_SPLIT_ORIENTATION, value);
    await store.save();
    return;
  }
  localStorage.setItem(WEB_KEY_SPLIT_ORIENTATION, value);
}
