import { describe, expect, it } from "vitest";
import type { MindNode } from "../../model";
import { flattenPages, nextPageId, prevPageId, subjectsOf } from "../notelets";

/** Terse node builder: n(id, ...children). */
function n(id: string, ...children: MindNode[]): MindNode {
  return { id, text: id.toUpperCase(), children };
}

/**
 * A representative tree:
 *   root
 *   ├─ s1 (Subject)
 *   │   ├─ p1
 *   │   │   └─ c1        (grandchild — infinite depth)
 *   │   └─ p2
 *   └─ s2 (Subject)
 *       └─ p3
 */
function sampleTree(): MindNode {
  return n(
    "root",
    n("s1", n("p1", n("c1")), n("p2")),
    n("s2", n("p3")),
  );
}

describe("flattenPages", () => {
  it("returns a single page for a childless root", () => {
    const pages = flattenPages(n("root"));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ depth: 0, subjectId: null });
    expect(pages[0]!.node.id).toBe("root");
  });

  it("emits pages in depth-first (pre-order) order", () => {
    const ids = flattenPages(sampleTree()).map((p) => p.node.id);
    expect(ids).toEqual(["root", "s1", "p1", "c1", "p2", "s2", "p3"]);
  });

  it("assigns depth by distance from the root", () => {
    const byId = new Map(flattenPages(sampleTree()).map((p) => [p.node.id, p.depth]));
    expect(byId.get("root")).toBe(0);
    expect(byId.get("s1")).toBe(1);
    expect(byId.get("p1")).toBe(2);
    expect(byId.get("c1")).toBe(3);
    expect(byId.get("p3")).toBe(1 + 1); // s2 → p3
  });

  it("attributes each page to its top-level Subject (root has none)", () => {
    const byId = new Map(flattenPages(sampleTree()).map((p) => [p.node.id, p.subjectId]));
    expect(byId.get("root")).toBeNull();
    // Subjects belong to themselves.
    expect(byId.get("s1")).toBe("s1");
    expect(byId.get("s2")).toBe("s2");
    // Descendants inherit their subject, however deep.
    expect(byId.get("p1")).toBe("s1");
    expect(byId.get("c1")).toBe("s1");
    expect(byId.get("p2")).toBe("s1");
    expect(byId.get("p3")).toBe("s2");
  });

  it("handles arbitrarily deep (recursive) nesting", () => {
    // root → a → b → c → d
    const deep = n("root", n("a", n("b", n("c", n("d")))));
    const pages = flattenPages(deep);
    expect(pages.map((p) => p.node.id)).toEqual(["root", "a", "b", "c", "d"]);
    expect(pages.map((p) => p.depth)).toEqual([0, 1, 2, 3, 4]);
    // Everything under the single subject "a" is attributed to it.
    expect(pages.slice(1).every((p) => p.subjectId === "a")).toBe(true);
  });
});

describe("subjectsOf", () => {
  it("returns the root's direct children", () => {
    expect(subjectsOf(sampleTree()).map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("returns an empty array for a childless root", () => {
    expect(subjectsOf(n("root"))).toEqual([]);
  });

  it("returns a copy — mutating the result does not touch the tree", () => {
    const root = sampleTree();
    const subjects = subjectsOf(root);
    subjects.pop();
    expect(root.children).toHaveLength(2);
  });
});

describe("nextPageId / prevPageId", () => {
  const pages = flattenPages(sampleTree());
  // Order: root, s1, p1, c1, p2, s2, p3

  it("nextPageId returns the following page in order", () => {
    expect(nextPageId(pages, "root")).toBe("s1");
    expect(nextPageId(pages, "c1")).toBe("p2");
  });

  it("nextPageId returns null at the last page", () => {
    expect(nextPageId(pages, "p3")).toBeNull();
  });

  it("nextPageId returns null for an unknown id", () => {
    expect(nextPageId(pages, "nope")).toBeNull();
  });

  it("prevPageId returns the preceding page in order", () => {
    expect(prevPageId(pages, "s1")).toBe("root");
    expect(prevPageId(pages, "p2")).toBe("c1");
  });

  it("prevPageId returns null at the first page", () => {
    expect(prevPageId(pages, "root")).toBeNull();
  });

  it("prevPageId returns null for an unknown id", () => {
    expect(prevPageId(pages, "nope")).toBeNull();
  });

  it("both return null on a single-page document", () => {
    const solo = flattenPages(n("root"));
    expect(nextPageId(solo, "root")).toBeNull();
    expect(prevPageId(solo, "root")).toBeNull();
  });
});
