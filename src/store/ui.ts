import { create } from "zustand";

export type ViewMode = "yaml" | "mindmap" | "split";
export type SplitOrientation = "horizontal" | "vertical";
export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export interface ClipboardEntry {
  nodeId: string;
}

export interface UIState {
  viewMode: ViewMode;
  splitOrientation: SplitOrientation;
  autoSave: boolean;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  fontSize: number;

  selectedNodeId: string | null;
  editingNodeId: string | null;
  contextMenu: { nodeId: string; x: number; y: number } | null;
  clipboard: ClipboardEntry | null;
  liveAnnouncement: string;

  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  setSplitOrientation: (o: SplitOrientation) => void;
  toggleSplitOrientation: () => void;
  setAutoSave: (on: boolean) => void;
  setThemePreference: (t: ThemePreference) => void;
  setResolvedTheme: (t: ResolvedTheme) => void;
  setFontSize: (px: number) => void;

  setSelected: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  openContextMenu: (nodeId: string, x: number, y: number) => void;
  closeContextMenu: () => void;
  setClipboard: (entry: ClipboardEntry | null) => void;
  announce: (message: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: "split",
  splitOrientation: "horizontal",
  autoSave: false,
  themePreference: "system",
  resolvedTheme: "dark",
  fontSize: 14,

  selectedNodeId: null,
  editingNodeId: null,
  contextMenu: null,
  clipboard: null,
  liveAnnouncement: "",

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
  setThemePreference: (t) => set({ themePreference: t }),
  setResolvedTheme: (t) => set({ resolvedTheme: t }),
  setFontSize: (px) => set({ fontSize: Math.max(10, Math.min(24, Math.round(px))) }),

  setSelected: (id) => set({ selectedNodeId: id }),
  setEditing: (id) => set({ editingNodeId: id }),
  openContextMenu: (nodeId, x, y) => set({ contextMenu: { nodeId, x, y } }),
  closeContextMenu: () => set({ contextMenu: null }),
  setClipboard: (entry) => set({ clipboard: entry }),
  announce: (message) => set({ liveAnnouncement: message }),
}));
