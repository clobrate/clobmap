import { isTauri } from "./env";
import type { SplitOrientation, ThemePreference } from "../store/ui";

const STORE_FILE = "clobmap.json";
const KEY_AUTO_SAVE = "auto-save";
const KEY_SPLIT_ORIENTATION = "split-orientation";
const KEY_SPLIT_RATIO = "split-ratio";
const KEY_THEME = "theme";
const KEY_FONT_SIZE = "font-size";
const KEY_TELEMETRY = "telemetry";
const WEB_KEY_AUTO_SAVE = "clobmap-auto-save";
const WEB_KEY_SPLIT_ORIENTATION = "clobmap-split-orientation";
const WEB_KEY_SPLIT_RATIO = "clobmap-split-ratio";
const WEB_KEY_THEME = "clobmap-theme";
const WEB_KEY_FONT_SIZE = "clobmap-font-size";
const WEB_KEY_TELEMETRY = "clobmap-telemetry";

export interface PersistedSettings {
  autoSave: boolean;
  splitOrientation: SplitOrientation;
  splitRatio: number;
  themePreference: ThemePreference;
  fontSize: number;
  telemetryEnabled: boolean;
}

const DEFAULTS: PersistedSettings = {
  autoSave: true,
  splitOrientation: "horizontal",
  splitRatio: 0.5,
  themePreference: "system",
  fontSize: 14,
  telemetryEnabled: false,
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
    const [autoSave, split, splitRatio, theme, font, telemetry] = await Promise.all([
      store.get<boolean>(KEY_AUTO_SAVE),
      store.get<unknown>(KEY_SPLIT_ORIENTATION),
      store.get<unknown>(KEY_SPLIT_RATIO),
      store.get<unknown>(KEY_THEME),
      store.get<unknown>(KEY_FONT_SIZE),
      store.get<boolean>(KEY_TELEMETRY),
    ]);
    return {
      autoSave: typeof autoSave === "boolean" ? autoSave : DEFAULTS.autoSave,
      splitOrientation: isSplitOrientation(split) ? split : DEFAULTS.splitOrientation,
      splitRatio: clampRatio(splitRatio),
      themePreference: isThemePreference(theme) ? theme : DEFAULTS.themePreference,
      fontSize: clampFont(font),
      telemetryEnabled: typeof telemetry === "boolean" ? telemetry : DEFAULTS.telemetryEnabled,
    };
  }
  const rawRatio = localStorage.getItem(WEB_KEY_SPLIT_RATIO);
  return {
    autoSave: (() => {
      const v = localStorage.getItem(WEB_KEY_AUTO_SAVE);
      return v === null ? DEFAULTS.autoSave : v === "true";
    })(),
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
    telemetryEnabled: localStorage.getItem(WEB_KEY_TELEMETRY) === "true",
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

/**
 * Last-open file path. Desktop only — on web there's no stable file path
 * across sessions (FSA handles aren't serializable). Used to auto-reopen on
 * cold launch when no argv path or unsaved draft is present.
 */
const KEY_LAST_FILE = "last-open-file";

export async function loadLastOpenFile(): Promise<string | null> {
  if (!isTauri()) return null;
  const { LazyStore } = await import("@tauri-apps/plugin-store");
  const store = new LazyStore(STORE_FILE);
  const path = await store.get<string>(KEY_LAST_FILE);
  return typeof path === "string" && path.length > 0 ? path : null;
}

export async function saveLastOpenFile(path: string | null): Promise<void> {
  if (!isTauri()) return;
  const { LazyStore } = await import("@tauri-apps/plugin-store");
  const store = new LazyStore(STORE_FILE);
  if (path) {
    await store.set(KEY_LAST_FILE, path);
  } else {
    await store.delete(KEY_LAST_FILE);
  }
  await store.save();
}

export async function saveTelemetryPref(value: boolean): Promise<void> {
  if (isTauri()) {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore(STORE_FILE);
    await store.set(KEY_TELEMETRY, value);
    await store.save();
    return;
  }
  localStorage.setItem(WEB_KEY_TELEMETRY, String(value));
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
