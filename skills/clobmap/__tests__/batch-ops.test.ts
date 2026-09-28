/**
 * Coverage for every op the batch applier (`batch.ts`) handles, exercised
 * through the `apply` command so the op arg-plumbing (str/num/dir/tags) runs
 * on the batch path — not just the CLI path.
 */
import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../cli";
import { loadDoc } from "../core";
import { findById } from "../../../src/model";
import type { MindDocument } from "../../../src/model/types";

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

async function fresh(): Promise<{ dir: string; file: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clob-bops-"));
  const file = path.join(dir, "d.clobmap.yaml");
  await fs.writeFile(file, FIXTURE, "utf8");
  return { dir, file };
}
async function docOf(file: string): Promise<MindDocument> {
  return (await loadDoc(file)).tree;
}
/** Apply one or more ops via the `apply` command. */
async function apply(dir: string, file: string, ops: unknown[]): ReturnType<typeof run> {
  const opsPath = path.join(dir, "ops.json");
  await fs.writeFile(opsPath, JSON.stringify(ops), "utf8");
  return run(["apply", file, "--ops", opsPath]);
}

describe("batch — every op applies via the batch path", () => {
  it("add-sibling", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [{ op: "add-sibling", after: "n2", text: "Reception" }]);
    expect((await docOf(file)).root.children.map((c) => c.text)).toEqual(["Venue", "Reception", "Guests"]);
  });

  it("delete", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [{ op: "delete", ref: "n3" }]);
    expect(findById(await docOf(file), "n3")).toBeNull();
  });

  it("duplicate", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [{ op: "duplicate", ref: "n2" }]);
    expect((await docOf(file)).root.children.filter((c) => c.text === "Venue")).toHaveLength(2);
  });

  it("move (with index)", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [{ op: "move", ref: "n3", to: "n2", index: 0 }]);
    const doc = await docOf(file);
    expect(findById(doc, "n2")!.children.map((c) => c.id)).toEqual(["n3"]);
  });

  it("reorder", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [{ op: "reorder", ref: "n3", dir: "up" }]);
    expect((await docOf(file)).root.children.map((c) => c.id)).toEqual(["n3", "n2"]);
  });

  it("collapse", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [{ op: "collapse", ref: "n2", on: true }]);
    expect(findById(await docOf(file), "n2")!.collapsed).toBe(true);
  });

  it("color-set + color-clear", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [
      { op: "color-set", ref: "n2", color: "#abc" },
      { op: "color-clear", ref: "n3" },
    ]);
    expect(findById(await docOf(file), "n2")!.color).toBe("#abc");
    expect(findById(await docOf(file), "n3")!.color).toBeUndefined();
  });

  it("size (numeric coercion)", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [{ op: "size", ref: "n2", maxWidth: 200, maxHeight: 100 }]);
    const n2 = findById(await docOf(file), "n2")!;
    expect(n2.maxWidth).toBe(200);
    expect(n2.maxHeight).toBe(100);
  });

  it("layout", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [{ op: "layout", mode: "manual" }]);
    expect((await docOf(file)).layoutMode).toBe("manual");
  });

  it("pos-set (switches to manual) + pos-clear one", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [{ op: "pos-set", ref: "n2", x: 5, y: 6 }]);
    let doc = await docOf(file);
    expect(doc.layoutMode).toBe("manual");
    expect(findById(doc, "n2")!.position).toEqual({ x: 5, y: 6 });
    await apply(dir, file, [{ op: "pos-clear", ref: "n2" }]);
    doc = await docOf(file);
    expect(findById(doc, "n2")!.position).toBeUndefined();
  });

  it("pos-clear all (no ref)", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [
      { op: "pos-set", ref: "n2", x: 1, y: 2 },
      { op: "pos-set", ref: "n3", x: 3, y: 4 },
      { op: "pos-clear" },
    ]);
    const doc = await docOf(file);
    expect(findById(doc, "n2")!.position).toBeUndefined();
    expect(findById(doc, "n3")!.position).toBeUndefined();
  });

  it("edge-side (validated)", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [{ op: "edge-side", ref: "n2", from: "top", to: "bottom" }]);
    const n2 = findById(await docOf(file), "n2")!;
    expect(n2.edgeFrom).toBe("top");
    expect(n2.edgeTo).toBe("bottom");
  });

  it("note-set / note-append / note-prepend / note-clear", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [{ op: "note-set", ref: "n2", text: "mid" }]);
    await apply(dir, file, [{ op: "note-append", ref: "n2", text: "end" }]);
    await apply(dir, file, [{ op: "note-prepend", ref: "n2", text: "start" }]);
    expect(findById(await docOf(file), "n2")!.notes).toBe("start\nmid\nend");
    await apply(dir, file, [{ op: "note-clear", ref: "n2" }]);
    expect(findById(await docOf(file), "n2")!.notes).toBeUndefined();
  });

  it("note-set in folder mode (per-op notesMode)", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [{ op: "note-set", ref: "n2", text: "hi", notesMode: "folder" }]);
    expect(findById(await docOf(file), "n2")!.notes).toBe("./notelets/n2-Venue.md");
    expect(await fs.readFile(path.join(dir, "notelets", "n2-Venue.md"), "utf8")).toBe("hi");
  });

  it("tag-remove / tag-rename / tag-delete", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [{ op: "tag-add", ref: "n2", tags: "keep,drop,ren" }]);
    await apply(dir, file, [{ op: "tag-remove", ref: "n2", tags: ["drop"] }]);
    await apply(dir, file, [{ op: "tag-rename", old: "ren", new: "renamed" }]);
    expect(findById(await docOf(file), "n2")!.tags).toEqual(["keep", "renamed"]);
    await apply(dir, file, [{ op: "tag-delete", name: "keep" }]);
    expect(findById(await docOf(file), "n2")!.tags).toEqual(["renamed"]);
  });

  it("tag-move / tag-reorder", async () => {
    const { dir, file } = await fresh();
    await apply(dir, file, [{ op: "tag-add", ref: "n2", tags: "parent,child,other" }]);
    await apply(dir, file, [{ op: "tag-move", tag: "child", under: "parent" }]);
    await apply(dir, file, [{ op: "tag-reorder", tag: "other", dir: "up" }]);
    const doc = await docOf(file);
    const parent = doc.tagRoot!.children.find((t) => t.name === "parent")!;
    expect(parent.children.map((c) => c.name)).toEqual(["child"]);
    // "other" moved up above "parent".
    expect(doc.tagRoot!.children.map((t) => t.name)).toEqual(["other", "parent"]);
  });
});

describe("batch — op validation errors abort the batch", () => {
  const bad: Array<[string, unknown]> = [
    ["missing string field", { op: "add-child", parent: "n1" }], // no text
    ["bad number field", { op: "size", ref: "n2", maxWidth: "wide" }],
    ["size with no dimension", { op: "size", ref: "n2" }],
    ["bad dir", { op: "reorder", ref: "n2", dir: "sideways" }],
    ["empty tags", { op: "tag-add", ref: "n2", tags: [] }],
    ["bad layout mode", { op: "layout", mode: "diagonal" }],
    ["edge-side with neither side", { op: "edge-side", ref: "n2" }],
    ["bad edge side value", { op: "edge-side", ref: "n2", from: "nw" }],
    ["unknown op", { op: "nope", ref: "n2" }],
  ];
  for (const [name, op] of bad) {
    it(name, async () => {
      const { dir, file } = await fresh();
      const before = await fs.readFile(file, "utf8");
      const r = await apply(dir, file, [op]);
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/^op\[0\]/);
      expect(await fs.readFile(file, "utf8")).toBe(before); // no write
    });
  }

  it("non-array ops file errors", async () => {
    const { dir, file } = await fresh();
    const opsPath = path.join(dir, "ops.json");
    await fs.writeFile(opsPath, JSON.stringify({ op: "delete", ref: "n2" }), "utf8");
    const r = await run(["apply", file, "--ops", opsPath]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/must be a JSON array/);
  });

  it("op without a string op field errors", async () => {
    const { dir, file } = await fresh();
    const r = await apply(dir, file, [{ ref: "n2" }]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/needs a string "op" field/);
  });
});
