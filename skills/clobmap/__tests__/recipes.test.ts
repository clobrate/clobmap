/**
 * Smoke suite: each recipe in SKILL.md, run end-to-end in a temp dir. If a
 * recipe here breaks, the docs are wrong — fix one or the other together.
 */
import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../cli";
import { loadDoc } from "../core";
import { findById } from "../../../src/model";

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "clob-recipe-"));
}
async function rootId(file: string): Promise<string> {
  return (await loadDoc(file)).tree.root.id;
}

describe("SKILL.md recipes", () => {
  it("1. create a document and add a subject with pages", async () => {
    const f = path.join(await tmpDir(), "trip.clobmap.yaml");
    expect((await run(["new", f, "--title", "Japan Trip"])).code).toBe(0);
    const root = await rootId(f);
    const a = await run(["add-child", f, "--parent", root, "--text", "Flights", "--json"]);
    const b = await run(["add-child", f, "--parent", root, "--text", "Hotels", "--json"]);
    expect(JSON.parse(a.out).ok).toBe(true);
    expect(JSON.parse(b.out).ok).toBe(true);
    const doc = (await loadDoc(f)).tree;
    expect(doc.title).toBe("Japan Trip");
    expect(doc.root.children.map((c) => c.text)).toEqual(["Flights", "Hotels"]);
  });

  it("2. add notes in folder mode (one .md per node)", async () => {
    const dir = await tmpDir();
    const f = path.join(dir, "trip.clobmap.yaml");
    await run(["new", f]);
    const root = await rootId(f);
    await run(["add-child", f, "--parent", root, "--text", "Flights"]);
    await run(["note-set", f, "Flights", "--text", "# Depart\n\nSFO", "--notes-mode", "folder"]);
    await run(["note-append", f, "Flights", "--text", "Seat 32A"]);
    const got = await run(["note-get", f, "Flights"]);
    expect(got.out).toBe("# Depart\n\nSFO\nSeat 32A");
    // A real per-node file exists under ./notelets.
    const files = await fs.readdir(path.join(dir, "notelets"));
    expect(files.some((n) => n.endsWith(".md"))).toBe(true);
  });

  it("3. tag + color a subtree, then nest tags", async () => {
    const f = path.join(await tmpDir(), "trip.clobmap.yaml");
    await run(["new", f]);
    const root = await rootId(f);
    await run(["add-child", f, "--parent", root, "--text", "Hotels"]);
    await run(["tag-add", f, "Hotels", "--tags", "booked,paid"]);
    await run(["color-set", f, "Hotels", "--color", "#22c55e"]);
    await run(["tag-move", f, "paid", "--under", "booked"]);
    const doc = (await loadDoc(f)).tree;
    const hotels = doc.root.children[0]!;
    expect(hotels.tags).toEqual(["booked", "paid"]);
    expect(hotels.color).toBe("#22c55e");
    // "paid" now nests under "booked" in the tag tree.
    const booked = doc.tagRoot!.children.find((t) => t.name === "booked")!;
    expect(booked.children.map((c) => c.name)).toEqual(["paid"]);
  });

  it("4. batch several edits atomically (dry-run then commit)", async () => {
    const dir = await tmpDir();
    const f = path.join(dir, "trip.clobmap.yaml");
    await run(["new", f]);
    const root = await rootId(f);
    await run(["add-child", f, "--parent", root, "--text", "Flights"]);
    const ops = path.join(dir, "ops.json");
    await fs.writeFile(
      ops,
      JSON.stringify([
        { op: "rename", ref: "Flights", text: "Air travel" },
        { op: "add-child", parent: "Air travel", text: "Return" },
        { op: "tag-add", ref: "Air travel", tags: ["confirmed"] },
      ]),
      "utf8",
    );
    const before = await fs.readFile(f, "utf8");
    const dry = await run(["apply", f, "--ops", ops, "--dry-run"]);
    expect(dry.code).toBe(0);
    expect(await fs.readFile(f, "utf8")).toBe(before); // dry-run wrote nothing
    expect((await run(["apply", f, "--ops", ops])).code).toBe(0);
    const doc = (await loadDoc(f)).tree;
    const air = doc.root.children[0]!;
    expect(air.text).toBe("Air travel");
    expect(air.tags).toEqual(["confirmed"]);
    expect(air.children.map((c) => c.text)).toEqual(["Return"]);
  });

  it("5. query and export", async () => {
    const dir = await tmpDir();
    const f = path.join(dir, "trip.clobmap.yaml");
    await run(["new", f]);
    const root = await rootId(f);
    await run(["add-child", f, "--parent", root, "--text", "Hotels"]);
    await run(["tag-add", f, "Hotels", "--tags", "booked"]);
    await run(["note-set", f, "Hotels", "--text", "Grand Hotel"]);
    const found = await run(["find", f, "--tag", "booked", "--json"]);
    expect(JSON.parse(found.out).matches).toHaveLength(1);
    const out = path.join(dir, "trip-notes.md");
    await run(["export-notes", f, "--out", out]);
    const md = await fs.readFile(out, "utf8");
    expect(md).toContain("# Hotels");
    expect(md).toContain("tags: booked");
    expect(md).toContain("Grand Hotel");
  });

  it("never-hand-edit invariant: a title-addressed edit keeps ids stable", async () => {
    const f = path.join(await tmpDir(), "d.clobmap.yaml");
    await run(["new", f]);
    const root = await rootId(f);
    await run(["add-child", f, "--parent", root, "--text", "Node"]);
    const idBefore = (await loadDoc(f)).tree.root.children[0]!.id;
    await run(["rename", f, "Node", "--text", "Renamed"]);
    const after = findById((await loadDoc(f)).tree, idBefore);
    expect(after?.text).toBe("Renamed"); // same id, new text — id preserved
  });
});
