import { confirm } from "@tauri-apps/plugin-dialog";
import { useDocumentStore } from "../store/document";
import { parseLiveYaml } from "../model";
import { tauriStorage } from "./storage";
import { addRecentFile, removeRecentFile } from "./recentFiles";

async function confirmDiscard(): Promise<boolean> {
  if (!useDocumentStore.getState().isDirty) return true;
  return confirm("Discard unsaved changes?", {
    title: "Unsaved changes",
    kind: "warning",
    okLabel: "Discard",
    cancelLabel: "Keep editing",
  });
}

export async function openFromPath(path: string): Promise<void> {
  try {
    const contents = await tauriStorage.read(path);
    loadIntoStore(contents, path);
    await addRecentFile(path);
  } catch (err) {
    console.error("Failed to open", path, err);
    await removeRecentFile(path);
  }
}

export async function openFile(): Promise<void> {
  if (!(await confirmDiscard())) return;
  const result = await tauriStorage.open();
  if (!result) return;
  loadIntoStore(result.contents, result.path);
  await addRecentFile(result.path);
}

export async function saveFile(): Promise<void> {
  const state = useDocumentStore.getState();
  if (!state.currentFilePath) {
    return saveFileAs();
  }
  await tauriStorage.save(state.currentFilePath, state.yamlText);
  state.markSavedAt(state.currentFilePath);
  await addRecentFile(state.currentFilePath);
}

export async function saveFileAs(): Promise<void> {
  const state = useDocumentStore.getState();
  const path = await tauriStorage.pickSavePath(state.currentFilePath ?? "untitled.clobmap.yaml");
  if (!path) return;
  await tauriStorage.save(path, state.yamlText);
  useDocumentStore.getState().markSavedAt(path);
  await addRecentFile(path);
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
    // Open even with invalid YAML — user can fix it in the editor.
    useDocumentStore.getState().reset(contents, null, null, path);
    useDocumentStore.getState().applyParseError(result.error);
  }
}
