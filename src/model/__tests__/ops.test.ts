import { describe, expect, it } from "vitest";
import {
  addChild,
  addSibling,
  cloneWithNewIds,
  deleteNode,
  duplicateNode,
  emptyDocument,
  findById,
  findTagById,
  clearAllPositions,
  moveNode,
  moveSibling,
  setLayoutMode,
  setPositions,
  OpError,
  tagsAdd,
  tagsRemove,
  tagDelete,
  updateTagName,
  moveTagNode,
  moveTagSibling,
  updateNode,
  updateText,
} from "../ops";
import { createIdGenerator, idGeneratorForDocument } from "../ids";
import { SCHEMA_VERSION, type MindDocument, type TagNode } from "../types";

function fixture(): MindDocument {
  return {
    title: "Test",
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
      ],
    },
  };
}

describe("findById", () => {
  it("finds the root", () => {
    expect(findById(fixture(), "n1")?.id).toBe("n1");
  });

  it("finds a leaf", () => {
    expect(findById(fixture(), "n3")?.text).toBe("A1");
  });

  it("returns null for a missing id", () => {
    expect(findById(fixture(), "missing")).toBeNull();
  });
});

describe("addChild", () => {
  it("appends by default", () => {
    const ids = idGeneratorForDocument(fixture());
    const { doc, newId } = addChild(fixture(), "n2", "A3", ids);
    const parent = findById(doc, "n2");
    expect(parent?.children.length).toBe(3);
    expect(parent?.children[2]?.id).toBe(newId);
  });

  it("inserts at a specific index", () => {
    const { doc, newId } = addChild(fixture(), "n2", "A0", createIdGenerator(10), 0);
    const parent = findById(doc, "n2");
    expect(parent?.children[0]?.id).toBe(newId);
    expect(parent?.children[0]?.text).toBe("A0");
  });

  it("clamps an out-of-range index", () => {
    const { doc, newId } = addChild(fixture(), "n2", "x", createIdGenerator(10), 100);
    const parent = findById(doc, "n2");
    expect(parent?.children[parent.children.length - 1]?.id).toBe(newId);
  });

  it("throws when parent not found", () => {
    expect(() => addChild(fixture(), "missing", "x", createIdGenerator())).toThrow(OpError);
  });

  it("does not mutate input", () => {
    const original = fixture();
    addChild(original, "n2", "x", createIdGenerator(10));
    expect(original.root.children[0]?.children.length).toBe(2);
  });
});

describe("addSibling", () => {
  it("inserts after the sibling", () => {
    const { doc, newId } = addSibling(fixture(), "n3", "A1.5", createIdGenerator(10));
    const parent = findById(doc, "n2");
    expect(parent?.children.map((c) => c.id)).toEqual(["n3", newId, "n4"]);
  });

  it("rejects adding a sibling to root", () => {
    expect(() => addSibling(fixture(), "n1", "x", createIdGenerator())).toThrow(OpError);
  });

  it("rejects unknown sibling id", () => {
    expect(() => addSibling(fixture(), "missing", "x", createIdGenerator())).toThrow(OpError);
  });
});

describe("deleteNode", () => {
  it("removes a leaf", () => {
    const doc = deleteNode(fixture(), "n3");
    expect(findById(doc, "n3")).toBeNull();
    expect(findById(doc, "n2")?.children.length).toBe(1);
  });

  it("removes a subtree", () => {
    const doc = deleteNode(fixture(), "n2");
    expect(findById(doc, "n2")).toBeNull();
    expect(findById(doc, "n3")).toBeNull();
    expect(findById(doc, "n4")).toBeNull();
  });

  it("rejects deleting the root", () => {
    expect(() => deleteNode(fixture(), "n1")).toThrow(OpError);
  });

  it("rejects unknown id", () => {
    expect(() => deleteNode(fixture(), "missing")).toThrow(OpError);
  });
});

describe("updateText", () => {
  it("replaces the text", () => {
    const doc = updateText(fixture(), "n3", "A1*");
    expect(findById(doc, "n3")?.text).toBe("A1*");
  });

  it("rejects unknown id", () => {
    expect(() => updateText(fixture(), "missing", "x")).toThrow(OpError);
  });

  it("does not mutate input", () => {
    const original = fixture();
    updateText(original, "n3", "changed");
    expect(findById(original, "n3")?.text).toBe("A1");
  });
});

describe("updateNode", () => {
  it("sets and clears optional fields", () => {
    let doc = updateNode(fixture(), "n3", { color: "#ccc", collapsed: true });
    let n = findById(doc, "n3");
    expect(n?.color).toBe("#ccc");
    expect(n?.collapsed).toBe(true);

    doc = updateNode(doc, "n3", { color: "", collapsed: false });
    n = findById(doc, "n3");
    expect(n?.color).toBeUndefined();
    expect(n?.collapsed).toBeUndefined();
  });

  it("can update text via patch", () => {
    const doc = updateNode(fixture(), "n3", { text: "renamed" });
    expect(findById(doc, "n3")?.text).toBe("renamed");
  });

  it("rejects unknown id", () => {
    expect(() => updateNode(fixture(), "missing", { text: "x" })).toThrow(OpError);
  });

  it("sets and clears maxWidth / maxHeight", () => {
    let doc = updateNode(fixture(), "n3", { maxWidth: 320, maxHeight: 180 });
    let n = findById(doc, "n3");
    expect(n?.maxWidth).toBe(320);
    expect(n?.maxHeight).toBe(180);

    // Explicit undefined removes the field entirely.
    doc = updateNode(doc, "n3", { maxWidth: undefined, maxHeight: undefined });
    n = findById(doc, "n3");
    expect(n?.maxWidth).toBeUndefined();
    expect(n?.maxHeight).toBeUndefined();
  });

  it("treats non-positive maxWidth / maxHeight as a clear request", () => {
    let doc = updateNode(fixture(), "n3", { maxWidth: 320, maxHeight: 180 });
    doc = updateNode(doc, "n3", { maxWidth: 0, maxHeight: -50 });
    const n = findById(doc, "n3");
    expect(n?.maxWidth).toBeUndefined();
    expect(n?.maxHeight).toBeUndefined();
  });

  it("sets and clears notes", () => {
    let doc = updateNode(fixture(), "n3", { notes: "Some longer Markdown text" });
    let n = findById(doc, "n3");
    expect(n?.notes).toBe("Some longer Markdown text");

    // Empty string clears the field.
    doc = updateNode(doc, "n3", { notes: "" });
    n = findById(doc, "n3");
    expect(n?.notes).toBeUndefined();
  });

  it("treats undefined notes as clear", () => {
    let doc = updateNode(fixture(), "n3", { notes: "x" });
    doc = updateNode(doc, "n3", { notes: undefined });
    expect(findById(doc, "n3")?.notes).toBeUndefined();
  });

  it("sets and clears position", () => {
    let doc = updateNode(fixture(), "n3", { position: { x: 12, y: 34 } });
    let n = findById(doc, "n3");
    expect(n?.position).toEqual({ x: 12, y: 34 });

    doc = updateNode(doc, "n3", { position: undefined });
    n = findById(doc, "n3");
    expect(n?.position).toBeUndefined();
  });

  it("copies position by value (does not retain caller reference)", () => {
    const p = { x: 1, y: 2 };
    const doc = updateNode(fixture(), "n3", { position: p });
    const stored = findById(doc, "n3")?.position;
    p.x = 999;
    expect(stored?.x).toBe(1);
  });

  it("sets and clears edgeFrom / edgeTo", () => {
    let doc = updateNode(fixture(), "n3", { edgeFrom: "bottom", edgeTo: "top" });
    let n = findById(doc, "n3");
    expect(n?.edgeFrom).toBe("bottom");
    expect(n?.edgeTo).toBe("top");

    doc = updateNode(doc, "n3", { edgeFrom: undefined, edgeTo: undefined });
    n = findById(doc, "n3");
    expect(n?.edgeFrom).toBeUndefined();
    expect(n?.edgeTo).toBeUndefined();
  });

  it("only clears keys actually present in the patch (omitted keys are preserved)", () => {
    let doc = updateNode(fixture(), "n3", {
      color: "#abc",
      maxWidth: 200,
      notes: "long",
    });
    // Patch with only `text` shouldn't touch the others.
    doc = updateNode(doc, "n3", { text: "renamed" });
    const n = findById(doc, "n3");
    expect(n?.text).toBe("renamed");
    expect(n?.color).toBe("#abc");
    expect(n?.maxWidth).toBe(200);
    expect(n?.notes).toBe("long");
  });
});

describe("moveNode", () => {
  it("moves a leaf to a new parent", () => {
    const doc = moveNode(fixture(), "n3", "n5");
    expect(findById(doc, "n2")?.children.map((c) => c.id)).toEqual(["n4"]);
    expect(findById(doc, "n5")?.children.map((c) => c.id)).toEqual(["n3"]);
  });

  it("moves a subtree", () => {
    const doc = moveNode(fixture(), "n2", "n5");
    expect(findById(doc, "n5")?.children[0]?.id).toBe("n2");
    expect(findById(doc, "n5")?.children[0]?.children.map((c) => c.id)).toEqual(["n3", "n4"]);
  });

  it("inserts at index", () => {
    const doc = moveNode(fixture(), "n3", "n1", 0);
    expect(doc.root.children.map((c) => c.id)).toEqual(["n3", "n2", "n5"]);
  });

  it("rejects moving root", () => {
    expect(() => moveNode(fixture(), "n1", "n5")).toThrow(OpError);
  });

  it("rejects moving into self", () => {
    expect(() => moveNode(fixture(), "n2", "n2")).toThrow(OpError);
  });

  it("rejects moving into own descendant", () => {
    expect(() => moveNode(fixture(), "n2", "n3")).toThrow(OpError);
  });

  it("rejects unknown source", () => {
    expect(() => moveNode(fixture(), "missing", "n5")).toThrow(OpError);
  });

  it("rejects unknown target parent", () => {
    expect(() => moveNode(fixture(), "n3", "missing")).toThrow(OpError);
  });
});

describe("moveSibling", () => {
  it("moves a node up among its siblings", () => {
    const doc = moveSibling(fixture(), "n4", "up");
    expect(findById(doc, "n2")?.children.map((c) => c.id)).toEqual(["n4", "n3"]);
  });

  it("moves a node down among its siblings", () => {
    const doc = moveSibling(fixture(), "n3", "down");
    expect(findById(doc, "n2")?.children.map((c) => c.id)).toEqual(["n4", "n3"]);
  });

  it("is a no-op when already at the top", () => {
    const seed = fixture();
    const doc = moveSibling(seed, "n3", "up");
    expect(doc).toBe(seed);
  });

  it("is a no-op when already at the bottom", () => {
    const seed = fixture();
    const doc = moveSibling(seed, "n4", "down");
    expect(doc).toBe(seed);
  });

  it("rejects moving the root", () => {
    expect(() => moveSibling(fixture(), "n1", "up")).toThrow(OpError);
  });

  it("rejects an unknown id", () => {
    expect(() => moveSibling(fixture(), "missing", "down")).toThrow(OpError);
  });

  it("does not mutate the input", () => {
    const original = fixture();
    moveSibling(original, "n3", "down");
    expect(original.root.children[0]?.children.map((c) => c.id)).toEqual(["n3", "n4"]);
  });

  it("preserves the moved subtree's children", () => {
    const seed: MindDocument = {
      title: "T",
      root: {
        id: "r",
        text: "Root",
        children: [
          { id: "a", text: "A", children: [{ id: "a1", text: "A1", children: [] }] },
          { id: "b", text: "B", children: [] },
        ],
      },
    };
    const doc = moveSibling(seed, "a", "down");
    expect(doc.root.children.map((c) => c.id)).toEqual(["b", "a"]);
    expect(findById(doc, "a")?.children.map((c) => c.id)).toEqual(["a1"]);
  });
});

describe("cloneWithNewIds", () => {
  it("regenerates ids for the entire subtree", () => {
    const ids = createIdGenerator(100);
    const original = fixture().root.children[0]!; // n2 with n3, n4
    const clone = cloneWithNewIds(original, ids);
    const collect = (n: typeof clone): string[] => [n.id, ...n.children.flatMap(collect)];
    const newIds = collect(clone);
    expect(newIds).not.toContain("n2");
    expect(newIds).not.toContain("n3");
    expect(newIds).not.toContain("n4");
    expect(new Set(newIds).size).toBe(newIds.length);
  });

  it("preserves text and optional fields on every node", () => {
    const ids = createIdGenerator(100);
    const source = {
      id: "src",
      text: "Hi",
      color: "#abc",
      collapsed: true,
      children: [{ id: "c", text: "child", children: [] }],
    };
    const clone = cloneWithNewIds(source, ids);
    expect(clone.text).toBe("Hi");
    expect(clone.color).toBe("#abc");
    expect(clone.collapsed).toBe(true);
    expect(clone.children[0]!.text).toBe("child");
  });
});

describe("duplicateNode", () => {
  it("inserts a clone with new ids immediately after the source", () => {
    const ids = createIdGenerator(100);
    const result = duplicateNode(fixture(), "n2", ids);
    const root = result.doc.root;
    const idsInOrder = root.children.map((c) => c.id);
    const sourceIdx = idsInOrder.indexOf("n2");
    expect(idsInOrder[sourceIdx + 1]).toBe(result.newId);
  });

  it("rejects duplicating root", () => {
    expect(() => duplicateNode(fixture(), "n1", createIdGenerator())).toThrow(OpError);
  });

  it("rejects unknown id", () => {
    expect(() => duplicateNode(fixture(), "missing", createIdGenerator())).toThrow(OpError);
  });

  it("clone preserves child structure and texts", () => {
    const ids = createIdGenerator(100);
    const result = duplicateNode(fixture(), "n2", ids);
    const dup = findById(result.doc, result.newId)!;
    expect(dup.children.map((c) => c.text).sort()).toEqual(["A1", "A2"]);
  });
});

describe("emptyDocument", () => {
  it("creates a document with a single root", () => {
    const doc = emptyDocument();
    expect(doc.root.children).toEqual([]);
    expect(doc.root.id).toBe("n1");
  });

  it("stamps the current schema version", () => {
    expect(emptyDocument().version).toBe(SCHEMA_VERSION);
  });

  it("uses the supplied id generator", () => {
    const ids = createIdGenerator(5);
    const doc = emptyDocument("hi", ids);
    expect(doc.root.id).toBe("n6");
  });
});

describe("setLayoutMode", () => {
  it("switches to manual without altering positions", () => {
    const seed = fixture();
    seed.root.children[0]!.position = { x: 100, y: 50 };
    const next = setLayoutMode(seed, "manual");
    expect(next.layoutMode).toBe("manual");
    // Existing position preserved
    expect(next.root.children[0]?.position).toEqual({ x: 100, y: 50 });
  });

  it("switches to auto without stripping manual fields (so manual round-trips)", () => {
    const seed = fixture();
    seed.layoutMode = "manual";
    seed.root.position = { x: 0, y: 0 };
    seed.root.children[0]!.position = { x: 100, y: 50 };
    seed.root.children[0]!.edgeFrom = "bottom";
    seed.root.children[0]!.edgeTo = "top";
    const next = setLayoutMode(seed, "auto");
    expect(next.layoutMode).toBeUndefined();
    // Stored positions + per-edge sides are PRESERVED so a later
    // switch back to manual restores the user's prior arrangement.
    // The layout function ignores them while in auto mode.
    expect(next.root.position).toEqual({ x: 0, y: 0 });
    expect(next.root.children[0]?.position).toEqual({ x: 100, y: 50 });
    expect(next.root.children[0]?.edgeFrom).toBe("bottom");
    expect(next.root.children[0]?.edgeTo).toBe("top");
  });

  it("manual → auto → manual round-trip preserves positions exactly", () => {
    const seed = fixture();
    seed.layoutMode = "manual";
    seed.root.position = { x: 5, y: 7 };
    seed.root.children[0]!.position = { x: 110, y: 220 };
    const after = setLayoutMode(setLayoutMode(seed, "auto"), "manual");
    expect(after.layoutMode).toBe("manual");
    expect(after.root.position).toEqual({ x: 5, y: 7 });
    expect(after.root.children[0]?.position).toEqual({ x: 110, y: 220 });
  });

  it("is a no-op when the mode is already what's asked for", () => {
    const seed = fixture();
    expect(setLayoutMode(seed, "auto")).toBe(seed);
    seed.layoutMode = "manual";
    expect(setLayoutMode(seed, "manual")).toBe(seed);
  });

  it("does not mutate the input tree", () => {
    const seed = fixture();
    seed.layoutMode = "manual";
    seed.root.position = { x: 1, y: 2 };
    setLayoutMode(seed, "auto");
    // Original retains its layoutMode and positions.
    expect(seed.layoutMode).toBe("manual");
    expect(seed.root.position).toEqual({ x: 1, y: 2 });
  });
});

describe("setPositions", () => {
  it("applies every (id → position) pair", () => {
    const positions = new Map([
      ["n1", { x: 0, y: 0 }],
      ["n3", { x: 250, y: 80 }],
    ]);
    const next = setPositions(fixture(), positions);
    expect(next.root.position).toEqual({ x: 0, y: 0 });
    const a = findById(next, "n3");
    expect(a?.position).toEqual({ x: 250, y: 80 });
    // Untouched ids stay without a position.
    const b = findById(next, "n4");
    expect(b?.position).toBeUndefined();
  });

  it("ignores ids that aren't in the tree", () => {
    const positions = new Map([["nothing-here", { x: 1, y: 2 }]]);
    const next = setPositions(fixture(), positions);
    // Tree shape unchanged.
    expect(next.root.id).toBe("n1");
    // No new fields anywhere.
    expect(next.root.position).toBeUndefined();
  });
});

describe("clearAllPositions", () => {
  it("strips position from every node but keeps layoutMode", () => {
    const seed = fixture();
    seed.layoutMode = "manual";
    seed.root.position = { x: 0, y: 0 };
    seed.root.children[0]!.position = { x: 100, y: 50 };
    const next = clearAllPositions(seed);
    expect(next.layoutMode).toBe("manual");
    expect(next.root.position).toBeUndefined();
    expect(next.root.children[0]?.position).toBeUndefined();
  });
});

describe("tagsAdd", () => {
  it("materializes tagRoot lazily on first call", () => {
    const seed = fixture();
    expect(seed.tagRoot).toBeUndefined();
    const next = tagsAdd(seed, "n3", ["urgent"], idGeneratorForDocument(seed));
    expect(next.tagRoot).toBeDefined();
    expect(next.tagRoot!.children.map((c) => c.name)).toEqual(["urgent"]);
    expect(findById(next, "n3")?.tags).toEqual(["urgent"]);
  });

  it("appends a new top-level tag-node only when the name isn't in the tree", () => {
    const seed = fixture();
    let next = tagsAdd(seed, "n3", ["urgent"], idGeneratorForDocument(seed));
    next = tagsAdd(next, "n4", ["URGENT"], idGeneratorForDocument(next));
    // Same name (case-insensitive) → no duplicate tag-node.
    expect(next.tagRoot!.children.length).toBe(1);
    expect(findById(next, "n4")?.tags).toEqual(["URGENT"]);
  });

  it("preserves the user-typed casing on the data-node", () => {
    const seed = fixture();
    let next = tagsAdd(seed, "n3", ["Urgent"], idGeneratorForDocument(seed));
    next = tagsAdd(next, "n4", ["URGENT"], idGeneratorForDocument(next));
    expect(findById(next, "n3")?.tags).toEqual(["Urgent"]);
    expect(findById(next, "n4")?.tags).toEqual(["URGENT"]);
  });

  it("rejects empty / whitespace-only names", () => {
    expect(() =>
      tagsAdd(fixture(), "n3", [""], idGeneratorForDocument(fixture())),
    ).toThrow(OpError);
    expect(() =>
      tagsAdd(fixture(), "n3", ["   "], idGeneratorForDocument(fixture())),
    ).toThrow(OpError);
  });

  it("rejects duplicates within the input array (case-insensitive)", () => {
    expect(() =>
      tagsAdd(fixture(), "n3", ["a", "A"], idGeneratorForDocument(fixture())),
    ).toThrow(OpError);
  });

  it("rejects missing node", () => {
    expect(() =>
      tagsAdd(fixture(), "missing", ["x"], idGeneratorForDocument(fixture())),
    ).toThrow(OpError);
  });

  it("re-adding the same tag on the same node is a silent no-op for that name", () => {
    const seed = fixture();
    let next = tagsAdd(seed, "n3", ["urgent"], idGeneratorForDocument(seed));
    next = tagsAdd(next, "n3", ["urgent"], idGeneratorForDocument(next));
    expect(findById(next, "n3")?.tags).toEqual(["urgent"]);
  });

  it("does not mutate the input doc", () => {
    const seed = fixture();
    tagsAdd(seed, "n3", ["urgent"], idGeneratorForDocument(seed));
    expect(seed.tagRoot).toBeUndefined();
    expect(findById(seed, "n3")?.tags).toBeUndefined();
  });
});

describe("tagsRemove", () => {
  it("removes the listed tag names from the data-node", () => {
    let doc = fixture();
    doc = tagsAdd(doc, "n3", ["a", "b", "c"], idGeneratorForDocument(doc));
    doc = tagsRemove(doc, "n3", ["b"]);
    expect(findById(doc, "n3")?.tags).toEqual(["a", "c"]);
  });

  it("strips the tags key entirely when the last tag is removed", () => {
    let doc = fixture();
    doc = tagsAdd(doc, "n3", ["x"], idGeneratorForDocument(doc));
    doc = tagsRemove(doc, "n3", ["x"]);
    expect(findById(doc, "n3")?.tags).toBeUndefined();
  });

  it("leaves the tag tree intact", () => {
    let doc = fixture();
    doc = tagsAdd(doc, "n3", ["urgent"], idGeneratorForDocument(doc));
    doc = tagsRemove(doc, "n3", ["urgent"]);
    expect(doc.tagRoot!.children.map((c) => c.name)).toEqual(["urgent"]);
  });

  it("is case-insensitive on match", () => {
    let doc = fixture();
    doc = tagsAdd(doc, "n3", ["Urgent"], idGeneratorForDocument(doc));
    doc = tagsRemove(doc, "n3", ["URGENT"]);
    expect(findById(doc, "n3")?.tags).toBeUndefined();
  });

  it("is a no-op when the tag isn't present", () => {
    const seed = fixture();
    const next = tagsRemove(seed, "n3", ["nonexistent"]);
    expect(next).toBe(seed);
  });

  it("rejects missing node", () => {
    expect(() => tagsRemove(fixture(), "missing", ["x"])).toThrow(OpError);
  });
});

describe("tagDelete", () => {
  it("removes the tag-node from the tree and strips it from every data-node", () => {
    let doc = fixture();
    const ids = idGeneratorForDocument(doc);
    doc = tagsAdd(doc, "n3", ["urgent"], ids);
    doc = tagsAdd(doc, "n4", ["urgent", "logistics"], ids);
    const urgent = doc.tagRoot!.children.find((c) => c.name === "urgent")!;
    const after = tagDelete(doc, urgent.id);
    expect(after.tagRoot!.children.map((c) => c.name)).toEqual(["logistics"]);
    expect(findById(after, "n3")?.tags).toBeUndefined();
    expect(findById(after, "n4")?.tags).toEqual(["logistics"]);
  });

  it("cascades through descendant tag-nodes (their names also stripped)", () => {
    let doc = fixture();
    const ids = idGeneratorForDocument(doc);
    doc = tagsAdd(doc, "n3", ["parent", "child"], ids);
    // Nest "child" under "parent" by hand to simulate a hierarchy.
    const parent = doc.tagRoot!.children.find((c) => c.name === "parent")!;
    const child = doc.tagRoot!.children.find((c) => c.name === "child")!;
    const restructured: MindDocument = {
      ...doc,
      tagRoot: {
        ...doc.tagRoot!,
        children: [{ ...parent, children: [child] }],
      },
    };
    const after = tagDelete(restructured, parent.id);
    expect(after.tagRoot!.children).toEqual([]);
    expect(findById(after, "n3")?.tags).toBeUndefined();
  });

  it("rejects when there is no tag tree", () => {
    expect(() => tagDelete(fixture(), "anything")).toThrow(OpError);
  });

  it("rejects when the target id is the tag-tree root itself", () => {
    let doc = fixture();
    doc = tagsAdd(doc, "n3", ["x"], idGeneratorForDocument(doc));
    expect(() => tagDelete(doc, doc.tagRoot!.id)).toThrow(OpError);
  });

  it("rejects unknown tag-node id", () => {
    let doc = fixture();
    doc = tagsAdd(doc, "n3", ["x"], idGeneratorForDocument(doc));
    expect(() => tagDelete(doc, "missing")).toThrow(OpError);
  });

  it("does not mutate the input doc", () => {
    let doc = fixture();
    doc = tagsAdd(doc, "n3", ["x"], idGeneratorForDocument(doc));
    const x = doc.tagRoot!.children[0]!;
    const before = JSON.stringify(doc);
    tagDelete(doc, x.id);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe("findTagById", () => {
  it("returns null when the doc has no tag tree", () => {
    expect(findTagById(fixture(), "anything")).toBeNull();
  });

  it("finds the synthetic tag-root and any descendant tag-node by id", () => {
    let doc = fixture();
    doc = tagsAdd(doc, "n3", ["alpha"], idGeneratorForDocument(doc));
    const rootId = doc.tagRoot!.id;
    const childId = doc.tagRoot!.children[0]!.id;
    expect(findTagById(doc, rootId)?.id).toBe(rootId);
    expect(findTagById(doc, childId)?.name).toBe("alpha");
  });
});

describe("idGeneratorForDocument with tagRoot", () => {
  it("seeds past the largest id across BOTH trees", () => {
    const doc: MindDocument = {
      title: "T",
      root: { id: "n1", text: "r", children: [] },
      tagRoot: {
        id: "n7",
        name: "tags",
        children: [{ id: "n9", name: "alpha", children: [] as TagNode[] }],
      },
    };
    const ids = idGeneratorForDocument(doc);
    // Next id should be n10 (the next base36 step after n9).
    expect(ids.next()).toBe("na");
  });
});

/**
 * Build a doc with a tag tree populated for the move/rename tests.
 * Tag-tree shape:
 *   tagRoot (synthetic)
 *     ├── parent
 *     │     └── child
 *     └── other
 */
function docWithTags(): MindDocument {
  let doc = fixture();
  const ids = idGeneratorForDocument(doc);
  doc = tagsAdd(doc, "n3", ["parent", "other"], ids);
  doc = tagsAdd(doc, "n4", ["child"], ids);
  // Manually nest "child" under "parent" to make a 2-deep tag tree.
  const parent = doc.tagRoot!.children.find((c) => c.name === "parent")!;
  const child = doc.tagRoot!.children.find((c) => c.name === "child")!;
  const other = doc.tagRoot!.children.find((c) => c.name === "other")!;
  return {
    ...doc,
    tagRoot: {
      ...doc.tagRoot!,
      children: [{ ...parent, children: [child] }, other],
    },
  };
}

describe("updateTagName", () => {
  it("renames a tag-node and rewrites every matching data-node tag", () => {
    const doc = docWithTags();
    const parent = doc.tagRoot!.children[0]!;
    const next = updateTagName(doc, parent.id, "renamed");
    const found = next.tagRoot!.children.find((c) => c.id === parent.id);
    expect(found?.name).toBe("renamed");
    expect(findById(next, "n3")?.tags).toEqual(["renamed", "other"]);
  });

  it("case-only rename leaves data-node tags alone (match is case-insensitive)", () => {
    const doc = docWithTags();
    const parent = doc.tagRoot!.children[0]!;
    const next = updateTagName(doc, parent.id, "PARENT");
    expect(next.tagRoot!.children.find((c) => c.id === parent.id)?.name).toBe("PARENT");
    // Data-node tags untouched (still match either way).
    expect(findById(next, "n3")?.tags).toEqual(["parent", "other"]);
  });

  it("no-op when the name is identical", () => {
    const doc = docWithTags();
    const parent = doc.tagRoot!.children[0]!;
    expect(updateTagName(doc, parent.id, "parent")).toBe(doc);
  });

  it("rejects blank names", () => {
    const doc = docWithTags();
    const parent = doc.tagRoot!.children[0]!;
    expect(() => updateTagName(doc, parent.id, "   ")).toThrow(OpError);
  });

  it("rejects collisions with another existing tag-node (case-insensitive)", () => {
    const doc = docWithTags();
    const parent = doc.tagRoot!.children[0]!;
    expect(() => updateTagName(doc, parent.id, "OTHER")).toThrow(OpError);
  });

  it("rejects on the tag-tree root", () => {
    const doc = docWithTags();
    expect(() => updateTagName(doc, doc.tagRoot!.id, "anything")).toThrow(OpError);
  });

  it("rejects on missing tag-node", () => {
    const doc = docWithTags();
    expect(() => updateTagName(doc, "missing", "x")).toThrow(OpError);
  });

  it("rejects when there is no tag tree", () => {
    expect(() => updateTagName(fixture(), "anything", "x")).toThrow(OpError);
  });
});

describe("moveTagNode", () => {
  it("re-parents a tag-node from one parent to another", () => {
    const doc = docWithTags();
    const parent = doc.tagRoot!.children[0]!;
    const child = parent.children[0]!;
    const other = doc.tagRoot!.children[1]!;
    const next = moveTagNode(doc, child.id, other.id);
    // child no longer under parent
    const newParent = next.tagRoot!.children.find((c) => c.id === parent.id);
    expect(newParent?.children.length).toBe(0);
    // child now under other
    const newOther = next.tagRoot!.children.find((c) => c.id === other.id);
    expect(newOther?.children.map((c) => c.name)).toEqual(["child"]);
  });

  it("re-parents to the tag-tree root (top-level)", () => {
    const doc = docWithTags();
    const parent = doc.tagRoot!.children[0]!;
    const child = parent.children[0]!;
    const next = moveTagNode(doc, child.id, doc.tagRoot!.id);
    // Tag-tree root now has 3 top-level children.
    expect(next.tagRoot!.children.map((c) => c.name)).toContain("child");
  });

  it("honors the index argument for ordered insertion", () => {
    const doc = docWithTags();
    const parent = doc.tagRoot!.children[0]!;
    const child = parent.children[0]!;
    const next = moveTagNode(doc, child.id, doc.tagRoot!.id, 0);
    // child was inserted at index 0 of tag-tree root.
    expect(next.tagRoot!.children[0]?.name).toBe("child");
  });

  it("rejects moving the tag-tree root", () => {
    const doc = docWithTags();
    expect(() => moveTagNode(doc, doc.tagRoot!.id, doc.tagRoot!.id)).toThrow(OpError);
  });

  it("rejects moving into self", () => {
    const doc = docWithTags();
    const parent = doc.tagRoot!.children[0]!;
    expect(() => moveTagNode(doc, parent.id, parent.id)).toThrow(OpError);
  });

  it("rejects moving into one of its own descendants (cycle)", () => {
    const doc = docWithTags();
    const parent = doc.tagRoot!.children[0]!;
    const child = parent.children[0]!;
    expect(() => moveTagNode(doc, parent.id, child.id)).toThrow(OpError);
  });

  it("rejects unknown source or target", () => {
    const doc = docWithTags();
    expect(() => moveTagNode(doc, "missing", doc.tagRoot!.id)).toThrow(OpError);
    const parent = doc.tagRoot!.children[0]!;
    expect(() => moveTagNode(doc, parent.id, "missing")).toThrow(OpError);
  });

  it("rejects when there is no tag tree", () => {
    expect(() => moveTagNode(fixture(), "a", "b")).toThrow(OpError);
  });
});

describe("moveTagSibling", () => {
  it("swaps with the previous sibling on up", () => {
    const doc = docWithTags();
    const other = doc.tagRoot!.children[1]!;
    const next = moveTagSibling(doc, other.id, "up");
    expect(next.tagRoot!.children.map((c) => c.name)).toEqual(["other", "parent"]);
  });

  it("swaps with the next sibling on down", () => {
    const doc = docWithTags();
    const parent = doc.tagRoot!.children[0]!;
    const next = moveTagSibling(doc, parent.id, "down");
    expect(next.tagRoot!.children.map((c) => c.name)).toEqual(["other", "parent"]);
  });

  it("is a no-op at the boundary (returns same doc)", () => {
    const doc = docWithTags();
    const parent = doc.tagRoot!.children[0]!;
    expect(moveTagSibling(doc, parent.id, "up")).toBe(doc);
    const other = doc.tagRoot!.children[1]!;
    expect(moveTagSibling(doc, other.id, "down")).toBe(doc);
  });

  it("rejects on the tag-tree root and unknown id", () => {
    const doc = docWithTags();
    expect(() => moveTagSibling(doc, doc.tagRoot!.id, "up")).toThrow(OpError);
    expect(() => moveTagSibling(doc, "missing", "up")).toThrow(OpError);
  });
});
