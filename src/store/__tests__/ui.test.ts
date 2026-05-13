import { beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "../ui";

describe("useUIStore", () => {
  beforeEach(() => {
    // Reset to initial defaults so tests are independent.
    useUIStore.setState({
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
      contextMenu: null,
      tagContextMenu: null,
      clipboard: null,
      liveAnnouncement: "",
      availableUpdate: null,
    });
  });

  describe("view mode", () => {
    it("setViewMode replaces the current mode", () => {
      useUIStore.getState().setViewMode("yaml");
      expect(useUIStore.getState().viewMode).toBe("yaml");
    });

    it("toggleViewMode cycles yaml → split → mindmap → yaml", () => {
      useUIStore.getState().setViewMode("yaml");
      const { toggleViewMode } = useUIStore.getState();
      toggleViewMode();
      expect(useUIStore.getState().viewMode).toBe("split");
      toggleViewMode();
      expect(useUIStore.getState().viewMode).toBe("mindmap");
      toggleViewMode();
      expect(useUIStore.getState().viewMode).toBe("yaml");
    });
  });

  describe("split orientation", () => {
    it("setSplitOrientation replaces", () => {
      useUIStore.getState().setSplitOrientation("vertical");
      expect(useUIStore.getState().splitOrientation).toBe("vertical");
    });

    it("toggleSplitOrientation flips horizontal ↔ vertical", () => {
      const { toggleSplitOrientation } = useUIStore.getState();
      toggleSplitOrientation();
      expect(useUIStore.getState().splitOrientation).toBe("vertical");
      toggleSplitOrientation();
      expect(useUIStore.getState().splitOrientation).toBe("horizontal");
    });
  });

  describe("setSplitRatio", () => {
    it("clamps below 0.2", () => {
      useUIStore.getState().setSplitRatio(0.05);
      expect(useUIStore.getState().splitRatio).toBe(0.2);
    });

    it("clamps above 0.8", () => {
      useUIStore.getState().setSplitRatio(0.95);
      expect(useUIStore.getState().splitRatio).toBe(0.8);
    });

    it("accepts in-range values unchanged", () => {
      useUIStore.getState().setSplitRatio(0.42);
      expect(useUIStore.getState().splitRatio).toBe(0.42);
    });
  });

  describe("setFontSize", () => {
    it("clamps below 10", () => {
      useUIStore.getState().setFontSize(4);
      expect(useUIStore.getState().fontSize).toBe(10);
    });

    it("clamps above 24", () => {
      useUIStore.getState().setFontSize(99);
      expect(useUIStore.getState().fontSize).toBe(24);
    });

    it("rounds fractional values", () => {
      useUIStore.getState().setFontSize(15.6);
      expect(useUIStore.getState().fontSize).toBe(16);
    });
  });

  describe("simple setters", () => {
    it("setAutoSave / setThemePreference / setResolvedTheme / setTelemetryEnabled", () => {
      const s = useUIStore.getState();
      s.setAutoSave(true);
      expect(useUIStore.getState().autoSave).toBe(true);
      s.setThemePreference("light");
      expect(useUIStore.getState().themePreference).toBe("light");
      s.setResolvedTheme("light");
      expect(useUIStore.getState().resolvedTheme).toBe("light");
      s.setTelemetryEnabled(true);
      expect(useUIStore.getState().telemetryEnabled).toBe(true);
    });
  });

  describe("selection + editing", () => {
    it("setSelected and setEditing", () => {
      useUIStore.getState().setSelected("n1");
      useUIStore.getState().setEditing("n1");
      const s = useUIStore.getState();
      expect(s.selectedNodeId).toBe("n1");
      expect(s.editingNodeId).toBe("n1");
    });

    it("clears with null", () => {
      useUIStore.getState().setSelected("n1");
      useUIStore.getState().setSelected(null);
      expect(useUIStore.getState().selectedNodeId).toBeNull();
    });
  });

  describe("notes editor", () => {
    it("openNotesEditor sets the node id", () => {
      useUIStore.getState().openNotesEditor("n5");
      expect(useUIStore.getState().notesEditorNodeId).toBe("n5");
    });

    it("openNotesEditor closes any open context menu", () => {
      useUIStore.getState().openContextMenu("n5", 10, 20);
      useUIStore.getState().openNotesEditor("n5");
      expect(useUIStore.getState().contextMenu).toBeNull();
    });

    it("closeNotesEditor clears the node id", () => {
      useUIStore.getState().openNotesEditor("n5");
      useUIStore.getState().closeNotesEditor();
      expect(useUIStore.getState().notesEditorNodeId).toBeNull();
    });
  });

  describe("context menu", () => {
    it("openContextMenu sets nodeId + coords; closeContextMenu clears", () => {
      useUIStore.getState().openContextMenu("n1", 50, 80);
      expect(useUIStore.getState().contextMenu).toEqual({ nodeId: "n1", x: 50, y: 80 });
      useUIStore.getState().closeContextMenu();
      expect(useUIStore.getState().contextMenu).toBeNull();
    });
  });

  describe("clipboard", () => {
    it("set / clear", () => {
      useUIStore.getState().setClipboard({ nodeId: "n2" });
      expect(useUIStore.getState().clipboard).toEqual({ nodeId: "n2" });
      useUIStore.getState().setClipboard(null);
      expect(useUIStore.getState().clipboard).toBeNull();
    });
  });

  describe("misc passthrough setters", () => {
    it("announce + setAvailableUpdate", () => {
      useUIStore.getState().announce("hello");
      expect(useUIStore.getState().liveAnnouncement).toBe("hello");

      useUIStore.getState().setAvailableUpdate({
        version: "1.2.3",
        install: async () => {},
      });
      expect(useUIStore.getState().availableUpdate?.version).toBe("1.2.3");

      useUIStore.getState().setAvailableUpdate(null);
      expect(useUIStore.getState().availableUpdate).toBeNull();
    });
  });

  describe("tag editor", () => {
    it("openTagEditor sets the target node id", () => {
      useUIStore.getState().openTagEditor("n42");
      expect(useUIStore.getState().tagEditorNodeId).toBe("n42");
    });

    it("openTagEditor closes any open context menu (same node)", () => {
      // Open a context menu, then open the tag editor.
      useUIStore.getState().openContextMenu("n7", 100, 200);
      expect(useUIStore.getState().contextMenu).not.toBeNull();
      useUIStore.getState().openTagEditor("n7");
      expect(useUIStore.getState().contextMenu).toBeNull();
    });

    it("closeTagEditor clears the target node id", () => {
      useUIStore.getState().openTagEditor("n42");
      useUIStore.getState().closeTagEditor();
      expect(useUIStore.getState().tagEditorNodeId).toBeNull();
    });

    it("opening the tag editor doesn't disturb the notes editor (each tracks its own id)", () => {
      useUIStore.getState().openNotesEditor("n1");
      useUIStore.getState().openTagEditor("n2");
      expect(useUIStore.getState().notesEditorNodeId).toBe("n1");
      expect(useUIStore.getState().tagEditorNodeId).toBe("n2");
    });
  });
});
