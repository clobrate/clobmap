import { create } from "zustand";
import {
  loadDocumentSnapshot,
  snapshotDocument,
  type DocumentSnapshot,
} from "./document";
import { useUIStore } from "./ui";

let nextLocalId = 1;
function freshId(): string {
  return `tab-${Date.now()}-${nextLocalId++}`;
}

export interface Tab {
  id: string;
  /** Snapshot of the doc state. For the active tab it's stale until the
   * next switch — render code must read live state from useDocumentStore
   * instead of this field for the active tab. */
  snapshot: DocumentSnapshot;
}

export interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;

  /** Initialize tabs with the current live document as tab 0. Called once
   * during bootstrap after the document store is populated. */
  init(): void;
  /** Snapshot the current live doc, append a new tab seeded with the given
   * snapshot, and switch to it. Returns the new tab id. */
  open(snapshot: DocumentSnapshot): string;
  /** Switch to an existing tab. No-op if id is already active or unknown. */
  switchTo(id: string): void;
  /** Close a tab. If it's the active tab, switch to a neighbor. If it was
   * the last tab, leaves the document store as-is and tabs[] empty — the
   * caller is responsible for re-seeding (e.g. via newFile). */
  close(id: string): void;
  /** Update the snapshot for a specific tab — used by file actions that
   * mutate the active tab's identity (e.g. saveAs changes currentFilePath). */
  syncActive(): void;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  init: () => {
    if (get().tabs.length > 0) return;
    const id = freshId();
    set({ tabs: [{ id, snapshot: snapshotDocument() }], activeTabId: id });
  },

  open: (snapshot) => {
    const state = get();
    const id = freshId();
    const updatedTabs = state.tabs.map((t) =>
      t.id === state.activeTabId ? { ...t, snapshot: snapshotDocument() } : t,
    );
    loadDocumentSnapshot(snapshot);
    // New tab starts with no selection / not editing.
    useUIStore.getState().setSelected(null);
    useUIStore.getState().setEditing(null);
    set({ tabs: [...updatedTabs, { id, snapshot }], activeTabId: id });
    return id;
  },

  switchTo: (id) => {
    const state = get();
    if (id === state.activeTabId) return;
    const target = state.tabs.find((t) => t.id === id);
    if (!target) return;
    const updatedTabs = state.tabs.map((t) =>
      t.id === state.activeTabId ? { ...t, snapshot: snapshotDocument() } : t,
    );
    loadDocumentSnapshot(target.snapshot);
    useUIStore.getState().setSelected(null);
    useUIStore.getState().setEditing(null);
    set({ tabs: updatedTabs, activeTabId: id });
  },

  close: (id) => {
    const state = get();
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const remaining = state.tabs.filter((t) => t.id !== id);
    if (state.activeTabId !== id) {
      // Closing an inactive tab — just drop it, keep current active.
      set({ tabs: remaining });
      return;
    }
    if (remaining.length === 0) {
      set({ tabs: [], activeTabId: null });
      return;
    }
    // Switch to neighbor: prefer the tab that was to the right, else left.
    const nextIdx = Math.min(idx, remaining.length - 1);
    const next = remaining[nextIdx]!;
    loadDocumentSnapshot(next.snapshot);
    useUIStore.getState().setSelected(null);
    useUIStore.getState().setEditing(null);
    set({ tabs: remaining, activeTabId: next.id });
  },

  syncActive: () => {
    const state = get();
    if (!state.activeTabId) return;
    set({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId ? { ...t, snapshot: snapshotDocument() } : t,
      ),
    });
  },
}));
