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
  telemetryEnabled: boolean;

  selectedNodeId: string | null;
  editingNodeId: string | null;
  /** Node whose long-form Markdown notes popup is open, or null. */
  notesEditorNodeId: string | null;
  /** Node whose tag editor popup is open, or null. */
  tagEditorNodeId: string | null;
  /** Selected tag-node in the tag tree pane, or null. */
  selectedTagId: string | null;
  /** Tag-node currently in inline-rename mode, or null. */
  editingTagId: string | null;
  /** Tag-tree pane visibility — `null` follows the auto rule (show when
   *  the doc has any tags); `true` / `false` are user overrides. */
  tagTreeVisible: boolean | null;
  /** When non-null, the canvas swaps to the hierarchy filter view rooted
   *  at this tag-node (§5.3 of tagging-design-doc.md). Cleared by the
   *  Reset filter button or by deleting the underlying tag-node. */
  filterTagId: string | null;
  /** Persisted vertical-split ratio between the data canvas (top) and
   *  the tag tree pane (bottom). Clamped to 0.2..0.8 like splitRatio. */
  tagTreeSplitRatio: number;
  contextMenu: { nodeId: string; x: number; y: number } | null;
  /** Right-click menu for the tag tree pane, separate from the data
   *  canvas's contextMenu so the two can't accidentally collide. */
  tagContextMenu: { tagId: string; x: number; y: number } | null;
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
  setTelemetryEnabled: (on: boolean) => void;

  setSelected: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  openNotesEditor: (id: string) => void;
  closeNotesEditor: () => void;
  openTagEditor: (id: string) => void;
  closeTagEditor: () => void;
  setSelectedTag: (id: string | null) => void;
  setEditingTag: (id: string | null) => void;
  setTagTreeVisible: (v: boolean | null) => void;
  setTagTreeSplitRatio: (ratio: number) => void;
  setFilterTagId: (id: string | null) => void;
  openContextMenu: (nodeId: string, x: number, y: number) => void;
  closeContextMenu: () => void;
  openTagContextMenu: (tagId: string, x: number, y: number) => void;
  closeTagContextMenu: () => void;
  setClipboard: (entry: ClipboardEntry | null) => void;
  announce: (message: string) => void;
  setAvailableUpdate: (u: UpdatePayload | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: "mindmap",
  splitOrientation: "horizontal",
  splitRatio: 0.5,
  autoSave: false,
  themePreference: "system",
  resolvedTheme: "dark",
  fontSize: 14,
  telemetryEnabled: false,

  selectedNodeId: null,
  editingNodeId: null,
  notesEditorNodeId: null,
  tagEditorNodeId: null,
  selectedTagId: null,
  editingTagId: null,
  tagTreeVisible: null,
  tagTreeSplitRatio: 0.7,
  filterTagId: null,
  contextMenu: null,
  tagContextMenu: null,
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
  setTelemetryEnabled: (on) => set({ telemetryEnabled: on }),

  setSelected: (id) => set({ selectedNodeId: id }),
  setEditing: (id) => set({ editingNodeId: id }),
  openNotesEditor: (id) => set({ notesEditorNodeId: id, contextMenu: null }),
  closeNotesEditor: () => set({ notesEditorNodeId: null }),
  openTagEditor: (id) => set({ tagEditorNodeId: id, contextMenu: null }),
  closeTagEditor: () => set({ tagEditorNodeId: null }),
  setSelectedTag: (id) => set({ selectedTagId: id }),
  setEditingTag: (id) => set({ editingTagId: id }),
  setTagTreeVisible: (v) => set({ tagTreeVisible: v }),
  setTagTreeSplitRatio: (ratio) =>
    set({ tagTreeSplitRatio: Math.max(0.2, Math.min(0.8, ratio)) }),
  setFilterTagId: (id) => set({ filterTagId: id, contextMenu: null, tagContextMenu: null }),
  openContextMenu: (nodeId, x, y) => set({ contextMenu: { nodeId, x, y } }),
  closeContextMenu: () => set({ contextMenu: null }),
  openTagContextMenu: (tagId, x, y) => set({ tagContextMenu: { tagId, x, y } }),
  closeTagContextMenu: () => set({ tagContextMenu: null }),
  setClipboard: (entry) => set({ clipboard: entry }),
  announce: (message) => set({ liveAnnouncement: message }),
  setAvailableUpdate: (u) => set({ availableUpdate: u }),
}));
