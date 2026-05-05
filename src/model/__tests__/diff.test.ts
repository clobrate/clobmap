import { describe, expect, it } from "vitest";
import { diffTrees } from "../diff";
import { addChild, deleteNode, moveNode, updateNode, updateText } from "../ops";
import { createIdGenerator } from "../ids";
import type { MindDocument } from "../types";

function fixture(): MindDocument {
  return {
    title: "T",
    root: {
      id: "n1",
      text: "Root",
      children: [
        {
          id: "n2",
          text: "A",
          children: [{ id: "n3", text: "A1", children: [] }],
        },
        { id: "n4", text: "B", children: [] },
      ],
    },
  };
}

describe("diffTrees", () => {
  it("returns no changes for identical trees", () => {
    expect(diffTrees(fixture(), fixture()).changes).toEqual([]);
  });

  it("detects added nodes", () => {
    const before = fixture();
    const { doc: after } = addChild(before, "n4", "B1", createIdGenerator(10));
    const changes = diffTrees(before, after).changes;
    expect(changes.find((c) => c.type === "added")).toBeTruthy();
  });

  it("detects removed nodes", () => {
    const before = fixture();
    const after = deleteNode(before, "n3");
    const changes = diffTrees(before, after).changes;
    const removed = changes.find((c) => c.type === "removed");
    expect(removed && "id" in removed && removed.id).toBe("n3");
  });

  it("detects moved nodes", () => {
    const before = fixture();
    const after = moveNode(before, "n3", "n4");
    const changes = diffTrees(before, after).changes;
    const moved = changes.find((c) => c.type === "moved");
    expect(moved && "fromParentId" in moved && moved.fromParentId).toBe("n2");
    expect(moved && "toParentId" in moved && moved.toParentId).toBe("n4");
  });

  it("detects text changes", () => {
    const before = fixture();
    const after = updateText(before, "n3", "renamed");
    const changes = diffTrees(before, after).changes;
    const t = changes.find((c) => c.type === "text");
    expect(t && "before" in t && t.before).toBe("A1");
    expect(t && "after" in t && t.after).toBe("renamed");
  });

  it("detects color changes", () => {
    const before = fixture();
    const after = updateNode(before, "n3", { color: "#ff0000" });
    const changes = diffTrees(before, after).changes;
    const f = changes.find((c) => c.type === "fields");
    expect(f && "changed" in f && f.changed).toEqual(["color"]);
  });

  it("detects field changes", () => {
    const before = fixture();
    const after = updateNode(before, "n3", { note: "x", collapsed: true });
    const changes = diffTrees(before, after).changes;
    const f = changes.find((c) => c.type === "fields");
    expect(f && "changed" in f && f.changed).toEqual(expect.arrayContaining(["note", "collapsed"]));
  });
});
