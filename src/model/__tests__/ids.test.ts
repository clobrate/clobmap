import { describe, expect, it } from "vitest";
import { createIdGenerator, idGeneratorForDocument } from "../ids";
import type { MindDocument } from "../types";

describe("createIdGenerator", () => {
  it("starts at n1 with default seed", () => {
    const ids = createIdGenerator();
    expect(ids.next()).toBe("n1");
    expect(ids.next()).toBe("n2");
    expect(ids.next()).toBe("n3");
  });

  it("respects a non-zero seed", () => {
    const ids = createIdGenerator(10);
    expect(ids.next()).toBe("nb");
  });
});

describe("idGeneratorForDocument", () => {
  it("seeds past the highest existing sequential id", () => {
    const doc: MindDocument = {
      title: "x",
      root: {
        id: "n1",
        text: "root",
        children: [
          { id: "n5", text: "a", children: [] },
          { id: "n3", text: "b", children: [] },
        ],
      },
    };
    const ids = idGeneratorForDocument(doc);
    expect(ids.next()).toBe("n6");
  });

  it("ignores non-sequential ids when seeding", () => {
    const doc: MindDocument = {
      title: "x",
      root: {
        id: "custom-uuid",
        text: "root",
        children: [{ id: "another", text: "a", children: [] }],
      },
    };
    const ids = idGeneratorForDocument(doc);
    expect(ids.next()).toBe("n1");
  });

  it("handles documents with only a sequential root id", () => {
    const doc: MindDocument = {
      title: "x",
      root: { id: "n7", text: "root", children: [] },
    };
    const ids = idGeneratorForDocument(doc);
    expect(ids.next()).toBe("n8");
  });

  it("treats 'n' alone as non-sequential", () => {
    const doc: MindDocument = {
      title: "x",
      root: { id: "n", text: "root", children: [] },
    };
    const ids = idGeneratorForDocument(doc);
    expect(ids.next()).toBe("n1");
  });

  it("treats malformed sequential ids as non-sequential", () => {
    const doc: MindDocument = {
      title: "x",
      root: { id: "n!!", text: "root", children: [] },
    };
    const ids = idGeneratorForDocument(doc);
    expect(ids.next()).toBe("n1");
  });
});
