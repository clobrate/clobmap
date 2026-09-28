import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../cli";
import { loadDoc } from "../core";
import { findById } from "../../../src/model";
import type { MindDocument, TagNode } from "../../../src/model/types";

const FIXTURE = `title: Test
version: 1
root:
  id: n1
  text: Root
  children:
    - id: n2
      text: Venue
      children: []
    - id: n3
      text: Guests
      children: []
`;

async function fresh(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clob-"));
  const p = path.join(dir, "d.clobmap.yaml");
  await fs.writeFile(p, FIXTURE, "utf8");
  return p;
}
async function docOf(p: string): Promise<MindDocument> {
  return (await loadDoc(p)).tree;
}
function tagNames(doc: MindDocument): string[] {
  const out: string[] = [];
  const walk = (t: TagNode, isRoot: boolean): void => {
    if (!isRoot) out.push(t.name);
    for (const c of t.children) walk(c, false);
  };
  if (doc.tagRoot) walk(doc.tagRoot, true);
  return out;
}
function childrenOf(doc: MindDocument, name: string): string[] {
  const found: TagNode[] = [];
  const walk = (t: TagNode): void => {
    if (t.name === name) found.push(t);
    for (const c of t.children) walk(c);
  };
  if (doc.tagRoot) doc.tagRoot.children.forEach(walk);
  return found[0]?.children.map((c) => c.name) ?? [];
}

describe("cli — node tags", () => {
  it("tag-add adds tags to a node and creates the tag tree", async () => {
    const p = await fresh();
    await run(["tag-add", p, "n2", "--tags", "work,urgent"]);
    const doc = await docOf(p);
    expect(findById(doc, "n2")!.tags).toEqual(["work", "urgent"]);
    expect(tagNames(doc).sort()).toEqual(["urgent", "work"]);
  });

  it("tag-remove removes a tag from a node", async () => {
    const p = await fresh();
    await run(["tag-add", p, "n2", "--tags", "work,urgent"]);
    await run(["tag-remove", p, "n2", "--tags", "urgent"]);
    expect(findById(await docOf(p), "n2")!.tags).toEqual(["work"]);
  });
});

describe("cli — tag tree (cascading)", () => {
  it("tag-rename cascades across every node + the tree", async () => {
    const p = await fresh();
    await run(["tag-add", p, "n2", "--tags", "work"]);
    await run(["tag-add", p, "n3", "--tags", "work"]);
    await run(["tag-rename", p, "work", "office"]);
    const doc = await docOf(p);
    expect(findById(doc, "n2")!.tags).toEqual(["office"]);
    expect(findById(doc, "n3")!.tags).toEqual(["office"]);
    expect(tagNames(doc)).toEqual(["office"]);
  });

  it("tag-delete cascades — removes it from nodes and the tree", async () => {
    const p = await fresh();
    await run(["tag-add", p, "n2", "--tags", "work,keep"]);
    await run(["tag-delete", p, "work"]);
    const doc = await docOf(p);
    expect(findById(doc, "n2")!.tags).toEqual(["keep"]);
    expect(tagNames(doc)).toEqual(["keep"]);
  });

  it("tag-move nests a tag under another", async () => {
    const p = await fresh();
    await run(["tag-add", p, "n2", "--tags", "parent,child"]);
    await run(["tag-move", p, "child", "--under", "parent"]);
    expect(childrenOf(await docOf(p), "parent")).toEqual(["child"]);
  });

  it("tag-reorder changes sibling order", async () => {
    const p = await fresh();
    await run(["tag-add", p, "n2", "--tags", "a,b"]);
    await run(["tag-reorder", p, "b", "--up"]);
    expect(tagNames(await docOf(p))).toEqual(["b", "a"]);
  });
});

describe("cli — tag errors", () => {
  it("errors on a missing tag", async () => {
    const r = await run(["tag-rename", await fresh(), "nope", "x"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/Tag not found|no tags/i);
  });

  it("errors when --tags is empty", async () => {
    const r = await run(["tag-add", await fresh(), "n2"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/--tags/);
  });
});
