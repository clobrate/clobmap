import { isTauri } from "./env";

const LAST_CHECK_KEY = "clobmap-last-update-check";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

export interface AvailableUpdate {
  version: string;
  date?: string;
  body?: string;
  install: () => Promise<void>;
}

export interface UpdateProgress {
  state: "started" | "downloading" | "finished";
  downloaded?: number;
  total?: number;
}

function recordCheckTime(): void {
  try {
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function lastCheckTime(): number {
  try {
    const v = Number(localStorage.getItem(LAST_CHECK_KEY));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/**
 * Whether enough time has passed since the last automatic check (24h gate).
 */
export function shouldRunScheduledCheck(): boolean {
  return Date.now() - lastCheckTime() >= CHECK_INTERVAL_MS;
}

/**
 * Resets the schedule so the next call to shouldRunScheduledCheck returns true.
 * Used for the manual "Check for updates" action.
 */
export function clearLastCheckTime(): void {
  try {
    localStorage.removeItem(LAST_CHECK_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Attempts to check for an update. Returns null if no update is available, the
 * runtime is the web (not Tauri), or the check fails (offline, no endpoint
 * configured yet, etc.). Failures are intentionally swallowed — an update
 * checker should never block startup or surface errors that aren't actionable.
 */
export async function checkForUpdate(
  options: { onProgress?: (p: UpdateProgress) => void } = {},
): Promise<AvailableUpdate | null> {
  if (!isTauri()) return null;

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    recordCheckTime();
    if (!update) return null;

    return {
      version: update.version,
      date: update.date,
      body: update.body,
      install: async () => {
        await update.downloadAndInstall((event) => {
          if (!options.onProgress) return;
          if (event.event === "Started") {
            options.onProgress({
              state: "started",
              total: event.data.contentLength,
            });
          } else if (event.event === "Progress") {
            options.onProgress({
              state: "downloading",
              downloaded: event.data.chunkLength,
            });
          } else if (event.event === "Finished") {
            options.onProgress({ state: "finished" });
          }
        });
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      },
    };
  } catch (err) {
    // Network errors, signature mismatches, missing endpoint — log and move on.
    console.warn("update check failed", err);
    return null;
  }
}
