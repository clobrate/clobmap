import { describe, expect, it, vi } from "vitest";
import { navigateIntoChildren, navigateSibling, navigateToParent } from "../navigation";
import type { MindDocument } from "../../model";

function tree(): MindDocument {
  return {
    title: "T",
    root: {
      id: "n1",
      text: "Root",
      children: [
        {
          id: "n2",
          text: "A",
          children: [
            { id: "n3", text: "A1", children: [] },
            { id: "n4", text: "A2", children: [] },
          ],
        },
        { id: "n5", text: "B", children: [] },
        { id: "n6", text: "C", children: [] },
      ],
    },
  };
}

describe("navigation", () => {
  describe("navigateSibling", () => {
    it("moves to next sibling", () => {
      const t = navigateSibling(tree(), "n2", 1);
      expect(t?.id).toBe("n5");
      expect(t?.aria).toBe("sibling");
    });

    it("moves to previous sibling", () => {
      const t = navigateSibling(tree(), "n5", -1);
      expect(t?.id).toBe("n2");
    });

    it("returns null past the last sibling", () => {
      expect(navigateSibling(tree(), "n6", 1)).toBeNull();
    });

    it("returns null before the first sibling", () => {
      expect(navigateSibling(tree(), "n2", -1)).toBeNull();
    });

    it("returns null at root (no parent)", () => {
      expect(navigateSibling(tree(), "n1", 1)).toBeNull();
    });

    it("returns null for unknown id", () => {
      expect(navigateSibling(tree(), "missing", 1)).toBeNull();
    });
  });

  describe("navigateToParent", () => {
    it("moves to parent of a leaf", () => {
      const t = navigateToParent(tree(), "n3");
      expect(t?.id).toBe("n2");
      expect(t?.aria).toBe("parent");
    });

    it("returns null at root", () => {
      expect(navigateToParent(tree(), "n1")).toBeNull();
    });

    it("returns null for unknown id", () => {
      expect(navigateToParent(tree(), "missing")).toBeNull();
    });
  });

  describe("navigateIntoChildren", () => {
    it("moves to first child of an expanded node", () => {
      const apply = vi.fn();
      const t = navigateIntoChildren(tree(), "n2", apply);
      expect(t?.id).toBe("n3");
      expect(t?.aria).toBe("child");
      expect(apply).not.toHaveBeenCalled();
    });

    it("auto-expands a collapsed node and moves into it", () => {
      const collapsed: MindDocument = {
        title: "T",
        root: {
          id: "n1",
          text: "Root",
          children: [
            {
              id: "n2",
              text: "A",
              collapsed: true,
              children: [{ id: "n3", text: "A1", children: [] }],
            },
          ],
        },
      };
      const apply = vi.fn();
      const t = navigateIntoChildren(collapsed, "n2", apply);
      expect(t?.id).toBe("n3");
      expect(apply).toHaveBeenCalledTimes(1);
      // The applied tree should have n2.collapsed cleared (or set false).
      const next: MindDocument = apply.mock.calls[0]![0];
      const a = next.root.children[0]!;
      expect(a.collapsed).toBeFalsy();
    });

    it("returns null when the node has no children", () => {
      const apply = vi.fn();
      expect(navigateIntoChildren(tree(), "n5", apply)).toBeNull();
      expect(apply).not.toHaveBeenCalled();
    });

    it("returns null for unknown id", () => {
      const apply = vi.fn();
      expect(navigateIntoChildren(tree(), "missing", apply)).toBeNull();
    });
  });
});
