// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NoteletsSidebar } from "../NoteletsSidebar";
import { useUIStore } from "../../store/ui";
import { useDocumentStore } from "../../store/document";
import { flattenPages } from "../../lib/notelets";
import { findById, type MindNode } from "../../model";

// root → s1 (→ p1), s2
function tree(): MindNode {
  return {
    id: "root",
    text: "Root",
    children: [
      { id: "s1", text: "Subject 1", children: [{ id: "p1", text: "Page 1", children: [] }] },
      { id: "s2", text: "Subject 2", children: [] },
    ],
  };
}
const PAGES = flattenPages(tree()); // root, s1, p1, s2

beforeEach(() => {
  useUIStore.setState({ selectedNodeId: null, editingNodeId: null });
  useDocumentStore.getState().reset("t", { title: "T", root: tree() }, null, null);
});
afterEach(cleanup);

/** The live document tree after edits. */
const liveDoc = () => useDocumentStore.getState().parsedDoc!;

describe("NoteletsSidebar", () => {
  it("renders an ARIA tree with a treeitem per page, leveled by depth", () => {
    render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
    expect(screen.getByRole("tree", { name: "Table of contents" })).toBeInTheDocument();
    const items = screen.getAllByRole("treeitem");
    expect(items).toHaveLength(4);
    expect(screen.getByRole("treeitem", { name: "Root" })).toHaveAttribute("aria-level", "1");
    expect(screen.getByRole("treeitem", { name: "Subject 1" })).toHaveAttribute("aria-level", "2");
    expect(screen.getByRole("treeitem", { name: "Page 1" })).toHaveAttribute("aria-level", "3");
  });

  it("clicking a row selects it (store) and calls onNavigate", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<NoteletsSidebar pages={PAGES} onNavigate={onNavigate} />);
    await user.click(screen.getByRole("treeitem", { name: "Page 1" }));
    expect(useUIStore.getState().selectedNodeId).toBe("p1");
    expect(onNavigate).toHaveBeenCalledWith("p1");
  });

  it("marks the selected row aria-selected", () => {
    useUIStore.setState({ selectedNodeId: "s2" });
    render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
    expect(screen.getByRole("treeitem", { name: "Subject 2" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("treeitem", { name: "Root" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("ArrowDown / ArrowUp move the selection in depth-first order", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    useUIStore.setState({ selectedNodeId: "root" });
    render(<NoteletsSidebar pages={PAGES} onNavigate={onNavigate} />);
    const rootItem = screen.getByRole("treeitem", { name: "Root" });
    rootItem.focus();
    await user.keyboard("{ArrowDown}");
    expect(useUIStore.getState().selectedNodeId).toBe("s1");
    await user.keyboard("{ArrowUp}");
    expect(useUIStore.getState().selectedNodeId).toBe("root");
    expect(onNavigate).toHaveBeenLastCalledWith("root");
  });

  it("Home / End jump to the first / last page", async () => {
    const user = userEvent.setup();
    useUIStore.setState({ selectedNodeId: "s1" });
    render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
    screen.getByRole("treeitem", { name: "Subject 1" }).focus();
    await user.keyboard("{End}");
    expect(useUIStore.getState().selectedNodeId).toBe("s2");
    await user.keyboard("{Home}");
    expect(useUIStore.getState().selectedNodeId).toBe("root");
  });

  it("ArrowDown with nothing selected picks the first page", async () => {
    const user = userEvent.setup();
    render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
    // With no selection the first row is the tab entry point.
    const first = screen.getByRole("treeitem", { name: "Root" });
    first.focus();
    await user.keyboard("{ArrowDown}");
    expect(useUIStore.getState().selectedNodeId).toBe("root");
  });

  describe("structural editing", () => {
    // fireEvent (not userEvent) so raw key events reach the tree's onKeyDown
    // without userEvent's focus side-effects (e.g. Tab moving focus).
    const press = (key: string, opts: Record<string, unknown> = {}) =>
      fireEvent.keyDown(screen.getByRole("tree"), { key, ...opts });

    it("Tab adds a child to the selected node and enters rename", () => {
      useUIStore.setState({ selectedNodeId: "s2" });
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      press("Tab");
      const s2 = findById(liveDoc(), "s2")!;
      expect(s2.children).toHaveLength(1);
      expect(s2.children[0]!.text).toBe("New");
      const newId = s2.children[0]!.id;
      expect(useUIStore.getState().selectedNodeId).toBe(newId);
      expect(useUIStore.getState().editingNodeId).toBe(newId);
    });

    it("Shift+Tab does not add a child (focus escape hatch)", () => {
      useUIStore.setState({ selectedNodeId: "s2" });
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      press("Tab", { shiftKey: true });
      expect(findById(liveDoc(), "s2")!.children).toHaveLength(0);
    });

    it("Enter adds a sibling after the selected node", () => {
      useUIStore.setState({ selectedNodeId: "p1" });
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      press("Enter");
      expect(findById(liveDoc(), "s1")!.children.map((c) => c.text)).toEqual(["Page 1", "New"]);
    });

    it("Enter on the root is a no-op (root has no sibling)", () => {
      useUIStore.setState({ selectedNodeId: "root" });
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      press("Enter");
      expect(findById(liveDoc(), "root")!.children).toHaveLength(2);
    });

    it("Delete removes the node and selects the row above", () => {
      useUIStore.setState({ selectedNodeId: "p1" });
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      press("Delete");
      expect(findById(liveDoc(), "p1")).toBeNull();
      // Order was [root, s1, p1, s2] → row above p1 is s1.
      expect(useUIStore.getState().selectedNodeId).toBe("s1");
    });

    it("Delete on the root is a no-op", () => {
      useUIStore.setState({ selectedNodeId: "root" });
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      press("Delete");
      expect(findById(liveDoc(), "root")).not.toBeNull();
    });

    it("F2 enters rename on the selected node", () => {
      useUIStore.setState({ selectedNodeId: "s1" });
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      press("F2");
      expect(useUIStore.getState().editingNodeId).toBe("s1");
    });

    it("shows a rename input for the node being edited and commits on Enter", async () => {
      const user = userEvent.setup();
      useUIStore.setState({ selectedNodeId: "s1", editingNodeId: "s1" });
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      const input = screen.getByRole("textbox", { name: "Rename node" });
      await user.clear(input);
      await user.type(input, "Renamed{Enter}");
      expect(findById(liveDoc(), "s1")!.text).toBe("Renamed");
      expect(useUIStore.getState().editingNodeId).toBeNull();
    });

    it("cancels rename on Esc without changing the text", async () => {
      const user = userEvent.setup();
      useUIStore.setState({ selectedNodeId: "s1", editingNodeId: "s1" });
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      const input = screen.getByRole("textbox", { name: "Rename node" });
      await user.clear(input);
      await user.type(input, "Discarded{Escape}");
      expect(findById(liveDoc(), "s1")!.text).toBe("Subject 1");
      expect(useUIStore.getState().editingNodeId).toBeNull();
    });

    it("commits on blur", async () => {
      const user = userEvent.setup();
      useUIStore.setState({ selectedNodeId: "s2", editingNodeId: "s2" });
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      const input = screen.getByRole("textbox", { name: "Rename node" });
      await user.clear(input);
      await user.type(input, "Blurred");
      input.blur();
      expect(findById(liveDoc(), "s2")!.text).toBe("Blurred");
    });

    it("double-clicking a row enters rename", async () => {
      const user = userEvent.setup();
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      await user.dblClick(screen.getByRole("treeitem", { name: "Subject 2" }));
      expect(useUIStore.getState().editingNodeId).toBe("s2");
    });

    it("Alt+ArrowDown reorders the selected node among its siblings", () => {
      useUIStore.setState({ selectedNodeId: "s1" });
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      press("ArrowDown", { altKey: true });
      expect(findById(liveDoc(), "root")!.children.map((c) => c.id)).toEqual(["s2", "s1"]);
    });

    it("Delete removes the whole subtree", () => {
      useUIStore.setState({ selectedNodeId: "s1" });
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      press("Delete");
      expect(findById(liveDoc(), "s1")).toBeNull();
      expect(findById(liveDoc(), "p1")).toBeNull(); // child gone too
    });

    it("ignores structural keys held with a modifier (bubbles to undo handler)", () => {
      useUIStore.setState({ selectedNodeId: "s2" });
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      press("Enter", { metaKey: true }); // Cmd+Enter must NOT add a sibling
      expect(findById(liveDoc(), "root")!.children).toHaveLength(2);
    });

    it("dragging a row onto another reparents it (DnD → moveNode wiring)", () => {
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      const p1 = screen.getByRole("treeitem", { name: "Page 1" });
      const s2 = screen.getByRole("treeitem", { name: "Subject 2" });
      // jsdom getBoundingClientRect is all zeros → the drop resolves to the
      // middle ("onto"), so p1 becomes a child of s2. (Precise before/after
      // drop offsets are covered by the dropPlan unit tests + e2e.)
      const dt = { setData: () => {}, effectAllowed: "", dropEffect: "" };
      fireEvent.dragStart(p1, { dataTransfer: dt });
      fireEvent.dragOver(s2, { dataTransfer: dt });
      fireEvent.drop(s2, { dataTransfer: dt });
      expect(findById(liveDoc(), "s2")!.children.map((c) => c.id)).toContain("p1");
      expect(findById(liveDoc(), "s1")!.children.map((c) => c.id)).not.toContain("p1");
    });

    it("dropping a row onto its own descendant is a no-op (cycle guard)", () => {
      render(<NoteletsSidebar pages={PAGES} onNavigate={() => {}} />);
      const s1 = screen.getByRole("treeitem", { name: "Subject 1" });
      const p1 = screen.getByRole("treeitem", { name: "Page 1" }); // p1 is under s1
      const dt = { setData: () => {}, effectAllowed: "", dropEffect: "" };
      fireEvent.dragStart(s1, { dataTransfer: dt });
      fireEvent.drop(p1, { dataTransfer: dt });
      // s1 stays where it was; p1 keeps its parent.
      expect(findById(liveDoc(), "root")!.children.map((c) => c.id)).toEqual(["s1", "s2"]);
      expect(findById(liveDoc(), "s1")!.children.map((c) => c.id)).toEqual(["p1"]);
    });
  });
});
