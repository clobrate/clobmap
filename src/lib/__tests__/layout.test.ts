import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_HEIGHT, DEFAULT_MAX_WIDTH, layoutMindMap } from "../layout";
import type { MindDocument } from "../../model";

function tree(): MindDocument {
  return {
    title: "T",
    root: {
      id: "n1",
      text: "Root",
      children: [
        { id: "n2", text: "A", children: [{ id: "n3", text: "A1", children: [] }] },
        { id: "n4", text: "B", children: [] },
      ],
    },
  };
}

describe("layoutMindMap", () => {
  it("emits one node per tree node and one edge per parent-child pair", () => {
    const { nodes, edges } = layoutMindMap(tree());
    expect(nodes).toHaveLength(4);
    expect(edges).toHaveLength(3);
    expect(nodes.map((n) => n.id).sort()).toEqual(["n1", "n2", "n3", "n4"]);
  });

  it("marks the root and tags depth correctly", () => {
    const { nodes } = layoutMindMap(tree());
    const root = nodes.find((n) => n.id === "n1");
    const leaf = nodes.find((n) => n.id === "n3");
    expect(root?.data.isRoot).toBe(true);
    expect(root?.data.depth).toBe(0);
    expect(leaf?.data.isRoot).toBe(false);
    expect(leaf?.data.depth).toBe(2);
  });

  it("flags hasChildren on internal nodes", () => {
    const { nodes } = layoutMindMap(tree());
    const a = nodes.find((n) => n.id === "n2");
    const b = nodes.find((n) => n.id === "n4");
    expect(a?.data.hasChildren).toBe(true);
    expect(b?.data.hasChildren).toBe(false);
  });

  it("hides descendants under a collapsed node", () => {
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
    const { nodes, edges } = layoutMindMap(collapsed);
    expect(nodes.map((n) => n.id).sort()).toEqual(["n1", "n2"]);
    expect(edges).toHaveLength(1);
    const a = nodes.find((n) => n.id === "n2");
    expect(a?.data.hiddenChildCount).toBe(1);
    expect(a?.data.collapsed).toBe(true);
  });

  it("produces deterministic positions for identical input", () => {
    const a = layoutMindMap(tree());
    const b = layoutMindMap(tree());
    expect(a.nodes.map((n) => n.position)).toEqual(b.nodes.map((n) => n.position));
  });

  it("places children to the right of their parent (LR layout)", () => {
    const { nodes } = layoutMindMap(tree());
    const root = nodes.find((n) => n.id === "n1");
    const child = nodes.find((n) => n.id === "n2");
    expect(root && child && root.position.x < child.position.x).toBe(true);
  });

  it("exposes canonical default dimensions", () => {
    expect(DEFAULT_MAX_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_MAX_HEIGHT).toBeGreaterThan(0);
  });

  it("emits resolved maxWidth / maxHeight on each node's data", () => {
    const { nodes } = layoutMindMap(tree());
    for (const n of nodes) {
      expect(n.data.maxWidth).toBe(DEFAULT_MAX_WIDTH);
      expect(n.data.maxHeight).toBe(DEFAULT_MAX_HEIGHT);
    }
  });

  it("honors per-node maxWidth / maxHeight overrides", () => {
    const doc: MindDocument = {
      title: "T",
      root: {
        id: "n1",
        text: "Root",
        maxWidth: 400,
        maxHeight: 300,
        children: [],
      },
    };
    const { nodes } = layoutMindMap(doc);
    const root = nodes.find((n) => n.id === "n1");
    expect(root?.data.maxWidth).toBe(400);
    expect(root?.data.maxHeight).toBe(300);
  });

  describe("manual layout mode", () => {
    function manualDoc(): MindDocument {
      return {
        title: "T",
        layoutMode: "manual",
        root: {
          id: "n1",
          text: "Root",
          position: { x: 100, y: 100 },
          children: [
            {
              id: "n2",
              text: "Has position",
              position: { x: 400, y: 200 },
              children: [],
            },
            { id: "n3", text: "No position", children: [] },
          ],
        },
      };
    }

    it("honors stored positions verbatim", () => {
      const { nodes } = layoutMindMap(manualDoc());
      const root = nodes.find((n) => n.id === "n1");
      const positioned = nodes.find((n) => n.id === "n2");
      expect(root?.position).toEqual({ x: 100, y: 100 });
      expect(positioned?.position).toEqual({ x: 400, y: 200 });
    });

    it("falls back to a parent-relative offset for new nodes without position", () => {
      const { nodes } = layoutMindMap(manualDoc());
      const orphan = nodes.find((n) => n.id === "n3");
      // Should land somewhere to the right of, and below, its parent (n1).
      const root = nodes.find((n) => n.id === "n1");
      expect(orphan).toBeDefined();
      expect(root).toBeDefined();
      if (!orphan || !root) return;
      expect(orphan.position.x).toBeGreaterThan(root.position.x);
      expect(orphan.position.y).toBeGreaterThan(root.position.y);
    });

    it("doesn't run the tidy-tree algorithm in manual mode", () => {
      // Tidy-tree would place root at MARGIN_X = 24. Manual mode honors
      // the stored x: 100 instead.
      const { nodes } = layoutMindMap(manualDoc());
      expect(nodes.find((n) => n.id === "n1")?.position.x).toBe(100);
    });

    it("still emits one edge per parent-child pair", () => {
      const { edges } = layoutMindMap(manualDoc());
      expect(edges).toHaveLength(2);
    });
  });

  describe("hasNotes flag", () => {
    function withNotes(notes: string | undefined): MindDocument {
      return {
        title: "T",
        root: { id: "n1", text: "Root", notes, children: [] },
      };
    }

    it("is true when notes is a non-empty string", () => {
      const { nodes } = layoutMindMap(withNotes("Some notes content"));
      expect(nodes[0]?.data.hasNotes).toBe(true);
    });

    it("is false when notes is undefined", () => {
      const { nodes } = layoutMindMap(withNotes(undefined));
      expect(nodes[0]?.data.hasNotes).toBe(false);
    });

    it("is false when notes is an all-whitespace string", () => {
      const { nodes } = layoutMindMap(withNotes("   \n\t  "));
      expect(nodes[0]?.data.hasNotes).toBe(false);
    });
  });
});
