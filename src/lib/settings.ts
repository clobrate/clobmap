import { LazyStore } from "@tauri-apps/plugin-store";
import type { SplitOrientation } from "../store/ui";

const STORE_FILE = "clobmap.json";
const KEY_AUTO_SAVE = "auto-save";
const KEY_SPLIT_ORIENTATION = "split-orientation";

const store = new LazyStore(STORE_FILE);

export interface PersistedSettings {
  autoSave: boolean;
  splitOrientation: SplitOrientation;
}

export async function loadSettings(): Promise<PersistedSettings> {
  const [autoSave, splitOrientation] = await Promise.all([
    store.get<boolean>(KEY_AUTO_SAVE),
    store.get<SplitOrientation>(KEY_SPLIT_ORIENTATION),
  ]);
  return {
    autoSave: typeof autoSave === "boolean" ? autoSave : false,
    splitOrientation: splitOrientation === "vertical" ? "vertical" : "horizontal",
  };
}

export async function saveAutoSavePref(value: boolean): Promise<void> {
  await store.set(KEY_AUTO_SAVE, value);
  await store.save();
}

export async function saveSplitOrientationPref(value: SplitOrientation): Promise<void> {
  await store.set(KEY_SPLIT_ORIENTATION, value);
  await store.save();
}
