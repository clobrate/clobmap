import { describe, expect, it } from "vitest";
import {
  addChild,
  addSibling,
  deleteNode,
  emptyDocument,
  findById,
  moveNode,
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
