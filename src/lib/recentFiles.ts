import { LazyStore } from "@tauri-apps/plugin-store";

const STORE_FILE = "clobmap.json";
const RECENT_KEY = "recent-files";
const MAX_RECENT = 10;

const store = new LazyStore(STORE_FILE);

export async function getRecentFiles(): Promise<string[]> {
  const raw = (await store.get<string[]>(RECENT_KEY)) ?? [];
  return raw.filter((p) => typeof p === "string");
}

export async function addRecentFile(path: string): Promise<void> {
  const current = await getRecentFiles();
  const next = [path, ...current.filter((p) => p !== path)].slice(0, MAX_RECENT);
  await store.set(RECENT_KEY, next);
  await store.save();
}

export async function removeRecentFile(path: string): Promise<void> {
  const current = await getRecentFiles();
  const next = current.filter((p) => p !== path);
  await store.set(RECENT_KEY, next);
  await store.save();
}
