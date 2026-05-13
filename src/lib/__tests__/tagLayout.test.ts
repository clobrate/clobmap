import { describe, expect, it } from "vitest";
import { layoutTagTree } from "../tagLayout";
import type { MindDocument } from "../../model";

function emptyDataRoot() {
  return { id: "n1", text: "Root", children: [] };
}

describe("layoutTagTree", () => {
  it("returns empty arrays when there's no tag tree", () => {
    const doc: MindDocument = { title: "T", root: emptyDataRoot() };
    const result = layoutTagTree(doc);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("returns empty arrays when the tag tree has no children", () => {
    const doc: MindDocument = {
      title: "T",
      root: emptyDataRoot(),
      tagRoot: { id: "t1", name: "tags", children: [] },
    };
    const result = layoutTagTree(doc);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("emits a node for the synthetic root + each tag-node, with edges", () => {
    const doc: MindDocument = {
      title: "T",
      root: emptyDataRoot(),
      tagRoot: {
        id: "t1",
        name: "tags",
        children: [
          { id: "t2", name: "alpha", children: [] },
          { id: "t3", name: "beta", children: [{ id: "t4", name: "beta-1", children: [] }] },
        ],
      },
    };
    const result = layoutTagTree(doc);
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["t1", "t2", "t3", "t4"]);
    // 3 parent → child edges (t1→t2, t1→t3, t3→t4)
    expect(result.edges).toHaveLength(3);
  });

  it("places parent and child at different x positions", () => {
    const doc: MindDocument = {
      title: "T",
      root: emptyDataRoot(),
      tagRoot: {
        id: "t1",
        name: "tags",
        children: [
          { id: "t2", name: "alpha", children: [{ id: "t3", name: "alpha-1", children: [] }] },
        ],
      },
    };
    const { nodes } = layoutTagTree(doc);
    const t2 = nodes.find((n) => n.id === "t2")!;
    const t3 = nodes.find((n) => n.id === "t3")!;
    expect(t3.position.x).toBeGreaterThan(t2.position.x);
  });

  it("marks the synthetic root with isRoot: true and others with false", () => {
    const doc: MindDocument = {
      title: "T",
      root: emptyDataRoot(),
      tagRoot: {
        id: "t1",
        name: "tags",
        children: [{ id: "t2", name: "alpha", children: [] }],
      },
    };
    const { nodes } = layoutTagTree(doc);
    expect(nodes.find((n) => n.id === "t1")?.data.isRoot).toBe(true);
    expect(nodes.find((n) => n.id === "t2")?.data.isRoot).toBe(false);
  });

  it("sets hasChildren correctly for each tag-node", () => {
    const doc: MindDocument = {
      title: "T",
      root: emptyDataRoot(),
      tagRoot: {
        id: "t1",
        name: "tags",
        children: [
          { id: "t2", name: "with-kids", children: [{ id: "t3", name: "kid", children: [] }] },
          { id: "t4", name: "leaf", children: [] },
        ],
      },
    };
    const { nodes } = layoutTagTree(doc);
    expect(nodes.find((n) => n.id === "t2")?.data.hasChildren).toBe(true);
    expect(nodes.find((n) => n.id === "t4")?.data.hasChildren).toBe(false);
  });
});
