import { describe, expect, it } from "vitest";
import {
  addChild,
  addSibling,
  cloneWithNewIds,
  deleteNode,
  duplicateNode,
  emptyDocument,
  findById,
  clearAllPositions,
  moveNode,
  setLayoutMode,
  setPositions,
  OpError,
  updateNode,
  updateText,
} from "../ops";
import { createIdGenerator, idGeneratorForDocument } from "../ids";
import { SCHEMA_VERSION, type MindDocument } from "../types";

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
    let doc = updateNode(fixture(), "n3", { note: "hi", color: "#ccc", collapsed: true });
    let n = findById(doc, "n3");
    expect(n?.note).toBe("hi");
    expect(n?.color).toBe("#ccc");
    expect(n?.collapsed).toBe(true);

    doc = updateNode(doc, "n3", { note: "", color: "", collapsed: false });
    n = findById(doc, "n3");
    expect(n?.note).toBeUndefined();
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

  it("only clears keys actually present in the patch (omitted keys are preserved)", () => {
    let doc = updateNode(fixture(), "n3", {
      note: "hover",
      color: "#abc",
      maxWidth: 200,
      notes: "long",
    });
    // Patch with only `text` shouldn't touch the others.
    doc = updateNode(doc, "n3", { text: "renamed" });
    const n = findById(doc, "n3");
    expect(n?.text).toBe("renamed");
    expect(n?.note).toBe("hover");
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
      note: "n",
      color: "#abc",
      collapsed: true,
      children: [{ id: "c", text: "child", children: [] }],
    };
    const clone = cloneWithNewIds(source, ids);
    expect(clone.text).toBe("Hi");
    expect(clone.note).toBe("n");
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

  it("switches to auto and strips every node's position", () => {
    const seed = fixture();
    seed.layoutMode = "manual";
    seed.root.position = { x: 0, y: 0 };
    seed.root.children[0]!.position = { x: 100, y: 50 };
    seed.root.children[1]!.position = { x: 200, y: 50 };
    const next = setLayoutMode(seed, "auto");
    expect(next.layoutMode).toBeUndefined();
    expect(next.root.position).toBeUndefined();
    expect(next.root.children[0]?.position).toBeUndefined();
    expect(next.root.children[1]?.position).toBeUndefined();
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
