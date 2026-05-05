import { isTauri } from "../env";
import { tauriStorage } from "./tauri";
import { webStorage } from "./web";
import type { StorageAdapter } from "./types";

export type { OpenedFile, StorageAdapter } from "./types";

export const storage: StorageAdapter = isTauri() ? tauriStorage : webStorage;

// Re-export both for tests / explicit selection if needed.
export { tauriStorage, webStorage };
