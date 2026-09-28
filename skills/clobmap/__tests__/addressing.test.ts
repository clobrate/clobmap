import { describe, it, expect } from "vitest";
import { resolveNodeId } from "../addressing";
import type { MindDocument, MindNode } from "../../../src/model/types";

function n(id: string, text: string, children: MindNode[] = []): MindNode {
  return { id, text, children };
}

// Root
// ├─ Venue          (n2)   — unique title
// │  └─ Ceremony    (n3)
// ├─ Guests         (n5)   — duplicate title
// └─ Guests         (n6)   — duplicate title
const doc: MindDocument = {
  title: "T",
  root: n("n1", "Root", [n("n2", "Venue", [n("n3", "Ceremony")]), n("n5", "Guests"), n("n6", "Guests")]),
};

describe("resolveNodeId", () => {
  it("resolves an exact id", () => {
    expect(resolveNodeId(doc, "n3")).toBe("n3");
  });

  it("resolves a unique title", () => {
    expect(resolveNodeId(doc, "Venue")).toBe("n2");
  });

  it("errors on an ambiguous title", () => {
    expect(() => resolveNodeId(doc, "Guests")).toThrow(/Ambiguous title/);
  });

  it("errors on a missing node", () => {
    expect(() => resolveNodeId(doc, "Nope")).toThrow(/not found/i);
  });

  it("resolves a path from the root", () => {
    expect(resolveNodeId(doc, "Root › Venue › Ceremony")).toBe("n3");
  });

  it("resolves a path without the root lead", () => {
    expect(resolveNodeId(doc, "Venue › Ceremony")).toBe("n3");
  });

  it("errors on an ambiguous path segment", () => {
    expect(() => resolveNodeId(doc, "Root › Guests")).toThrow(/Ambiguous path segment/);
  });

  it("errors on a missing path segment", () => {
    expect(() => resolveNodeId(doc, "Root › Venue › Nope")).toThrow(/not found under/);
  });

  it("rejects an empty reference", () => {
    expect(() => resolveNodeId(doc, "   ")).toThrow(/Empty node reference/);
  });
});
