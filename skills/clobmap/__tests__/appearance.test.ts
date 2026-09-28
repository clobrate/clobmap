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

async function fresh(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clob-"));
  const p = path.join(dir, "d.clobmap.yaml");
  await fs.writeFile(p, FIXTURE, "utf8");
  return p;
}
async function docOf(p: string): Promise<MindDocument> {
  return (await loadDoc(p)).tree;
}

describe("cli — color + size", () => {
  it("color-set stores the color and color-clear removes it", async () => {
    const p = await fresh();
    await run(["color-set", p, "n2", "--color", "#f59e0b"]);
    expect(findById(await docOf(p), "n2")!.color).toBe("#f59e0b");
    await run(["color-clear", p, "n2"]);
    expect(findById(await docOf(p), "n2")!.color).toBeUndefined();
  });

  it("size sets maxWidth/maxHeight and 0 clears a dimension", async () => {
    const p = await fresh();
    await run(["size", p, "n2", "--max-width", "320", "--max-height", "200"]);
    let n2 = findById(await docOf(p), "n2")!;
    expect(n2.maxWidth).toBe(320);
    expect(n2.maxHeight).toBe(200);
    await run(["size", p, "n2", "--max-width", "0"]);
    n2 = findById(await docOf(p), "n2")!;
    expect(n2.maxWidth).toBeUndefined();
    expect(n2.maxHeight).toBe(200);
  });

  it("size errors when no dimension is given", async () => {
    const r = await run(["size", await fresh(), "n2"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/--max-width/);
  });
});

describe("cli — layout + positions + edges", () => {
  it("layout switches the document mode", async () => {
    const p = await fresh();
    await run(["layout", p, "--manual"]);
    expect((await docOf(p)).layoutMode).toBe("manual");
    await run(["layout", p, "--auto"]);
    expect((await docOf(p)).layoutMode ?? "auto").toBe("auto");
  });

  it("pos-set sets a node's position and switches to manual layout", async () => {
    const p = await fresh();
    await run(["pos-set", p, "n2", "--x", "120", "--y", "-40"]);
    const doc = await docOf(p);
    expect(doc.layoutMode).toBe("manual");
    expect(findById(doc, "n2")!.position).toEqual({ x: 120, y: -40 });
  });

  it("pos-clear <ref> clears one node; no ref clears all", async () => {
    const p = await fresh();
    await run(["pos-set", p, "n2", "--x", "10", "--y", "20"]);
    await run(["pos-set", p, "n3", "--x", "30", "--y", "40"]);
    await run(["pos-clear", p, "n2"]);
    let doc = await docOf(p);
    expect(findById(doc, "n2")!.position).toBeUndefined();
    expect(findById(doc, "n3")!.position).toEqual({ x: 30, y: 40 });
    await run(["pos-clear", p]);
    doc = await docOf(p);
    expect(findById(doc, "n3")!.position).toBeUndefined();
  });

  it("edge-side sets from/to handle sides (and validates them)", async () => {
    const p = await fresh();
    await run(["edge-side", p, "n2", "--from", "right", "--to", "left"]);
    const n2 = findById(await docOf(p), "n2")!;
    expect(n2.edgeFrom).toBe("right");
    expect(n2.edgeTo).toBe("left");
    const bad = await run(["edge-side", p, "n2", "--from", "sideways"]);
    expect(bad.code).toBe(1);
    expect(bad.err).toMatch(/top, right, bottom, left/);
  });

  it("--dry-run previews color without writing", async () => {
    const p = await fresh();
    const before = await fs.readFile(p, "utf8");
    const r = await run(["color-set", p, "n2", "--color", "#123456", "--dry-run"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/[+-] /);
    expect(await fs.readFile(p, "utf8")).toBe(before);
  });
});
