import {
  loadDocumentSnapshot,
  useDocumentStore,
  type DocumentSnapshot,
} from "../store/document";
import { useTabsStore } from "../store/tabs";
import { parseLiveYaml } from "../model";
import { storage } from "./storage";
import { addRecentFile, removeRecentFile } from "./recentFiles";
import { isMobile, isTauri } from "./env";
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

const NEW_FILE_SEED = `title: Untitled
version: 1
root:
  id: n1
  text: Untitled
  children: []
`;

function seedSnapshot(): DocumentSnapshot {
  const result = parseLiveYaml(NEW_FILE_SEED);
  return {
    yamlText: NEW_FILE_SEED,
    parsedDoc: result.ok ? result.value.tree : null,
    yamlDoc: result.ok ? result.value.doc : null,
    parseError: null,
    originalText: NEW_FILE_SEED,
    isDirty: false,
    currentFilePath: null,
    undoStack: [],
    redoStack: [],
  };
}

/**
 * Mobile: in-place reset (we don't show tabs). Desktop: spawn a new tab and
 * switch to it without disturbing the current one (no discard prompt needed
 * because the current tab keeps its state).
 */
export async function newFile(): Promise<void> {
  const seed = seedSnapshot();
  if (isMobile()) {
    if (!(await confirmDiscard())) return;
    const store = useDocumentStore.getState();
    store.reset(seed.yamlText, seed.parsedDoc, seed.yamlDoc);
    await saveLastOpenFile(null);
    useTabsStore.getState().syncActive();
    return;
  }
  useTabsStore.getState().open(seed);
  await saveLastOpenFile(null);
}

/** Open a file path in a new tab (desktop) or replace current tab (mobile). */
export async function newTab(): Promise<void> {
  return newFile();
}

/**
 * Close a tab from the tab strip. Prompts to discard if dirty. If it was
 * the last tab, replaces it with a fresh seed instead of leaving the canvas
 * blank.
 */
export async function closeTabAction(tabId: string): Promise<void> {
  const store = useTabsStore.getState();
  const tab = store.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  const isActive = store.activeTabId === tabId;
  const dirty = isActive
    ? useDocumentStore.getState().isDirty
    : tab.snapshot.isDirty;
  if (dirty && !(await confirmDiscard())) return;
  store.close(tabId);
  // If we closed the last tab, seed a fresh empty one so the canvas isn't
  // blank.
  const after = useTabsStore.getState();
  if (after.tabs.length === 0) {
    after.open(seedSnapshot());
  }
}

function snapshotForContents(
  contents: string,
  path: string | null,
): DocumentSnapshot {
  const result = parseLiveYaml(contents);
  return {
    yamlText: contents,
    parsedDoc: result.ok ? result.value.tree : null,
    yamlDoc: result.ok ? result.value.doc : null,
    parseError: result.ok ? null : result.error,
    originalText: contents,
    isDirty: false,
    currentFilePath: path,
    undoStack: [],
    redoStack: [],
  };
}

/**
 * Load a file into the active context. On desktop this opens in a new tab
 * (so you don't lose your current document); on mobile we replace the
 * single active tab in place since there's no tab strip.
 */
function loadFile(contents: string, path: string): void {
  const snap = snapshotForContents(contents, path);
  if (isMobile()) {
    loadDocumentSnapshot(snap);
    useTabsStore.getState().syncActive();
    return;
  }
  // If the active tab is an empty Untitled (typical first-launch state),
  // replace it instead of accumulating cruft.
  const active = useDocumentStore.getState();
  if (active.currentFilePath === null && !active.isDirty) {
    loadDocumentSnapshot(snap);
    useTabsStore.getState().syncActive();
    return;
  }
  useTabsStore.getState().open(snap);
}

export async function openFromPath(path: string): Promise<void> {
  try {
    const contents = await storage.read(path);
    loadFile(contents, path);
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
  // On desktop, no need to confirm discard — the current tab stays open.
  // On mobile we replace the single tab in place, so we still need to
  // protect unsaved work.
  if (isMobile() && !(await confirmDiscard())) return;
  try {
    const result = await storage.open();
    if (!result) return;
    loadFile(result.contents, result.path);
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
  // iOS hands us a security-scoped URL that's only valid during the picker
  // dialog's lifetime — silent writes to the same URL later return
  // "Operation not permitted". Until we wire up bookmark-based persistent
  // scopes (needs native Swift), iOS Save always re-picks the destination.
  if (isMobile()) {
    return saveFileAs();
  }
  try {
    await storage.save(state.currentFilePath, state.yamlText);
    state.markSavedAt(state.currentFilePath);
    await addRecentFile(state.currentFilePath);
    await saveLastOpenFile(state.currentFilePath);
    useTabsStore.getState().syncActive();
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
    useTabsStore.getState().syncActive();
  } catch (err) {
    await platformError(`Could not save to ${path}`, err);
  }
}

export async function openRecent(path: string): Promise<void> {
  if (isMobile() && !(await confirmDiscard())) return;
  await openFromPath(path);
}
