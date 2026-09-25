// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

// Configurable env so individual tests can pose as desktop (Tauri) or
// web/mobile. Defaults to web in beforeEach.
const env = vi.hoisted(() => ({ tauri: false, mobile: false }));
vi.mock("../env", () => ({
  isMobile: () => env.mobile,
  isTauri: () => env.tauri,
}));

const mockLoad = vi.fn<typeof import("../notes").loadNotes>();
const mockSave = vi.fn<typeof import("../notes").saveNotes>();
vi.mock("../notes", async () => {
  const actual = await vi.importActual<typeof import("../notes")>("../notes");
  return {
    ...actual,
    loadNotes: (...args: Parameters<typeof actual.loadNotes>) => mockLoad(...args),
    saveNotes: (...args: Parameters<typeof actual.saveNotes>) => mockSave(...args),
  };
});

import { useNodeNotes } from "../useNodeNotes";
import { useDocumentStore } from "../../store/document";
import type { MindDocument } from "../../model";

const NODE_ID = "n1";
const NODE_TEXT = "Root";

function seededDoc(initialNotes?: string): MindDocument {
  return {
    title: "T",
    root: { id: NODE_ID, text: NODE_TEXT, notes: initialNotes, children: [] },
  };
}

function seedStore(notes?: string): void {
  useDocumentStore.getState().reset("title: T", seededDoc(notes), null, null);
}

beforeEach(() => {
  env.tauri = false;
  env.mobile = false;
  mockLoad.mockReset();
  mockSave.mockReset();
  mockLoad.mockImplementation(async (raw) => ({
    content: raw ?? "",
    isPathRef: false,
    resolvedPath: null,
    readOnly: false,
  }));
  mockSave.mockImplementation(async (content) => ({
    fieldValue: content,
    wroteSidecar: false,
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useNodeNotes", () => {
  describe("load", () => {
    it("loads inline content on mount and settles clean", async () => {
      seedStore("hello");
      const { result } = renderHook(() => useNodeNotes(NODE_ID));
      await waitFor(() => expect(result.current.hasLoaded).toBe(true));
      expect(result.current.content).toBe("hello");
      expect(result.current.isDirty).toBe(false);
      expect(result.current.readOnly).toBe(false);
      expect(result.current.overLimit).toBe(false);
    });

    it("ignores a load that resolves after unmount (cancellation guard)", async () => {
      let resolveLoad: (v: Awaited<ReturnType<typeof import("../notes").loadNotes>>) => void =
        () => {};
      mockLoad.mockReturnValueOnce(
        new Promise((r) => {
          resolveLoad = r;
        }),
      );
      seedStore("hi");
      const { result, unmount } = renderHook(() => useNodeNotes(NODE_ID));
      unmount();
      // Resolve AFTER unmount — the cancelled guard short-circuits, no throw,
      // and nothing settles onto the gone component.
      resolveLoad({ content: "late", isPathRef: false, resolvedPath: null, readOnly: false });
      await Promise.resolve();
      expect(result.current.hasLoaded).toBe(false);
    });

    it("exposes the raw load result (sidecar path ref + message)", async () => {
      mockLoad.mockResolvedValueOnce({
        content: "from sidecar",
        isPathRef: true,
        resolvedPath: "/tmp/a.md",
        readOnly: false,
        message: "heads up",
      });
      seedStore("./a.md");
      const { result } = renderHook(() => useNodeNotes(NODE_ID));
      await waitFor(() => expect(result.current.hasLoaded).toBe(true));
      expect(result.current.loaded?.isPathRef).toBe(true);
      expect(result.current.loaded?.message).toBe("heads up");
    });
  });

  describe("dirty tracking + save", () => {
    it("editing content marks it dirty", async () => {
      seedStore("");
      const { result } = renderHook(() => useNodeNotes(NODE_ID));
      await waitFor(() => expect(result.current.hasLoaded).toBe(true));
      act(() => result.current.setContent("changed"));
      expect(result.current.isDirty).toBe(true);
    });

    it("save() persists via saveNotes, writes the tree, and clears dirty", async () => {
      seedStore("");
      const { result } = renderHook(() => useNodeNotes(NODE_ID));
      await waitFor(() => expect(result.current.hasLoaded).toBe(true));
      act(() => result.current.setContent("new body"));

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.save();
      });

      expect(ok).toBe(true);
      expect(mockSave).toHaveBeenCalledWith("new body", "", null, NODE_ID, NODE_TEXT);
      // Tree updated in the document store.
      expect(useDocumentStore.getState().parsedDoc?.root.notes).toBe("new body");
      expect(result.current.isDirty).toBe(false);
      expect(result.current.autoSavedAt).not.toBeNull();
    });

    it("save() surfaces errors and returns false", async () => {
      mockSave.mockRejectedValueOnce(new Error("disk full"));
      seedStore("");
      const { result } = renderHook(() => useNodeNotes(NODE_ID));
      await waitFor(() => expect(result.current.hasLoaded).toBe(true));
      act(() => result.current.setContent("x"));

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.save();
      });

      expect(ok).toBe(false);
      expect(result.current.error).toBe("disk full");
    });
  });

  describe("auto-save", () => {
    it("auto-saves ~1s after an edit", async () => {
      vi.useFakeTimers();
      seedStore("");
      const { result } = renderHook(() => useNodeNotes(NODE_ID));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => result.current.setContent("draft text"));
      expect(mockSave).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockSave.mock.calls[0]?.[0]).toBe("draft text");
    });

    it("does not auto-save when over the inline-only limit", async () => {
      vi.useFakeTimers();
      seedStore("");
      const { result } = renderHook(() => useNodeNotes(NODE_ID));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => result.current.setContent("x".repeat(801)));
      expect(result.current.overLimit).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(mockSave).not.toHaveBeenCalled();
    });

    it("does not auto-save read-only notes", async () => {
      vi.useFakeTimers();
      mockLoad.mockResolvedValueOnce({
        content: "fixed",
        isPathRef: true,
        resolvedPath: "/tmp/a.md",
        readOnly: true,
      });
      seedStore("./a.md");
      const { result } = renderHook(() => useNodeNotes(NODE_ID));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.readOnly).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  describe("read-only guard", () => {
    it("save() is a no-op (returns false) for read-only notes", async () => {
      mockLoad.mockResolvedValueOnce({
        content: "fixed",
        isPathRef: true,
        resolvedPath: "/tmp/a.md",
        readOnly: true,
      });
      seedStore("./a.md");
      const { result } = renderHook(() => useNodeNotes(NODE_ID));
      await waitFor(() => expect(result.current.hasLoaded).toBe(true));
      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.save();
      });
      expect(ok).toBe(false);
      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  describe("missing document / node guards", () => {
    it("save() returns false when there is no parsed document", async () => {
      // Parse-error state: no parsedDoc at all.
      useDocumentStore.getState().reset("garbage", null, null, null);
      const { result } = renderHook(() => useNodeNotes(NODE_ID));
      await waitFor(() => expect(result.current.hasLoaded).toBe(true));
      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.save();
      });
      expect(ok).toBe(false);
      expect(mockSave).not.toHaveBeenCalled();
    });

    it("save() returns false when the target node is not in the tree", async () => {
      seedStore("hi");
      const { result } = renderHook(() => useNodeNotes("does-not-exist"));
      await waitFor(() => expect(result.current.hasLoaded).toBe(true));
      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.save();
      });
      expect(ok).toBe(false);
      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  describe("error + platform branches", () => {
    it("stringifies a non-Error thrown during save", async () => {
      mockSave.mockRejectedValueOnce("plain string failure");
      seedStore("");
      const { result } = renderHook(() => useNodeNotes(NODE_ID));
      await waitFor(() => expect(result.current.hasLoaded).toBe(true));
      act(() => result.current.setContent("x"));
      await act(async () => {
        await result.current.save();
      });
      expect(result.current.error).toBe("plain string failure");
    });

    it("on desktop (Tauri), oversized content is not over-limit (sidecar path)", async () => {
      env.tauri = true;
      seedStore("");
      const { result } = renderHook(() => useNodeNotes(NODE_ID));
      await waitFor(() => expect(result.current.hasLoaded).toBe(true));
      act(() => result.current.setContent("x".repeat(2000)));
      expect(result.current.overLimit).toBe(false);
    });
  });
});
