import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, watch, writeTextFile } from "@tauri-apps/plugin-fs";
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
    const picked = await saveDialog({
      defaultPath: suggested,
      filters: FILTERS,
    });
    return picked ?? null;
  },

  async watch(path: string, onChange: () => void): Promise<() => void> {
    const stop = await watch(path, () => onChange(), { delayMs: 250 });
    return () => {
      stop();
    };
  },
};
