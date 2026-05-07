import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, watch, writeTextFile } from "@tauri-apps/plugin-fs";
import { isMobile } from "../env";
import type { OpenedFile, StorageAdapter } from "./types";

const FILTERS = [
  { name: "Clobmap mind map", extensions: ["clobmap.yaml"] },
  { name: "YAML files", extensions: ["yaml", "yml"] },
];

export const tauriStorage: StorageAdapter = {
  async open(): Promise<OpenedFile | null> {
    const picked = await openDialog({ multiple: false, filters: FILTERS });
    if (typeof picked !== "string") return null;
    const contents = await readTextFile(picked);
    return { path: picked, contents };
  },

  async read(path: string): Promise<string> {
    return readTextFile(path);
  },

  async save(path: string, contents: string): Promise<void> {
    await writeTextFile(path, contents);
  },

  async pickSavePath(suggested?: string): Promise<string | null> {
    // iOS's UIDocumentPicker mishandles multi-segment extensions like
    // "clobmap.yaml" and ends up appending a second ".yaml". Drop the
    // filter on mobile and just suggest a clean filename.
    const picked = await saveDialog({
      defaultPath: suggested,
      filters: isMobile() ? undefined : FILTERS,
    });
    return picked ?? null;
  },

  async watch(path: string, onChange: () => void): Promise<() => void> {
    // iOS/Android tauri-plugin-fs has no file watcher (no inotify on those
    // platforms) and we deliberately omit fs:allow-watch from mobile.json.
    if (isMobile()) return () => {};
    const stop = await watch(path, () => onChange(), { delayMs: 250 });
    return () => {
      stop();
    };
  },
};
