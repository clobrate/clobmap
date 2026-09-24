// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NoteletsSidebar } from "../NoteletsSidebar";
import { useUIStore } from "../../store/ui";
import { flattenPages } from "../../lib/notelets";
import type { MindNode } from "../../model";

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
  useUIStore.setState({ selectedNodeId: null });
});
afterEach(cleanup);

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
});
