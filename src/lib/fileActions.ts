import { useDocumentStore } from "../store/document";
import { parseLiveYaml } from "../model";
import { storage } from "./storage";
import { addRecentFile, removeRecentFile } from "./recentFiles";
import { isTauri } from "./env";
import { saveLastOpenFile } from "./settings";

async function tauriConfirm(
  message: string,
  options: { title: string; okLabel?: string; cancelLabel?: string },
): Promise<boolean> {
  const { confirm } = await import("@tauri-apps/plugin-dialog");
  return confirm(message, { ...options, kind: "warning" });
}

async function platformConfirm(
  message: string,
  options: { title: string; okLabel?: string; cancelLabel?: string },
): Promise<boolean> {
  if (isTauri()) return tauriConfirm(message, options);
  return window.confirm(message);
}

async function platformError(title: string, err: unknown): Promise<void> {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(title, err);
  if (isTauri()) {
    const { message } = await import("@tauri-apps/plugin-dialog");
    await message(`${title}\n\n${detail}`, { title: "clobmap", kind: "error" });
    return;
  }
  window.alert(`${title}\n\n${detail}`);
}

async function confirmDiscard(): Promise<boolean> {
  if (!useDocumentStore.getState().isDirty) return true;
  return platformConfirm("Discard unsaved changes?", {
    title: "Unsaved changes",
    okLabel: "Discard",
    cancelLabel: "Keep editing",
  });
}

export async function openFromPath(path: string): Promise<void> {
  try {
    const contents = await storage.read(path);
    loadIntoStore(contents, path);
    await addRecentFile(path);
    await saveLastOpenFile(path);
  } catch (err) {
    await platformError(`Could not open ${path}`, err);
    await removeRecentFile(path);
    // If the user's "last file" is the one that just failed, forget it so we
    // don't try to reopen it on next launch.
    await saveLastOpenFile(null);
  }
}

export async function openFile(): Promise<void> {
  if (!(await confirmDiscard())) return;
  try {
    const result = await storage.open();
    if (!result) return;
    loadIntoStore(result.contents, result.path);
    await addRecentFile(result.path);
    await saveLastOpenFile(result.path);
  } catch (err) {
    await platformError("Could not open file", err);
  }
}

export async function saveFile(): Promise<void> {
  const state = useDocumentStore.getState();
  if (!state.currentFilePath) {
    return saveFileAs();
  }
  try {
    await storage.save(state.currentFilePath, state.yamlText);
    state.markSavedAt(state.currentFilePath);
    await addRecentFile(state.currentFilePath);
    await saveLastOpenFile(state.currentFilePath);
  } catch (err) {
    await platformError(`Could not save to ${state.currentFilePath}`, err);
  }
}

export async function saveFileAs(): Promise<void> {
  const state = useDocumentStore.getState();
  let path: string | null;
  try {
    path = await storage.pickSavePath(state.currentFilePath ?? "untitled.clobmap.yaml");
  } catch (err) {
    await platformError("Could not open save dialog", err);
    return;
  }
  if (!path) return;
  try {
    await storage.save(path, state.yamlText);
    useDocumentStore.getState().markSavedAt(path);
    await addRecentFile(path);
    await saveLastOpenFile(path);
  } catch (err) {
    await platformError(`Could not save to ${path}`, err);
  }
}

export async function openRecent(path: string): Promise<void> {
  if (!(await confirmDiscard())) return;
  await openFromPath(path);
}

function loadIntoStore(contents: string, path: string): void {
  const result = parseLiveYaml(contents);
  if (result.ok) {
    useDocumentStore.getState().reset(contents, result.value.tree, result.value.doc, path);
  } else {
    useDocumentStore.getState().reset(contents, null, null, path);
    useDocumentStore.getState().applyParseError(result.error);
  }
}
