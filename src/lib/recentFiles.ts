import { isTauri } from "./env";

const STORE_FILE = "clobmap.json";
const RECENT_KEY = "recent-files";
const WEB_KEY = "clobmap-recent-files";
const MAX_RECENT = 10;

export async function getRecentFiles(): Promise<string[]> {
  if (isTauri()) {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore(STORE_FILE);
    const raw = (await store.get<string[]>(RECENT_KEY)) ?? [];
    return raw.filter((p) => typeof p === "string");
  }
  try {
    const raw = JSON.parse(localStorage.getItem(WEB_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

export async function addRecentFile(path: string): Promise<void> {
  const current = await getRecentFiles();
  const next = [path, ...current.filter((p) => p !== path)].slice(0, MAX_RECENT);
  if (isTauri()) {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore(STORE_FILE);
    await store.set(RECENT_KEY, next);
    await store.save();
    return;
  }
  localStorage.setItem(WEB_KEY, JSON.stringify(next));
}

export async function removeRecentFile(path: string): Promise<void> {
  const current = await getRecentFiles();
  const next = current.filter((p) => p !== path);
  if (isTauri()) {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore(STORE_FILE);
    await store.set(RECENT_KEY, next);
    await store.save();
    return;
  }
  localStorage.setItem(WEB_KEY, JSON.stringify(next));
}
