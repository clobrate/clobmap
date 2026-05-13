import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, Scalar, YAMLMap } from "yaml";
import { applyTreeToDocument } from "../apply";
import { parseLiveYaml, parseYaml } from "../parse";
import { serializeLiveYaml } from "../serialize";
import { addChild, deleteNode, moveNode, updateNode, updateText } from "../ops";
import { createIdGenerator } from "../ids";
import type { MindDocument } from "../types";

const FIXTURES_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

describe("applyTreeToDocument", () => {
  it("preserves comments across a text edit", () => {
    const text = loadFixture("08-with-comments.yaml");
    const live = parseLiveYaml(text);
    expect(live.ok).toBe(true);
    if (!live.ok) return;

    const after = updateText(live.value.tree, "n2", "Branch A renamed");
    applyTreeToDocument(live.value.doc, after);
    const out = serializeLiveYaml(live.value.doc);

    expect(out).toContain("# Top-level comment for the document");
    expect(out).toContain("# Comment above children");
    expect(out).toContain("# Comment before first child");
    expect(out).toContain("Branch A renamed");
    expect(out).not.toContain("Branch A\n");

    const reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value).toEqual(after);
  });

  it("preserves comments when adding a new child", () => {
    const text = loadFixture("08-with-comments.yaml");
    const live = parseLiveYaml(text);
    expect(live.ok).toBe(true);
    if (!live.ok) return;

    const { doc: after } = addChild(live.value.tree, "n1", "Branch C", createIdGenerator(10));
    applyTreeToDocument(live.value.doc, after);
    const out = serializeLiveYaml(live.value.doc);

    expect(out).toContain("# Top-level comment for the document");
    expect(out).toContain("# Comment above children");
    expect(out).toContain("Branch C");

    const reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value).toEqual(after);
  });

  it("preserves comments when deleting a node", () => {
    const text = loadFixture("08-with-comments.yaml");
    const live = parseLiveYaml(text);
    expect(live.ok).toBe(true);
    if (!live.ok) return;

    const after = deleteNode(live.value.tree, "n3");
    applyTreeToDocument(live.value.doc, after);
    const out = serializeLiveYaml(live.value.doc);

    expect(out).toContain("# Top-level comment for the document");
    expect(out).not.toContain("Branch B");

    const reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value).toEqual(after);
  });

  it("preserves comments when moving a node", () => {
    const text = loadFixture("08-with-comments.yaml");
    const live = parseLiveYaml(text);
    expect(live.ok).toBe(true);
    if (!live.ok) return;

    const after = moveNode(live.value.tree, "n2", "n3");
    applyTreeToDocument(live.value.doc, after);
    const out = serializeLiveYaml(live.value.doc);

    const reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value).toEqual(after);
    expect(out).toContain("# Top-level comment for the document");
  });

  it("updates optional fields and removes them when cleared", () => {
    const text = loadFixture("04-optional-fields.yaml");
    const live = parseLiveYaml(text);
    expect(live.ok).toBe(true);
    if (!live.ok) return;

    const after = updateNode(live.value.tree, "n1", { color: "", collapsed: false });
    applyTreeToDocument(live.value.doc, after);
    const out = serializeLiveYaml(live.value.doc);
    const reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value.root.color).toBeUndefined();
    expect(reparsed.value.root.collapsed).toBeUndefined();
  });

  it("adds a version field when not previously present", () => {
    const text = loadFixture("01-minimal.yaml");
    const live = parseLiveYaml(text);
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    const after = { ...live.value.tree, version: 1 };
    applyTreeToDocument(live.value.doc, after);
    const out = serializeLiveYaml(live.value.doc);
    const reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value.version).toBe(1);
  });

  it("removes the version field when cleared", () => {
    const text = loadFixture("09-version.yaml");
    const live = parseLiveYaml(text);
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    const after = { ...live.value.tree, version: undefined };
    applyTreeToDocument(live.value.doc, after);
    const out = serializeLiveYaml(live.value.doc);
    expect(out).not.toContain("version:");
  });

  it("creates new nodes that carry optional fields", () => {
    const text = loadFixture("01-minimal.yaml");
    const live = parseLiveYaml(text);
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    const after = {
      ...live.value.tree,
      root: {
        ...live.value.tree.root,
        children: [
          {
            id: "n2",
            text: "Decorated",
            children: [],
            color: "#abcdef",
            collapsed: true,
          },
        ],
      },
    };
    applyTreeToDocument(live.value.doc, after);
    const out = serializeLiveYaml(live.value.doc);
    const reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    const child = reparsed.value.root.children[0];
    expect(child?.color).toBe("#abcdef");
    expect(child?.collapsed).toBe(true);
  });

  it("creates the root entry when the live AST has no root yet", () => {
    const doc = new Document();
    doc.contents = new YAMLMap();
    const tree: MindDocument = {
      title: "Fresh",
      root: { id: "n1", text: "Root", children: [] },
    };
    applyTreeToDocument(doc, tree);
    const out = serializeLiveYaml(doc);
    const reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value).toEqual(tree);
  });

  it("creates the root entry when the live AST has no contents at all", () => {
    const doc = new Document();
    const tree: MindDocument = {
      title: "Fresh",
      root: { id: "n1", text: "Root", children: [] },
    };
    applyTreeToDocument(doc, tree);
    const out = serializeLiveYaml(doc);
    const reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value).toEqual(tree);
  });

  it("ignores AST nodes with non-string id when building the index", () => {
    // Hand-craft a Document that has a child whose id is a number, not a string.
    const doc = new Document();
    doc.contents = new YAMLMap();
    doc.contents.set("title", new Scalar("x"));
    const root = new YAMLMap();
    root.set("id", new Scalar("n1"));
    root.set("text", new Scalar("Root"));
    const childrenSeq = doc.createNode([{ id: 42, text: "weird", children: [] }]);
    root.set("children", childrenSeq);
    doc.contents.set("root", root);

    // Apply a clean tree that doesn't include the weird-id node.
    const tree: MindDocument = {
      title: "x",
      root: {
        id: "n1",
        text: "Root",
        children: [{ id: "n2", text: "Child", children: [] }],
      },
    };
    applyTreeToDocument(doc, tree);
    const reparsed = parseYaml(serializeLiveYaml(doc));
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value).toEqual(tree);
  });

  it("creates a children seq when a hand-built AST node has none", () => {
    // Construct a node map with id+text but no children seq.
    const doc = new Document();
    doc.contents = new YAMLMap();
    const root = new YAMLMap();
    root.set("id", new Scalar("n1"));
    root.set("text", new Scalar("Root"));
    doc.contents.set("title", new Scalar("Fresh"));
    doc.contents.set("root", root);

    const tree: MindDocument = {
      title: "Fresh",
      root: {
        id: "n1",
        text: "Root",
        children: [{ id: "n2", text: "Child", children: [] }],
      },
    };
    applyTreeToDocument(doc, tree);
    const reparsed = parseYaml(serializeLiveYaml(doc));
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value).toEqual(tree);
  });

  it("adds a layoutMode field when not previously present", () => {
    const text = loadFixture("01-minimal.yaml");
    const live = parseLiveYaml(text);
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    const after: MindDocument = { ...live.value.tree, layoutMode: "manual" };
    applyTreeToDocument(live.value.doc, after);
    const out = serializeLiveYaml(live.value.doc);
    expect(out).toContain("layoutMode: manual");
    const reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value.layoutMode).toBe("manual");
  });

  it("removes the layoutMode field when cleared", () => {
    const text = loadFixture("01-minimal.yaml");
    const live = parseLiveYaml(text);
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    // Seed it first so the delete branch has something to remove.
    applyTreeToDocument(live.value.doc, {
      ...live.value.tree,
      layoutMode: "manual",
    });
    applyTreeToDocument(live.value.doc, {
      ...live.value.tree,
      layoutMode: undefined,
    });
    const out = serializeLiveYaml(live.value.doc);
    expect(out).not.toContain("layoutMode:");
  });

  it("writes a per-node position and updates it on a subsequent apply", () => {
    const text = loadFixture("01-minimal.yaml");
    const live = parseLiveYaml(text);
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    // First write: introduce a position on the root.
    applyTreeToDocument(live.value.doc, {
      ...live.value.tree,
      root: { ...live.value.tree.root, position: { x: 100, y: 200 } },
    });
    let out = serializeLiveYaml(live.value.doc);
    let reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value.root.position).toEqual({ x: 100, y: 200 });

    // Second write: update the same field.
    applyTreeToDocument(live.value.doc, {
      ...live.value.tree,
      root: { ...live.value.tree.root, position: { x: 999, y: 888 } },
    });
    out = serializeLiveYaml(live.value.doc);
    reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value.root.position).toEqual({ x: 999, y: 888 });
  });

  it("removes a per-node position when it goes back to undefined", () => {
    const text = loadFixture("01-minimal.yaml");
    const live = parseLiveYaml(text);
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    // Seed.
    applyTreeToDocument(live.value.doc, {
      ...live.value.tree,
      root: { ...live.value.tree.root, position: { x: 50, y: 60 } },
    });
    expect(serializeLiveYaml(live.value.doc)).toContain("position:");
    // Clear.
    applyTreeToDocument(live.value.doc, live.value.tree);
    expect(serializeLiveYaml(live.value.doc)).not.toContain("position:");
  });

  it("creates new nodes that carry every layout/edge field", () => {
    const text = loadFixture("01-minimal.yaml");
    const live = parseLiveYaml(text);
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    const after: MindDocument = {
      ...live.value.tree,
      root: {
        ...live.value.tree.root,
        children: [
          {
            id: "n2",
            text: "Decorated",
            children: [],
            maxWidth: 320,
            maxHeight: 200,
            notes: "Some notes",
            position: { x: 400, y: 300 },
            edgeFrom: "bottom",
            edgeTo: "top",
          },
        ],
      },
    };
    applyTreeToDocument(live.value.doc, after);
    const out = serializeLiveYaml(live.value.doc);
    const reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    const child = reparsed.value.root.children[0];
    expect(child?.maxWidth).toBe(320);
    expect(child?.maxHeight).toBe(200);
    expect(child?.notes).toBe("Some notes");
    expect(child?.position).toEqual({ x: 400, y: 300 });
    expect(child?.edgeFrom).toBe("bottom");
    expect(child?.edgeTo).toBe("top");
  });

  it("updates the document title", () => {
    const text = loadFixture("01-minimal.yaml");
    const live = parseLiveYaml(text);
    expect(live.ok).toBe(true);
    if (!live.ok) return;

    const after = { ...live.value.tree, title: "Renamed" };
    applyTreeToDocument(live.value.doc, after);
    const out = serializeLiveYaml(live.value.doc);
    const reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value.title).toBe("Renamed");
  });
});
