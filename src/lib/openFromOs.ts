/**
 * Wires the OS-driven "open file" path:
 *   • On launch, asks Rust for any argv path (user double-clicked a file).
 *   • While running, listens for "clobmap://open-files" events. These fire
 *     from the single-instance plugin (Linux/Windows) and from
 *     RunEvent::Opened (macOS) when Finder asks the running app to open
 *     one or more files.
 *
 * The web build skips both.
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

export async function bootstrapOpenFromOs(): Promise<() => void> {
  if (!isTauri()) return () => {};

  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");

  // 1. Initial argv (cold launch with file path).
  try {
    const initial = await invoke<string | null>("pending_open_path");
    if (typeof initial === "string" && initial.length > 0) {
      await openFromPath(normalizeFileUrl(initial));
    }
  } catch {
    /* non-fatal */
  }

  // 2. Forwarded files from the OS (warm launch / single-instance forward).
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
