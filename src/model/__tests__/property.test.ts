import { describe, expect, it } from "vitest";
import {
  addChild,
  addSibling,
  createIdGenerator,
  deleteNode,
  findById,
  idGeneratorForDocument,
  moveNode,
  OpError,
  parseLiveYaml,
  parseYaml,
  serializeLiveYaml,
  updateNode,
  updateText,
  applyTreeToDocument,
  type MindDocument,
} from "..";

const SEED_YAML = `# random-mutation property test seed
title: Property Seed
version: 1
root:
  id: n1
  text: Root
  children:
    - id: n2
      text: A
      children:
        - id: n3
          text: A1
          children: []
        - id: n4
          text: A2
          children: []
    - id: n5
      text: B
      children: []
`;

function collectIds(doc: MindDocument): string[] {
  const out: string[] = [];
  const walk = (n: MindDocument["root"]) => {
    out.push(n.id);
    n.children.forEach(walk);
  };
  walk(doc.root);
  return out;
}

function nonRootIds(doc: MindDocument): string[] {
  return collectIds(doc).filter((id) => id !== doc.root.id);
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function applyRandom(
  doc: MindDocument,
  ids: ReturnType<typeof createIdGenerator>,
  rng: () => number,
): MindDocument {
  const op = Math.floor(rng() * 5);
  try {
    switch (op) {
      case 0: {
        const parent = pick(collectIds(doc), rng);
        return addChild(doc, parent, `txt-${Math.floor(rng() * 1e6)}`, ids).doc;
      }
      case 1: {
        const non = nonRootIds(doc);
        if (non.length === 0) return doc;
        return addSibling(doc, pick(non, rng), `s-${Math.floor(rng() * 1e6)}`, ids).doc;
      }
      case 2: {
        const non = nonRootIds(doc);
        if (non.length === 0) return doc;
        return deleteNode(doc, pick(non, rng));
      }
      case 3: {
        const target = pick(collectIds(doc), rng);
        return updateText(doc, target, `t-${Math.floor(rng() * 1e6)}`);
      }
      case 4: {
        const non = nonRootIds(doc);
        if (non.length < 2) return doc;
        const id = pick(non, rng);
        const candidate = pick(collectIds(doc), rng);
        return moveNode(doc, id, candidate);
      }
      default:
        return doc;
    }
  } catch (e) {
    if (e instanceof OpError) return doc;
    throw e;
  }
}

describe("round-trip property: 100 random mutations stay parseable and stable", () => {
  it("serialize ⇄ parse is the identity after each mutation", () => {
    const live = parseLiveYaml(SEED_YAML);
    expect(live.ok).toBe(true);
    if (!live.ok) return;

    let tree = live.value.tree;
    const yamlDoc = live.value.doc;
    const ids = idGeneratorForDocument(tree);
    let rngState = 0xcafe;
    const rng = () => {
      rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
      return rngState / 0x7fffffff;
    };

    for (let i = 0; i < 100; i += 1) {
      tree = applyRandom(tree, ids, rng);

      // Serialize via the live AST (the path used by the document store).
      applyTreeToDocument(yamlDoc, tree);
      const text = serializeLiveYaml(yamlDoc);

      const reparsed = parseYaml(text);
      expect(reparsed.ok, `iteration ${i} produced unparsable YAML:\n${text}`).toBe(true);
      if (!reparsed.ok) return;
      expect(reparsed.value, `iteration ${i} did not round-trip`).toEqual(tree);

      // Tree should always still be findable by every id.
      for (const id of collectIds(tree)) {
        expect(findById(tree, id), `iteration ${i}: id ${id} missing`).not.toBeNull();
      }
    }
  });

  it("preserves the seed comment across all mutations", () => {
    const live = parseLiveYaml(SEED_YAML);
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    let tree = live.value.tree;
    const yamlDoc = live.value.doc;
    const ids = idGeneratorForDocument(tree);
    let rngState = 0xbeef;
    const rng = () => {
      rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
      return rngState / 0x7fffffff;
    };
    for (let i = 0; i < 100; i += 1) {
      tree = applyRandom(tree, ids, rng);
      applyTreeToDocument(yamlDoc, tree);
    }
    const text = serializeLiveYaml(yamlDoc);
    expect(text).toContain("# random-mutation property test seed");
  });

  it("no-op operation: updateNode that clears no fields is observable in serialization", () => {
    const live = parseLiveYaml(SEED_YAML);
    if (!live.ok) throw new Error("seed parse failed");
    const after = updateNode(live.value.tree, "n2", { color: "" });
    applyTreeToDocument(live.value.doc, after);
    const text = serializeLiveYaml(live.value.doc);
    const back = parseYaml(text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.value).toEqual(after);
  });
});
