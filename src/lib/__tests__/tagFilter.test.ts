import { describe, expect, it } from "vitest";
import { buildFilterTree, UNTAGGED_ID, UNTAGGED_LABEL } from "../tagFilter";
import type { MindDocument } from "../../model";

function fixture(): MindDocument {
  return {
    title: "Doc",
    root: {
      id: "n1",
      text: "Root",
      children: [
        { id: "n2", text: "A", tags: ["alpha"], children: [] },
        { id: "n3", text: "B", tags: ["alpha", "beta"], children: [] },
        { id: "n4", text: "C", tags: ["beta"], children: [] },
        { id: "n5", text: "D", children: [] }, // untagged
      ],
    },
    tagRoot: {
      id: "t1",
      name: "tags",
      children: [
        {
          id: "t2",
          name: "alpha",
          children: [{ id: "t3", name: "alpha-sub", children: [] }],
        },
        { id: "t4", name: "beta", children: [] },
      ],
    },
  };
}

describe("buildFilterTree", () => {
  it("returns null when filterTagId isn't found in the tree", () => {
    expect(buildFilterTree(fixture(), "missing")).toBeNull();
  });

  it("returns null when the doc has no tag tree", () => {
    const doc: MindDocument = { title: "T", root: { id: "n1", text: "r", children: [] } };
    expect(buildFilterTree(doc, "anything")).toBeNull();
  });

  it("roots at the selected tag-node and includes its tag-tree descendants", () => {
    const result = buildFilterTree(fixture(), "t2");
    expect(result?.kind).toBe("tag");
    if (result?.kind !== "tag") return;
    expect(result.id).toBe("t2");
    expect(result.name).toBe("alpha");
    // alpha-sub is included as a descendant tag-node child.
    const subtag = result.children.find((c) => c.kind === "tag");
    expect(subtag?.kind === "tag" && subtag.name).toBe("alpha-sub");
  });

  it("lists every data-node tagged with the selected tag (case-insensitive)", () => {
    const result = buildFilterTree(fixture(), "t2");
    if (result?.kind !== "tag") return;
    const dataIds = result.children
      .filter((c) => c.kind === "data")
      .map((c) => (c.kind === "data" ? c.underlyingId : ""));
    // n2 (tags: alpha) and n3 (tags: alpha, beta) — both should be under alpha.
    expect(dataIds).toEqual(expect.arrayContaining(["n2", "n3"]));
    // n4 (tags: beta only) should NOT be here.
    expect(dataIds).not.toContain("n4");
  });

  it("duplicates a data-node under each matching tag-node (no dedup)", () => {
    const alpha = buildFilterTree(fixture(), "t2");
    const beta = buildFilterTree(fixture(), "t4");
    if (alpha?.kind !== "tag" || beta?.kind !== "tag") return;
    const alphaIds = alpha.children
      .filter((c) => c.kind === "data")
      .map((c) => (c.kind === "data" ? c.underlyingId : ""));
    const betaIds = beta.children
      .filter((c) => c.kind === "data")
      .map((c) => (c.kind === "data" ? c.underlyingId : ""));
    // n3 has both tags, appears under both filter roots.
    expect(alphaIds).toContain("n3");
    expect(betaIds).toContain("n3");
  });

  it("scopes the React Flow id by parent tag (so duplicates don't collide)", () => {
    const alpha = buildFilterTree(fixture(), "t2");
    if (alpha?.kind !== "tag") return;
    const dataEntry = alpha.children.find(
      (c) => c.kind === "data" && c.underlyingId === "n3",
    );
    expect(dataEntry?.id).toBe("t2::n3");
  });

  it("appends an Untagged pseudo-node as the final sibling when there's at least one untagged data-node", () => {
    const result = buildFilterTree(fixture(), "t2");
    if (result?.kind !== "tag") return;
    const lastChild = result.children[result.children.length - 1];
    expect(lastChild?.kind).toBe("untagged");
    if (lastChild?.kind !== "untagged") return;
    expect(lastChild.id).toBe(UNTAGGED_ID);
    // Both Root (n1, no tags) and n5 (no tags) belong to the bucket —
    // the rule is "every data-node with empty/absent tags", which is
    // case-sensitive about untaggedness, not about depth.
    expect(lastChild.children.map((c) => (c.kind === "data" ? c.underlyingId : ""))).toEqual([
      "n1",
      "n5",
    ]);
  });

  it("omits the Untagged bucket entirely when every data-node is tagged", () => {
    const doc: MindDocument = {
      title: "Doc",
      root: {
        id: "n1",
        text: "Root",
        tags: ["alpha"],
        children: [{ id: "n2", text: "A", tags: ["alpha"], children: [] }],
      },
      tagRoot: {
        id: "t1",
        name: "tags",
        children: [{ id: "t2", name: "alpha", children: [] }],
      },
    };
    const result = buildFilterTree(doc, "t2");
    if (result?.kind !== "tag") return;
    expect(result.children.some((c) => c.kind === "untagged")).toBe(false);
  });

  it("synthetic-root selection labels the root 'All tags'", () => {
    const result = buildFilterTree(fixture(), "t1");
    if (result?.kind !== "tag") return;
    expect(result.name).toBe("All tags");
  });

  it("Untagged label is consistent for use in renderers", () => {
    expect(UNTAGGED_LABEL).toBe("Untagged");
  });
});
