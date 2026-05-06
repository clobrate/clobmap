/**
 * Two surfaces:
 *   • `getPendingOpenPath()` — synchronous-feeling read of any argv path
 *     (the user double-clicked a .clobmap.yaml file at cold launch). Used by
 *     the App's bootstrap to decide whether argv beats draft / last-file.
 *   • `listenForOpenFiles()` — runtime listener for "clobmap://open-files"
 *     events from the single-instance plugin (Linux/Windows) and macOS
 *     RunEvent::Opened. Returns the unlisten handle.
 *
 * The web build is a no-op for both.
 */
import { isTauri } from "./env";
import { openFromPath } from "./fileActions";

function isFileLikePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("--");
}

function normalizeFileUrl(value: string): string {
  if (value.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(value).pathname);
    } catch {
      return value;
    }
  }
  return value;
}

export async function getPendingOpenPath(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const initial = await invoke<string | null>("pending_open_path");
    if (typeof initial === "string" && initial.length > 0) {
      return normalizeFileUrl(initial);
    }
  } catch {
    /* non-fatal */
  }
  return null;
}

export async function listenForOpenFiles(): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<unknown>("clobmap://open-files", (event) => {
    const payload = event.payload;
    const paths: string[] = Array.isArray(payload)
      ? payload.filter(isFileLikePath).map(normalizeFileUrl)
      : isFileLikePath(payload)
        ? [normalizeFileUrl(payload)]
        : [];
    if (paths.length === 0) return;
    void openFromPath(paths[0]!);
  });
  return unlisten;
}
