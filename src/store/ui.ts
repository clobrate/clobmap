import { create } from "zustand";

export type ViewMode = "yaml" | "mindmap";

export interface UIState {
  viewMode: ViewMode;
  selectedNodeId: string | null;
  editingNodeId: string | null;
  contextMenu: { nodeId: string; x: number; y: number } | null;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  setSelected: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  openContextMenu: (nodeId: string, x: number, y: number) => void;
  closeContextMenu: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: "yaml",
  selectedNodeId: null,
  editingNodeId: null,
  contextMenu: null,
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleViewMode: () => set((s) => ({ viewMode: s.viewMode === "yaml" ? "mindmap" : "yaml" })),
  setSelected: (id) => set({ selectedNodeId: id }),
  setEditing: (id) => set({ editingNodeId: id }),
  openContextMenu: (nodeId, x, y) => set({ contextMenu: { nodeId, x, y } }),
  closeContextMenu: () => set({ contextMenu: null }),
}));
