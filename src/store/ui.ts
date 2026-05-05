import { create } from "zustand";

export type ViewMode = "yaml" | "mindmap" | "split";
export type SplitOrientation = "horizontal" | "vertical";
export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export interface UpdatePayload {
  version: string;
  date?: string;
  body?: string;
  install: () => Promise<void>;
}

export interface ClipboardEntry {
  nodeId: string;
}

export interface UIState {
  viewMode: ViewMode;
  splitOrientation: SplitOrientation;
  splitRatio: number;
  autoSave: boolean;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  fontSize: number;

  selectedNodeId: string | null;
  editingNodeId: string | null;
  contextMenu: { nodeId: string; x: number; y: number } | null;
  clipboard: ClipboardEntry | null;
  liveAnnouncement: string;
  availableUpdate: UpdatePayload | null;

  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  setSplitOrientation: (o: SplitOrientation) => void;
  toggleSplitOrientation: () => void;
  setSplitRatio: (ratio: number) => void;
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
  setAvailableUpdate: (u: UpdatePayload | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: "split",
  splitOrientation: "horizontal",
  splitRatio: 0.5,
  autoSave: false,
  themePreference: "system",
  resolvedTheme: "dark",
  fontSize: 14,

  selectedNodeId: null,
  editingNodeId: null,
  contextMenu: null,
  clipboard: null,
  liveAnnouncement: "",
  availableUpdate: null,

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
  setSplitRatio: (ratio) => set({ splitRatio: Math.max(0.2, Math.min(0.8, ratio)) }),
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
  setAvailableUpdate: (u) => set({ availableUpdate: u }),
}));
