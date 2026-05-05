import { create } from "zustand";

export type ViewMode = "yaml" | "mindmap" | "split";
export type SplitOrientation = "horizontal" | "vertical";

export interface ClipboardEntry {
  nodeId: string;
}

export interface UIState {
  viewMode: ViewMode;
  splitOrientation: SplitOrientation;
  autoSave: boolean;

  selectedNodeId: string | null;
  editingNodeId: string | null;
  contextMenu: { nodeId: string; x: number; y: number } | null;
  clipboard: ClipboardEntry | null;

  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  setSplitOrientation: (o: SplitOrientation) => void;
  toggleSplitOrientation: () => void;
  setAutoSave: (on: boolean) => void;

  setSelected: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  openContextMenu: (nodeId: string, x: number, y: number) => void;
  closeContextMenu: () => void;
  setClipboard: (entry: ClipboardEntry | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: "yaml",
  splitOrientation: "horizontal",
  autoSave: false,

  selectedNodeId: null,
  editingNodeId: null,
  contextMenu: null,
  clipboard: null,

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleViewMode: () =>
    set((s) => {
      const order: ViewMode[] = ["yaml", "split", "mindmap"];
      const i = order.indexOf(s.viewMode);
      return { viewMode: order[(i + 1) % order.length]! };
    }),
  setSplitOrientation: (o) => set({ splitOrientation: o }),
  toggleSplitOrientation: () =>
    set((s) => ({
      splitOrientation: s.splitOrientation === "horizontal" ? "vertical" : "horizontal",
    })),
  setAutoSave: (on) => set({ autoSave: on }),

  setSelected: (id) => set({ selectedNodeId: id }),
  setEditing: (id) => set({ editingNodeId: id }),
  openContextMenu: (nodeId, x, y) => set({ contextMenu: { nodeId, x, y } }),
  closeContextMenu: () => set({ contextMenu: null }),
  setClipboard: (entry) => set({ clipboard: entry }),
}));
