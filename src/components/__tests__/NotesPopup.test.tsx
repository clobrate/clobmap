// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../lib/env", () => ({
  isMobile: () => false,
  isTauri: () => false,
}));

const mockLoad = vi.fn<typeof import("../../lib/notes").loadNotes>();
const mockSave = vi.fn<typeof import("../../lib/notes").saveNotes>();
vi.mock("../../lib/notes", async () => {
  const actual = await vi.importActual<typeof import("../../lib/notes")>("../../lib/notes");
  return {
    ...actual,
    loadNotes: (...args: Parameters<typeof actual.loadNotes>) => mockLoad(...args),
    saveNotes: (...args: Parameters<typeof actual.saveNotes>) => mockSave(...args),
  };
});

vi.mock("micromark", () => ({
  micromark: (s: string) => `<p>${s}</p>`,
}));

import { NotesPopup } from "../NotesPopup";
import { useDocumentStore } from "../../store/document";
import { useUIStore } from "../../store/ui";
import type { MindDocument } from "../../model";

const NODE_ID = "n1";
const NODE_TEXT = "Root";

function seededDoc(initialNotes?: string): MindDocument {
  return {
    title: "T",
    root: { id: NODE_ID, text: NODE_TEXT, notes: initialNotes, children: [] },
  };
}

function openPopupFor(notes?: string) {
  useDocumentStore.getState().reset("title: T", seededDoc(notes), null, null);
  useUIStore.getState().openNotesEditor(NODE_ID);
}

beforeEach(() => {
  mockLoad.mockReset();
  mockSave.mockReset();
  // Default: load returns whatever was passed in as inline content.
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
  // Reset persisted prefs so font-size tests start at default.
  localStorage.clear();
  useUIStore.setState({ notesEditorNodeId: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function waitForPopup() {
  await screen.findByRole("dialog");
  // The popup mounts, then a load effect runs which sets `hasLoaded` via
  // a microtask. Wait for the textarea (which only exists in edit mode
  // with the loaded content) to settle.
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/Markdown notes/)).toBeInTheDocument();
  });
}

describe("NotesPopup", () => {
  describe("edit / preview toggle", () => {
    it("opens in edit mode by default", async () => {
      openPopupFor("hello");
      render(<NotesPopup />);
      await waitForPopup();
      expect(screen.getByPlaceholderText(/Markdown notes/)).toHaveValue("hello");
      expect(screen.getByRole("button", { name: /^Preview$/ })).toBeInTheDocument();
    });

    it("Preview button switches to rendered HTML, Edit returns to textarea", async () => {
      const user = userEvent.setup();
      openPopupFor("# heading");
      render(<NotesPopup />);
      await waitForPopup();
      await user.click(screen.getByRole("button", { name: /^Preview$/ }));
      // Mocked micromark wraps everything in <p>...</p>; we look for the text.
      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/Markdown notes/)).not.toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /^Edit$/ }));
      expect(screen.getByPlaceholderText(/Markdown notes/)).toBeInTheDocument();
    });

    it("read-only notes open straight in preview mode", async () => {
      mockLoad.mockResolvedValueOnce({
        content: "from a sidecar",
        isPathRef: true,
        resolvedPath: "/tmp/a.md",
        readOnly: true,
      });
      openPopupFor("./sidecar.md");
      render(<NotesPopup />);
      await screen.findByRole("dialog");
      // No textarea, no Preview/Edit toggle for read-only.
      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/Markdown notes/)).not.toBeInTheDocument();
      });
      expect(screen.queryByRole("button", { name: /^Preview$/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Edit$/ })).not.toBeInTheDocument();
    });
  });

  describe("font-size controls", () => {
    it("A+ / A− adjust the font and Reset returns to 14", async () => {
      const user = userEvent.setup();
      openPopupFor("hi");
      render(<NotesPopup />);
      await waitForPopup();

      const sizeReadout = screen.getByRole("button", { name: /Reset text size/ });
      expect(sizeReadout).toHaveTextContent("14");

      await user.click(screen.getByRole("button", { name: /Increase text size/ }));
      expect(sizeReadout).toHaveTextContent("15");

      await user.click(screen.getByRole("button", { name: /Decrease text size/ }));
      expect(sizeReadout).toHaveTextContent("14");

      await user.click(screen.getByRole("button", { name: /Increase text size/ }));
      await user.click(screen.getByRole("button", { name: /Increase text size/ }));
      expect(sizeReadout).toHaveTextContent("16");
      await user.click(sizeReadout); // Reset
      expect(sizeReadout).toHaveTextContent("14");
    });

    it("disables A− at the minimum (10) and A+ at the maximum (28)", async () => {
      const user = userEvent.setup();
      // Persisted font: at the floor.
      localStorage.setItem("clobmap.notesPopup.fontSize", "10");
      openPopupFor("hi");
      render(<NotesPopup />);
      await waitForPopup();

      const smaller = screen.getByRole("button", { name: /Decrease text size/ });
      const larger = screen.getByRole("button", { name: /Increase text size/ });
      expect(smaller).toBeDisabled();
      expect(larger).toBeEnabled();

      // Click 18 times: 10 → 28 (the cap).
      for (let i = 0; i < 18; i++) await user.click(larger);
      expect(larger).toBeDisabled();
      expect(smaller).toBeEnabled();
    });

    it("Cmd+= / Cmd+- / Cmd+0 zoom and reset the font", async () => {
      const user = userEvent.setup();
      openPopupFor("hi");
      render(<NotesPopup />);
      await waitForPopup();

      const sizeReadout = screen.getByRole("button", { name: /Reset text size/ });
      await user.keyboard("{Meta>}={/Meta}");
      expect(sizeReadout).toHaveTextContent("15");
      await user.keyboard("{Meta>}-{/Meta}");
      expect(sizeReadout).toHaveTextContent("14");
      await user.keyboard("{Meta>}={/Meta}{Meta>}={/Meta}");
      expect(sizeReadout).toHaveTextContent("16");
      await user.keyboard("{Meta>}0{/Meta}");
      expect(sizeReadout).toHaveTextContent("14");
    });
  });

  describe("auto-save guard", () => {
    it("auto-saves dirty content after 1 s", async () => {
      vi.useFakeTimers();
      openPopupFor("");
      render(<NotesPopup />);
      // Flush the load-notes microtask without using findBy*, which
      // polls via setTimeout and would deadlock under fake timers.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const textarea = screen.getByPlaceholderText(
        /Markdown notes/,
      ) as HTMLTextAreaElement;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "draft text");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));

      expect(mockSave).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockSave.mock.calls[0]?.[0]).toBe("draft text");
    });

    it("does not auto-save when content is over the inline-only limit", async () => {
      vi.useFakeTimers();
      // Seed at-limit content; the over-limit guard fires on dirty state.
      // We bypass userEvent here because typing 800+ chars under fake
      // timers is glacial and the path under test is the limit check,
      // not the typing surface itself.
      openPopupFor("");
      render(<NotesPopup />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const textarea = screen.getByPlaceholderText(
        /Markdown notes/,
      ) as HTMLTextAreaElement;
      const oversized = "x".repeat(801);
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, oversized);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(mockSave).not.toHaveBeenCalled();
      expect(screen.getByText(/Over limit/)).toBeInTheDocument();
    });

    it("does not auto-save when the notes are read-only", async () => {
      vi.useFakeTimers();
      mockLoad.mockResolvedValueOnce({
        content: "fixed",
        isPathRef: true,
        resolvedPath: "/tmp/a.md",
        readOnly: true,
      });
      openPopupFor("./sidecar.md");
      render(<NotesPopup />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      // Even with timer advance, no save call: read-only short-circuits.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  describe("modal escape rules", () => {
    it("Esc closes a clean popup", async () => {
      const user = userEvent.setup();
      openPopupFor("loaded text");
      render(<NotesPopup />);
      await waitForPopup();
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("Esc is a no-op when there are unsaved changes", async () => {
      const user = userEvent.setup();
      openPopupFor("");
      render(<NotesPopup />);
      await waitForPopup();
      await user.type(screen.getByPlaceholderText(/Markdown notes/), "in progress");
      await user.keyboard("{Escape}");
      // Dialog should still be there; we never auto-saved (no fake timers
      // advanced) so the unsaved guard kicks in.
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    });

    it("Cmd+Enter saves and closes regardless of dirty state", async () => {
      const user = userEvent.setup();
      openPopupFor("");
      render(<NotesPopup />);
      await waitForPopup();
      await user.type(screen.getByPlaceholderText(/Markdown notes/), "manual save");
      await user.keyboard("{Meta>}{Enter}{/Meta}");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(mockSave).toHaveBeenCalledWith("manual save", "", null, NODE_ID, NODE_TEXT);
    });

    it("backdrop click closes a clean popup", async () => {
      const user = userEvent.setup();
      openPopupFor("loaded text");
      render(<NotesPopup />);
      await waitForPopup();
      // The backdrop is the dialog wrapper itself (the inner <div> stops
      // propagation by being a different element).
      const dialog = screen.getByRole("dialog");
      await user.pointer({ keys: "[MouseLeft]", target: dialog });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("backdrop click is a no-op when dirty", async () => {
      const user = userEvent.setup();
      openPopupFor("");
      render(<NotesPopup />);
      await waitForPopup();
      await user.type(screen.getByPlaceholderText(/Markdown notes/), "wip");
      const dialog = screen.getByRole("dialog");
      await user.pointer({ keys: "[MouseLeft]", target: dialog });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("Close (✕) button always closes the popup", async () => {
      const user = userEvent.setup();
      openPopupFor("");
      render(<NotesPopup />);
      await waitForPopup();
      await user.type(screen.getByPlaceholderText(/Markdown notes/), "still typing");
      await user.click(screen.getByRole("button", { name: /^Close$/ }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });
  });
});
