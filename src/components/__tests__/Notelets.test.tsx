// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { findById, type MindDocument } from "../../model";

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
  useUIStore.setState({ selectedNodeId: null, noteletsMode: "scroll", noteletsPageId: null });
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

  describe("reading mode", () => {
    it("the toggle reflects the current mode", () => {
      useUIStore.setState({ noteletsMode: "page" });
      render(<Notelets />);
      expect(screen.getByRole("tab", { name: "Page" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "Scroll" })).toHaveAttribute("aria-selected", "false");
    });

    it("clicking Page switches to one-page mode (a single page renders)", async () => {
      const user = userEvent.setup();
      render(<Notelets />);
      await waitFor(() => expect(document.querySelectorAll("[data-page-id]")).toHaveLength(3));
      await user.click(screen.getByRole("tab", { name: "Page" }));
      expect(useUIStore.getState().noteletsMode).toBe("page");
      await waitFor(() => expect(document.querySelectorAll("[data-page-id]")).toHaveLength(1));
    });

    it("clicking Scroll returns to continuous mode (all pages)", async () => {
      const user = userEvent.setup();
      useUIStore.setState({ noteletsMode: "page", selectedNodeId: "root" });
      render(<Notelets />);
      expect(document.querySelectorAll("[data-page-id]")).toHaveLength(1);
      await user.click(screen.getByRole("tab", { name: "Scroll" }));
      await waitFor(() => expect(document.querySelectorAll("[data-page-id]")).toHaveLength(3));
    });

    it("page mode shows the selected node's page", async () => {
      useUIStore.setState({ noteletsMode: "page", selectedNodeId: "s2" });
      render(<Notelets />);
      await waitFor(() => {
        const shown = document.querySelectorAll("[data-page-id]");
        expect(shown).toHaveLength(1);
        expect(shown[0]!.getAttribute("data-page-id")).toBe("s2");
      });
    });

    it("has Prev/Next controls and a position indicator; Prev disabled on the first page", () => {
      // Pages in depth-first order: root, s1, s2.
      useUIStore.setState({ noteletsMode: "page", selectedNodeId: "root" });
      render(<Notelets />);
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
    });

    it("Next advances and Prev goes back (selection follows)", async () => {
      const user = userEvent.setup();
      useUIStore.setState({ noteletsMode: "page", selectedNodeId: "root" });
      render(<Notelets />);
      await user.click(screen.getByRole("button", { name: "Next page" }));
      expect(useUIStore.getState().selectedNodeId).toBe("s1");
      await user.click(screen.getByRole("button", { name: "Previous page" }));
      expect(useUIStore.getState().selectedNodeId).toBe("root");
    });

    it("Next is disabled on the last page", () => {
      useUIStore.setState({ noteletsMode: "page", selectedNodeId: "s2" });
      render(<Notelets />);
      expect(screen.getByText("3 / 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    });

    it("ArrowRight / ArrowLeft page in page mode", () => {
      useUIStore.setState({ noteletsMode: "page", selectedNodeId: "root" });
      render(<Notelets />);
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(useUIStore.getState().selectedNodeId).toBe("s1");
      fireEvent.keyDown(window, { key: "ArrowLeft" });
      expect(useUIStore.getState().selectedNodeId).toBe("root");
    });

    it("paging announces the new page title for screen readers", () => {
      useUIStore.setState({ noteletsMode: "page", selectedNodeId: "root", liveAnnouncement: "" });
      render(<Notelets />);
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(useUIStore.getState().liveAnnouncement).toBe("Subject 1");
    });

    it("arrow paging is inert while a page is being edited", async () => {
      const user = userEvent.setup();
      useUIStore.setState({ noteletsMode: "page", selectedNodeId: "s2" });
      render(<Notelets />);
      // Enter edit on the current page (stubbed editor focuses nothing, but
      // activeEditingId is set, which is what the guard checks).
      await user.click(await screen.findByRole("button", { name: /add notes/i }));
      fireEvent.keyDown(window, { key: "ArrowLeft" });
      expect(useUIStore.getState().selectedNodeId).toBe("s2"); // did not page
    });
  });

  describe("subject tabs", () => {
    it("shows an Overview tab and one per subject", () => {
      render(<Notelets />);
      const tabs = within(screen.getByRole("tablist", { name: "Subjects" })).getAllByRole("tab");
      expect(tabs.map((t) => t.textContent)).toEqual(["Overview", "Subject 1", "Subject 2"]);
    });

    it("Overview is active on the root page", () => {
      useUIStore.setState({ selectedNodeId: "root" });
      render(<Notelets />);
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    });

    it("a subject tab is active when its page is current", () => {
      useUIStore.setState({ selectedNodeId: "s2" });
      render(<Notelets />);
      expect(screen.getByRole("tab", { name: "Subject 2" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "false");
    });

    it("clicking a subject tab selects that subject", async () => {
      const user = userEvent.setup();
      useUIStore.setState({ noteletsMode: "page", selectedNodeId: "root" });
      render(<Notelets />);
      await user.click(screen.getByRole("tab", { name: "Subject 1" }));
      expect(useUIStore.getState().selectedNodeId).toBe("s1");
    });

    it("clicking the Overview tab navigates to the root page", async () => {
      const user = userEvent.setup();
      useUIStore.setState({ noteletsMode: "page", selectedNodeId: "s2" });
      render(<Notelets />);
      await user.click(screen.getByRole("tab", { name: "Overview" }));
      expect(useUIStore.getState().selectedNodeId).toBe("root");
    });
  });

  describe("mobile ToC drawer", () => {
    const openDrawer = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole("button", { name: "Show table of contents" }));
      return screen.getByRole("dialog", { name: "Table of contents" });
    };

    it("opens a drawer with the tree; selecting a row navigates and closes it", async () => {
      const user = userEvent.setup();
      render(<Notelets />);
      const dialog = await openDrawer(user);
      await user.click(within(dialog).getByRole("treeitem", { name: "Subject 2" }));
      expect(useUIStore.getState().selectedNodeId).toBe("s2");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("Esc closes the drawer", async () => {
      const user = userEvent.setup();
      render(<Notelets />);
      await openDrawer(user);
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("clicking the backdrop closes the drawer", async () => {
      const user = userEvent.setup();
      render(<Notelets />);
      const dialog = await openDrawer(user);
      await user.click(dialog.firstElementChild as HTMLElement); // the backdrop
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("undo / redo", () => {
    const childCount = (id: string) =>
      findById(useDocumentStore.getState().parsedDoc!, id)!.children.length;

    const exists = (id: string) => findById(useDocumentStore.getState().parsedDoc!, id) !== null;

    it("Cmd+Z undoes / Cmd+Shift+Z redoes a structural edit", () => {
      // Delete (not Tab) so no rename input is focused — the window handler
      // skips undo while a text field owns focus (tested separately below).
      useUIStore.setState({ selectedNodeId: "s1" });
      render(<Notelets />);
      fireEvent.keyDown(screen.getByRole("tree"), { key: "Delete" });
      expect(exists("s1")).toBe(false);
      fireEvent.keyDown(window, { key: "z", metaKey: true });
      expect(exists("s1")).toBe(true); // undone
      fireEvent.keyDown(window, { key: "z", metaKey: true, shiftKey: true });
      expect(exists("s1")).toBe(false); // redone
    });

    it("does not undo while a text input owns focus (editor keeps its own undo)", () => {
      useUIStore.setState({ selectedNodeId: "s2" });
      render(<Notelets />);
      fireEvent.keyDown(screen.getByRole("tree"), { key: "Tab" });
      expect(childCount("s2")).toBe(1);
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();
      fireEvent.keyDown(window, { key: "z", metaKey: true });
      expect(childCount("s2")).toBe(1); // undo skipped — input owns Cmd+Z
      input.remove();
    });
  });
});
