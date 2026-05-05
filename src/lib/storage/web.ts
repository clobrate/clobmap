import type { OpenedFile, StorageAdapter } from "./types";

interface FilePickerOptions {
  types?: { description?: string; accept?: Record<string, string[]> }[];
  suggestedName?: string;
  multiple?: boolean;
}

interface FsaWindow {
  showOpenFilePicker?: (opts?: FilePickerOptions) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (opts?: FilePickerOptions) => Promise<FileSystemFileHandle>;
}

const fsa = window as unknown as FsaWindow;

const ACCEPT: FilePickerOptions["types"] = [
  {
    description: "Mind map (YAML)",
    accept: { "text/yaml": [".clobmap.yaml", ".yaml", ".yml"] },
  },
];

// File System Access API handles by path. Path is the handle's name; if two
// files share a name, the most recently opened wins, which is fine for v1.
const handles = new Map<string, FileSystemFileHandle>();

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

async function openViaInput(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".clobmap.yaml,.yaml,.yml,text/yaml";
    input.style.display = "none";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      void file.text().then((contents) => {
        resolve({ path: file.name, contents });
      });
    });
    input.addEventListener("cancel", () => resolve(null));
    document.body.appendChild(input);
    input.click();
    queueMicrotask(() => input.remove());
  });
}

function downloadAsFile(name: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const webStorage: StorageAdapter = {
  async open(): Promise<OpenedFile | null> {
    if (typeof fsa.showOpenFilePicker === "function") {
      try {
        const [handle] = await fsa.showOpenFilePicker({ types: ACCEPT, multiple: false });
        if (!handle) return null;
        const file = await handle.getFile();
        const contents = await file.text();
        handles.set(handle.name, handle);
        return { path: handle.name, contents };
      } catch (err) {
        if (isAbort(err)) return null;
        throw err;
      }
    }
    return openViaInput();
  },

  async read(path: string): Promise<string> {
    const handle = handles.get(path);
    if (!handle) {
      throw new Error(`Cannot reload "${path}" in this browser. Use File → Open to load it again.`);
    }
    const file = await handle.getFile();
    return file.text();
  },

  async save(path: string, contents: string): Promise<void> {
    const handle = handles.get(path);
    if (handle && "createWritable" in handle) {
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      return;
    }
    downloadAsFile(path, contents);
  },

  async pickSavePath(suggested?: string): Promise<string | null> {
    if (typeof fsa.showSaveFilePicker === "function") {
      try {
        const handle = await fsa.showSaveFilePicker({
          suggestedName: suggested,
          types: ACCEPT,
        });
        handles.set(handle.name, handle);
        return handle.name;
      } catch (err) {
        if (isAbort(err)) return null;
        throw err;
      }
    }
    // Fallback: just return the name; save() will trigger a download.
    return suggested ?? "untitled.clobmap.yaml";
  },

  async watch(): Promise<() => void> {
    return () => {};
  },
};
