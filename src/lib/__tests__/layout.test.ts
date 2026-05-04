import { describe, expect, it } from "vitest";
import { layoutMindMap, NODE_HEIGHT, NODE_WIDTH } from "../layout";
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

  it("uses canonical node dimensions in the layout", () => {
    expect(NODE_WIDTH).toBeGreaterThan(0);
    expect(NODE_HEIGHT).toBeGreaterThan(0);
  });
});
