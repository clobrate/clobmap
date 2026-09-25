// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// loadNotes is called by every NoteletsPage; keep it inert here.
vi.mock("../../lib/notes", async () => {
  const actual = await vi.importActual<typeof import("../../lib/notes")>("../../lib/notes");
  return {
    ...actual,
    loadNotes: async () => ({ content: "", isPathRef: false, resolvedPath: null, readOnly: false }),
  };
});
vi.mock("micromark", () => ({ micromark: (s: string) => `<p>${s}</p>` }));

// Stub the CodeMirror editor — this file tests the container's edit
// coordination, not the editor (covered by NoteletsPageEditor.test.tsx).
vi.mock("../NoteletsPageEditor", () => ({
  NoteletsPageEditor: ({ nodeId }: { nodeId: string }) => (
    <div data-testid="page-editor">{nodeId}</div>
  ),
}));

import { Notelets } from "../Notelets";
import { useDocumentStore } from "../../store/document";
import { useUIStore } from "../../store/ui";
import type { MindDocument } from "../../model";

function doc(): MindDocument {
  return {
    title: "T",
    root: {
      id: "root",
      text: "Root",
      children: [
        { id: "s1", text: "Subject 1", children: [] },
        { id: "s2", text: "Subject 2", children: [] },
      ],
    },
  };
}

// jsdom has no IntersectionObserver; provide an inert stub so the scroll-spy
// effect can wire up without throwing. (Spy behavior itself is covered by
// pickActivePageId unit tests + e2e.)
class IOStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", IOStub);
  useUIStore.setState({ selectedNodeId: null });
  useDocumentStore.getState().reset("title: T", doc(), null, null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Notelets container", () => {
  it("renders the ToC sidebar and a page per node", async () => {
    render(<Notelets />);
    expect(screen.getByRole("tree", { name: "Table of contents" })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelectorAll("[data-page-id]")).toHaveLength(3);
    });
    // Heading for each node's page.
    expect(screen.getByRole("heading", { name: "Root" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Subject 2" })).toBeInTheDocument();
  });

  it("shows the empty state when there is no document", () => {
    useDocumentStore.getState().reset("garbage", null, null, null);
    render(<Notelets />);
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing to show yet/)).toBeInTheDocument();
  });

  it("clicking a sidebar row scrolls its page into view", async () => {
    const scrollSpy = vi.fn();
    // jsdom's scrollIntoView is a no-op; spy on it to prove click-to-scroll.
    Element.prototype.scrollIntoView = scrollSpy;
    const user = userEvent.setup();
    render(<Notelets />);
    await user.click(screen.getByRole("treeitem", { name: "Subject 2" }));
    expect(useUIStore.getState().selectedNodeId).toBe("s2");
    expect(scrollSpy).toHaveBeenCalled();
  });

  describe("edit coordination", () => {
    const addNotesIn = (id: string) =>
      within(document.querySelector<HTMLElement>(`[data-page-id="${id}"]`)!).getByRole(
        "button",
        { name: /add notes/i },
      );

    it("clicking a page's add-notes affordance opens one editor for that page", async () => {
      const user = userEvent.setup();
      render(<Notelets />);
      await waitFor(() => expect(addNotesIn("s2")).toBeInTheDocument());
      await user.click(addNotesIn("s2"));
      const editors = screen.getAllByTestId("page-editor");
      expect(editors).toHaveLength(1);
      expect(editors[0]).toHaveTextContent("s2");
      // The edited node is also selected.
      expect(useUIStore.getState().selectedNodeId).toBe("s2");
    });

    it("edits only one page at a time", async () => {
      const user = userEvent.setup();
      render(<Notelets />);
      await waitFor(() => expect(addNotesIn("s1")).toBeInTheDocument());
      await user.click(addNotesIn("s1"));
      expect(screen.getAllByTestId("page-editor")).toHaveLength(1);
      // s2 still shows its affordance (not editing); clicking it moves the editor.
      await user.click(addNotesIn("s2"));
      const editors = screen.getAllByTestId("page-editor");
      expect(editors).toHaveLength(1);
      expect(editors[0]).toHaveTextContent("s2");
    });

    it("drops the editor if the edited page disappears from the doc", async () => {
      const user = userEvent.setup();
      render(<Notelets />);
      await waitFor(() => expect(addNotesIn("s2")).toBeInTheDocument());
      await user.click(addNotesIn("s2"));
      expect(screen.getByTestId("page-editor")).toHaveTextContent("s2");
      // Replace the doc with one that no longer contains s2.
      act(() => {
        useDocumentStore.getState().reset(
          "title: T",
          {
            title: "T",
            root: { id: "root", text: "Root", children: [{ id: "s1", text: "Subject 1", children: [] }] },
          },
          null,
          null,
        );
      });
      expect(screen.queryByTestId("page-editor")).not.toBeInTheDocument();
    });
  });
});
