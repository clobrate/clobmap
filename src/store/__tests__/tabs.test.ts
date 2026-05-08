import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTabsStore } from "../tabs";
import {
  loadDocumentSnapshot,
  snapshotDocument,
  useDocumentStore,
  type DocumentSnapshot,
} from "../document";

function emptySnapshot(label: string): DocumentSnapshot {
  return {
    yamlText: `# ${label}`,
    parsedDoc: null,
    yamlDoc: null,
    parseError: null,
    originalText: `# ${label}`,
    isDirty: false,
    currentFilePath: null,
    undoStack: [],
    redoStack: [],
  };
}

function snapshotWithPath(path: string, label: string): DocumentSnapshot {
  return {
    ...emptySnapshot(label),
    currentFilePath: path,
  };
}

describe("useTabsStore", () => {
  // Reset both stores before each test so they're independent.
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], activeTabId: null });
    loadDocumentSnapshot(emptySnapshot("seed"));
  });

  afterEach(() => {
    useTabsStore.setState({ tabs: [], activeTabId: null });
  });

  describe("init", () => {
    it("creates a single tab from the live document on first call", () => {
      useTabsStore.getState().init();
      const s = useTabsStore.getState();
      expect(s.tabs).toHaveLength(1);
      expect(s.activeTabId).toBe(s.tabs[0]!.id);
    });

    it("is a no-op when called again", () => {
      useTabsStore.getState().init();
      const firstId = useTabsStore.getState().activeTabId;
      useTabsStore.getState().init();
      const s = useTabsStore.getState();
      expect(s.tabs).toHaveLength(1);
      expect(s.activeTabId).toBe(firstId);
    });
  });

  describe("open", () => {
    it("appends a new tab and switches to it", () => {
      useTabsStore.getState().init();
      const firstId = useTabsStore.getState().activeTabId;
      const newId = useTabsStore.getState().open(snapshotWithPath("/tmp/b.yaml", "B"));

      const s = useTabsStore.getState();
      expect(s.tabs).toHaveLength(2);
      expect(s.activeTabId).toBe(newId);
      expect(newId).not.toBe(firstId);
    });

    it("loads the new snapshot as the live document", () => {
      useTabsStore.getState().init();
      useTabsStore.getState().open(snapshotWithPath("/tmp/b.yaml", "B"));
      expect(useDocumentStore.getState().currentFilePath).toBe("/tmp/b.yaml");
    });

    it("snapshots the previously-active tab before swapping", () => {
      useTabsStore.getState().init();
      // Mutate the live doc so its current state is distinct from the seed.
      loadDocumentSnapshot(snapshotWithPath("/tmp/a.yaml", "A"));
      const firstId = useTabsStore.getState().activeTabId!;
      useTabsStore.getState().open(snapshotWithPath("/tmp/b.yaml", "B"));

      const firstTab = useTabsStore.getState().tabs.find((t) => t.id === firstId);
      expect(firstTab?.snapshot.currentFilePath).toBe("/tmp/a.yaml");
    });
  });

  describe("switchTo", () => {
    it("loads the target tab's snapshot into the live document", () => {
      useTabsStore.getState().init();
      const firstId = useTabsStore.getState().activeTabId!;
      useTabsStore.getState().open(snapshotWithPath("/tmp/b.yaml", "B"));
      useTabsStore.getState().switchTo(firstId);

      expect(useDocumentStore.getState().currentFilePath).toBeNull();
      expect(useTabsStore.getState().activeTabId).toBe(firstId);
    });

    it("snapshots the current tab before switching away", () => {
      useTabsStore.getState().init();
      const firstId = useTabsStore.getState().activeTabId!;
      const secondId = useTabsStore.getState().open(emptySnapshot("B"));
      // Edit the live doc while on the second tab.
      loadDocumentSnapshot(snapshotWithPath("/tmp/edited.yaml", "edited"));
      useTabsStore.getState().switchTo(firstId);

      const second = useTabsStore.getState().tabs.find((t) => t.id === secondId);
      expect(second?.snapshot.currentFilePath).toBe("/tmp/edited.yaml");
    });

    it("is a no-op for the already-active tab", () => {
      useTabsStore.getState().init();
      const id = useTabsStore.getState().activeTabId!;
      const before = snapshotDocument();
      useTabsStore.getState().switchTo(id);
      const after = snapshotDocument();
      expect(after).toEqual(before);
    });

    it("is a no-op for an unknown id", () => {
      useTabsStore.getState().init();
      const before = useTabsStore.getState().activeTabId;
      useTabsStore.getState().switchTo("missing");
      expect(useTabsStore.getState().activeTabId).toBe(before);
    });
  });

  describe("close", () => {
    it("removes an inactive tab without disturbing the active one", () => {
      useTabsStore.getState().init();
      const firstId = useTabsStore.getState().activeTabId!;
      const secondId = useTabsStore.getState().open(emptySnapshot("B"));
      useTabsStore.getState().close(firstId);

      const s = useTabsStore.getState();
      expect(s.tabs).toHaveLength(1);
      expect(s.activeTabId).toBe(secondId);
    });

    it("when closing the active tab, switches to the right neighbor", () => {
      useTabsStore.getState().init();
      const firstId = useTabsStore.getState().activeTabId!;
      const secondId = useTabsStore.getState().open(emptySnapshot("B"));
      useTabsStore.getState().switchTo(firstId);
      useTabsStore.getState().close(firstId);

      expect(useTabsStore.getState().activeTabId).toBe(secondId);
    });

    it("falls back to the left neighbor if no right neighbor exists", () => {
      useTabsStore.getState().init();
      const firstId = useTabsStore.getState().activeTabId!;
      const secondId = useTabsStore.getState().open(emptySnapshot("B"));
      // Closing the right-most tab (active) → fall back to the left.
      useTabsStore.getState().close(secondId);
      expect(useTabsStore.getState().activeTabId).toBe(firstId);
    });

    it("leaves tabs empty when the last tab is closed", () => {
      useTabsStore.getState().init();
      const id = useTabsStore.getState().activeTabId!;
      useTabsStore.getState().close(id);

      const s = useTabsStore.getState();
      expect(s.tabs).toHaveLength(0);
      expect(s.activeTabId).toBeNull();
    });

    it("is a no-op for an unknown id", () => {
      useTabsStore.getState().init();
      const before = useTabsStore.getState().tabs.length;
      useTabsStore.getState().close("missing");
      expect(useTabsStore.getState().tabs).toHaveLength(before);
    });
  });

  describe("syncActive", () => {
    it("updates the active tab's snapshot to match the live document", () => {
      useTabsStore.getState().init();
      const id = useTabsStore.getState().activeTabId!;
      // Live doc changes, but tab snapshot is stale.
      loadDocumentSnapshot(snapshotWithPath("/tmp/just-saved.yaml", "saved"));
      useTabsStore.getState().syncActive();

      const tab = useTabsStore.getState().tabs.find((t) => t.id === id);
      expect(tab?.snapshot.currentFilePath).toBe("/tmp/just-saved.yaml");
    });

    it("is a no-op when there's no active tab", () => {
      // Empty state — no init() called.
      useTabsStore.getState().syncActive();
      expect(useTabsStore.getState().tabs).toHaveLength(0);
    });
  });
});
