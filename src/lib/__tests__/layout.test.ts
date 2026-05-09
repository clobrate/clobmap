import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_HEIGHT,
  DEFAULT_MAX_WIDTH,
  layoutMindMap,
  materializeManualPositions,
} from "../layout";
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
      // Should land to the right of its parent and within roughly one
      // node-height of the parent's vertical center (a lone no-position
      // child centers on the parent — see the symmetric-distribution
      // test below).
      const root = nodes.find((n) => n.id === "n1");
      expect(orphan).toBeDefined();
      expect(root).toBeDefined();
      if (!orphan || !root) return;
      expect(orphan.position.x).toBeGreaterThan(root.position.x);
      expect(Math.abs(orphan.position.y - root.position.y)).toBeLessThanOrEqual(
        root.data.maxHeight,
      );
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

    it("centers a block of no-position siblings on the parent's vertical midpoint (north + south, not all south)", () => {
      const doc: MindDocument = {
        title: "T",
        layoutMode: "manual",
        root: {
          id: "n1",
          text: "Root",
          position: { x: 0, y: 0 },
          children: [
            { id: "n2", text: "A", children: [] },
            { id: "n3", text: "B", children: [] },
            { id: "n4", text: "C", children: [] },
            { id: "n5", text: "D", children: [] },
          ],
        },
      };
      const { nodes } = layoutMindMap(doc);
      const root = nodes.find((n) => n.id === "n1")!;
      const ys = ["n2", "n3", "n4", "n5"]
        .map((id) => nodes.find((n) => n.id === id)?.position.y ?? Number.NaN)
        .sort((a, b) => a - b);
      // The block is centered: at least one sibling sits above the
      // parent and at least one sits below.
      expect(ys[0]).toBeLessThan(root.position.y);
      expect(ys[ys.length - 1]!).toBeGreaterThan(root.position.y);
    });

    it("falls back to MARGIN_X / MARGIN_Y when the root has no stored position", () => {
      const doc: MindDocument = {
        title: "T",
        layoutMode: "manual",
        root: {
          id: "n1",
          text: "Root",
          children: [{ id: "n2", text: "A", children: [] }],
        },
      };
      const { nodes } = layoutMindMap(doc);
      const root = nodes.find((n) => n.id === "n1");
      // Hard-coded MARGIN_X/Y in layout.ts is 24/24.
      expect(root?.position).toEqual({ x: 24, y: 24 });
    });

    it("skips child placement when a parent is collapsed", () => {
      const doc: MindDocument = {
        title: "T",
        layoutMode: "manual",
        root: {
          id: "n1",
          text: "Root",
          position: { x: 0, y: 0 },
          children: [
            {
              id: "n2",
              text: "Collapsed parent",
              position: { x: 200, y: 0 },
              collapsed: true,
              children: [
                { id: "n3", text: "hidden", position: { x: 999, y: 999 }, children: [] },
              ],
            },
          ],
        },
      };
      const { nodes, edges } = layoutMindMap(doc);
      // Collapsed parent renders; its child is not emitted.
      expect(nodes.map((n) => n.id).sort()).toEqual(["n1", "n2"]);
      expect(edges).toHaveLength(1);
      const collapsedParent = nodes.find((n) => n.id === "n2");
      expect(collapsedParent?.data.collapsed).toBe(true);
      // descendantCount surfaces as the hidden-children badge.
      expect(collapsedParent?.data.hiddenChildCount).toBe(1);
    });

    it("returns early when the root itself is collapsed", () => {
      const doc: MindDocument = {
        title: "T",
        layoutMode: "manual",
        root: {
          id: "n1",
          text: "Root",
          position: { x: 0, y: 0 },
          collapsed: true,
          children: [{ id: "n2", text: "A", position: { x: 100, y: 0 }, children: [] }],
        },
      };
      const { nodes, edges } = layoutMindMap(doc);
      expect(nodes.map((n) => n.id)).toEqual(["n1"]);
      expect(edges).toHaveLength(0);
    });

    it("staggers multiple no-position siblings vertically (regression: stacked-on-top bug)", () => {
      const doc: MindDocument = {
        title: "T",
        layoutMode: "manual",
        root: {
          id: "n1",
          text: "Root",
          position: { x: 0, y: 0 },
          children: [
            // Three freshly-added Enter siblings, none with a stored
            // position. Before the fix, all three landed at the same
            // (x, y) and visually stacked.
            { id: "n2", text: "A", children: [] },
            { id: "n3", text: "B", children: [] },
            { id: "n4", text: "C", children: [] },
          ],
        },
      };
      const { nodes } = layoutMindMap(doc);
      const ys = ["n2", "n3", "n4"].map(
        (id) => nodes.find((n) => n.id === id)?.position.y ?? Number.NaN,
      );
      expect(ys[0]).toBeLessThan(ys[1]!);
      expect(ys[1]!).toBeLessThan(ys[2]!);
    });
  });

  describe("per-edge handle sides", () => {
    it("defaults to source: right (parent side), target: left (child side)", () => {
      const { edges } = layoutMindMap(tree());
      for (const e of edges) {
        expect(e.sourceHandle).toBe("source-right");
        expect(e.targetHandle).toBe("target-left");
      }
    });

    it("each child has its own per-edge endpoint config", () => {
      const doc: MindDocument = {
        title: "T",
        root: {
          id: "n1",
          text: "R",
          children: [
            { id: "n2", text: "A", edgeFrom: "bottom", edgeTo: "top", children: [] },
            { id: "n3", text: "B", edgeFrom: "right", edgeTo: "left", children: [] },
          ],
        },
      };
      const { edges } = layoutMindMap(doc);
      const ea = edges.find((e) => e.target === "n2");
      const eb = edges.find((e) => e.target === "n3");
      expect(ea?.sourceHandle).toBe("source-bottom");
      expect(ea?.targetHandle).toBe("target-top");
      expect(eb?.sourceHandle).toBe("source-right");
      expect(eb?.targetHandle).toBe("target-left");
    });

    it("emits a node-level outgoingSides union of every child's edgeFrom", () => {
      const doc: MindDocument = {
        title: "T",
        root: {
          id: "n1",
          text: "R",
          children: [
            { id: "n2", text: "A", edgeFrom: "bottom", children: [] },
            { id: "n3", text: "B", edgeFrom: "bottom", children: [] }, // same side
            { id: "n4", text: "C", edgeFrom: "right", children: [] },
          ],
        },
      };
      const { nodes } = layoutMindMap(doc);
      const root = nodes.find((n) => n.id === "n1");
      expect(root?.data.outgoingSides).toEqual(["bottom", "right"]);
    });

    it("emits incomingSide on each non-root node", () => {
      const doc: MindDocument = {
        title: "T",
        root: {
          id: "n1",
          text: "R",
          children: [{ id: "n2", text: "A", edgeTo: "top", children: [] }],
        },
      };
      const { nodes } = layoutMindMap(doc);
      const a = nodes.find((n) => n.id === "n2");
      expect(a?.data.incomingSide).toBe("top");
    });

    it("attaches a markerEnd arrow to every edge for direction visibility", () => {
      const { edges } = layoutMindMap(tree());
      for (const e of edges) {
        expect(e.markerEnd).toBeTruthy();
      }
    });
  });

  describe("materializeManualPositions", () => {
    function mixedDoc(): MindDocument {
      return {
        title: "T",
        root: {
          id: "n1",
          text: "Root",
          position: { x: 50, y: 60 }, // stored
          children: [
            { id: "n2", text: "A", position: { x: 200, y: 100 }, children: [] }, // stored
            { id: "n3", text: "B", children: [] }, // unset → falls back to auto
          ],
        },
      };
    }

    it("keeps every existing position and gap-fills the rest from auto-layout", () => {
      const filled = materializeManualPositions(mixedDoc());
      const root = filled.root;
      const n2 = root.children[0]!;
      const n3 = root.children[1]!;
      expect(root.position).toEqual({ x: 50, y: 60 });
      expect(n2.position).toEqual({ x: 200, y: 100 });
      // n3 had no stored position — it should now have one (from auto).
      expect(n3.position).toBeDefined();
      expect(typeof n3.position?.x).toBe("number");
      expect(typeof n3.position?.y).toBe("number");
    });

    it("override wins over a stored position", () => {
      const overrides = new Map([["n2", { x: 999, y: 888 }]]);
      const filled = materializeManualPositions(mixedDoc(), overrides);
      expect(filled.root.children[0]?.position).toEqual({ x: 999, y: 888 });
      // n1 still has its stored position.
      expect(filled.root.position).toEqual({ x: 50, y: 60 });
    });

    it("leaves nodes hidden under a collapsed ancestor without a fallback position", () => {
      // Auto-layout doesn't recurse into collapsed branches, so its
      // position map has no entry for `hidden`. With no override and no
      // stored position, materializeManualPositions has nothing to set.
      const doc: MindDocument = {
        title: "T",
        root: {
          id: "n1",
          text: "Root",
          children: [
            {
              id: "n2",
              text: "Collapsed",
              collapsed: true,
              children: [{ id: "hidden", text: "Hidden", children: [] }],
            },
          ],
        },
      };
      const filled = materializeManualPositions(doc);
      // Visible nodes get auto-derived positions.
      expect(filled.root.position).toBeDefined();
      expect(filled.root.children[0]?.position).toBeDefined();
      // The hidden descendant has nothing to fall back to.
      expect(filled.root.children[0]?.children[0]?.position).toBeUndefined();
    });

    it("populates positions for a doc that has none yet", () => {
      const fresh: MindDocument = {
        title: "T",
        root: {
          id: "n1",
          text: "Root",
          children: [
            { id: "n2", text: "A", children: [] },
            { id: "n3", text: "B", children: [] },
          ],
        },
      };
      const filled = materializeManualPositions(fresh);
      expect(filled.root.position).toBeDefined();
      expect(filled.root.children[0]?.position).toBeDefined();
      expect(filled.root.children[1]?.position).toBeDefined();
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
