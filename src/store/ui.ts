import { create } from "zustand";

export type ViewMode = "yaml" | "mindmap";

export interface UIState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: "yaml",
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleViewMode: () => set((s) => ({ viewMode: s.viewMode === "yaml" ? "mindmap" : "yaml" })),
}));
