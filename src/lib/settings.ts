import { isTauri } from "./env";
import type { SplitOrientation, ThemePreference } from "../store/ui";

const STORE_FILE = "clobmap.json";
const KEY_AUTO_SAVE = "auto-save";
const KEY_SPLIT_ORIENTATION = "split-orientation";
const KEY_SPLIT_RATIO = "split-ratio";
const KEY_THEME = "theme";
const KEY_FONT_SIZE = "font-size";
const WEB_KEY_AUTO_SAVE = "clobmap-auto-save";
const WEB_KEY_SPLIT_ORIENTATION = "clobmap-split-orientation";
const WEB_KEY_SPLIT_RATIO = "clobmap-split-ratio";
const WEB_KEY_THEME = "clobmap-theme";
const WEB_KEY_FONT_SIZE = "clobmap-font-size";

export interface PersistedSettings {
  autoSave: boolean;
  splitOrientation: SplitOrientation;
  splitRatio: number;
  themePreference: ThemePreference;
  fontSize: number;
}

const DEFAULTS: PersistedSettings = {
  autoSave: false,
  splitOrientation: "horizontal",
  splitRatio: 0.5,
  themePreference: "system",
  fontSize: 14,
};

function clampRatio(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULTS.splitRatio;
  return Math.max(0.2, Math.min(0.8, n));
}

function isSplitOrientation(v: unknown): v is SplitOrientation {
  return v === "horizontal" || v === "vertical";
}

function isThemePreference(v: unknown): v is ThemePreference {
  return v === "system" || v === "light" || v === "dark";
}

function clampFont(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULTS.fontSize;
  return Math.max(10, Math.min(24, Math.round(n)));
}

export async function loadSettings(): Promise<PersistedSettings> {
  if (isTauri()) {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore(STORE_FILE);
    const [autoSave, split, splitRatio, theme, font] = await Promise.all([
      store.get<boolean>(KEY_AUTO_SAVE),
      store.get<unknown>(KEY_SPLIT_ORIENTATION),
      store.get<unknown>(KEY_SPLIT_RATIO),
      store.get<unknown>(KEY_THEME),
      store.get<unknown>(KEY_FONT_SIZE),
    ]);
    return {
      autoSave: typeof autoSave === "boolean" ? autoSave : DEFAULTS.autoSave,
      splitOrientation: isSplitOrientation(split) ? split : DEFAULTS.splitOrientation,
      splitRatio: clampRatio(splitRatio),
      themePreference: isThemePreference(theme) ? theme : DEFAULTS.themePreference,
      fontSize: clampFont(font),
    };
  }
  const rawRatio = localStorage.getItem(WEB_KEY_SPLIT_RATIO);
  return {
    autoSave: localStorage.getItem(WEB_KEY_AUTO_SAVE) === "true",
    splitOrientation: (() => {
      const v = localStorage.getItem(WEB_KEY_SPLIT_ORIENTATION);
      return isSplitOrientation(v) ? v : DEFAULTS.splitOrientation;
    })(),
    splitRatio: clampRatio(rawRatio === null ? null : Number(rawRatio)),
    themePreference: (() => {
      const v = localStorage.getItem(WEB_KEY_THEME);
      return isThemePreference(v) ? v : DEFAULTS.themePreference;
    })(),
    fontSize: clampFont(Number(localStorage.getItem(WEB_KEY_FONT_SIZE))),
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

export async function saveThemePref(value: ThemePreference): Promise<void> {
  if (isTauri()) {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore(STORE_FILE);
    await store.set(KEY_THEME, value);
    await store.save();
    return;
  }
  localStorage.setItem(WEB_KEY_THEME, value);
}

export async function saveSplitRatioPref(value: number): Promise<void> {
  const clamped = clampRatio(value);
  if (isTauri()) {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore(STORE_FILE);
    await store.set(KEY_SPLIT_RATIO, clamped);
    await store.save();
    return;
  }
  localStorage.setItem(WEB_KEY_SPLIT_RATIO, String(clamped));
}

export async function saveFontSizePref(value: number): Promise<void> {
  const clamped = clampFont(value);
  if (isTauri()) {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore(STORE_FILE);
    await store.set(KEY_FONT_SIZE, clamped);
    await store.save();
    return;
  }
  localStorage.setItem(WEB_KEY_FONT_SIZE, String(clamped));
}
