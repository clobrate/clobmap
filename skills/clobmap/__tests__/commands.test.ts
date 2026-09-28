import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../cli";
import { loadDoc } from "../core";
import { findById } from "../../../src/model";

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

async function fresh(content = FIXTURE): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clob-"));
  const p = path.join(dir, "d.clobmap.yaml");
  await fs.writeFile(p, content, "utf8");
  return p;
}
async function tmpPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clob-"));
  return path.join(dir, "new.clobmap.yaml");
}
async function tree(p: string) {
  return (await loadDoc(p)).tree;
}

describe("cli — doc commands", () => {
  it("new creates a valid, openable document", async () => {
    const p = await tmpPath();
    const r = await run(["new", p, "--title", "My Doc"]);
    expect(r.code).toBe(0);
    const t = await tree(p);
    expect(t.title).toBe("My Doc");
    expect(t.root.id).toBeTruthy();
  });

  it("new refuses to overwrite without --force", async () => {
    const p = await fresh();
    const r = await run(["new", p]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/exists/);
  });

  it("tree prints the outline with ids", async () => {
    const r = await run(["tree", await fresh()]);
    expect(r.out).toContain("Root [n1]");
    expect(r.out).toContain("Venue [n2]");
  });

  it("validate reports a valid doc + node count", async () => {
    const r = await run(["validate", await fresh()]);
    expect(r.out).toMatch(/Valid \(3 nodes\)/);
  });
});

describe("cli — tree edits", () => {
  it("add-child adds under a title-addressed parent", async () => {
    const p = await fresh();
    const r = await run(["add-child", p, "--parent", "Venue", "--text", "Ceremony"]);
    expect(r.code).toBe(0);
    const venue = findById(await tree(p), "n2")!;
    expect(venue.children.map((c) => c.text)).toEqual(["Ceremony"]);
  });

  it("add-child --json returns the affected id", async () => {
    const p = await fresh();
    const r = await run(["add-child", p, "--parent", "n2", "--text", "X", "--json"]);
    const parsed = JSON.parse(r.out);
    expect(parsed.ok).toBe(true);
    expect(parsed.affected).toHaveLength(1);
  });

  it("add-sibling inserts after a node", async () => {
    const p = await fresh();
    await run(["add-sibling", p, "--after", "n2", "--text", "Reception"]);
    const root = (await tree(p)).root;
    expect(root.children.map((c) => c.text)).toEqual(["Venue", "Reception", "Guests"]);
  });

  it("rename changes a node's text", async () => {
    const p = await fresh();
    await run(["rename", p, "n2", "--text", "Location"]);
    expect(findById(await tree(p), "n2")!.text).toBe("Location");
  });

  it("delete removes a node", async () => {
    const p = await fresh();
    await run(["delete", p, "n3"]);
    expect(findById(await tree(p), "n3")).toBeNull();
  });

  it("move reparents a node", async () => {
    const p = await fresh();
    await run(["move", p, "n3", "--to", "n2"]);
    const t = await tree(p);
    expect(findById(t, "n2")!.children.map((c) => c.id)).toContain("n3");
    expect(t.root.children.map((c) => c.id)).not.toContain("n3");
  });

  it("reorder moves a node among its siblings", async () => {
    const p = await fresh();
    await run(["reorder", p, "n3", "--up"]);
    expect((await tree(p)).root.children.map((c) => c.id)).toEqual(["n3", "n2"]);
  });

  it("duplicate clones a subtree with a new id", async () => {
    const p = await fresh();
    await run(["duplicate", p, "n2"]);
    const texts = (await tree(p)).root.children.map((c) => c.text);
    expect(texts.filter((t) => t === "Venue")).toHaveLength(2);
  });

  it("collapse --on sets collapsed", async () => {
    const p = await fresh();
    await run(["collapse", p, "n2", "--on"]);
    expect(findById(await tree(p), "n2")!.collapsed).toBe(true);
  });
});

describe("cli — dry-run and errors", () => {
  it("--dry-run shows a diff and does NOT write", async () => {
    const p = await fresh();
    const before = await fs.readFile(p, "utf8");
    const r = await run(["rename", p, "n2", "--text", "Zzz", "--dry-run"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/[+-] /); // diff markers
    expect(await fs.readFile(p, "utf8")).toBe(before); // untouched
  });

  it("errors (nonzero + message) on an unknown node", async () => {
    const r = await run(["rename", await fresh(), "nope", "--text", "X"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/not found/i);
  });

  it("emits a JSON error with --json", async () => {
    const r = await run(["delete", await fresh(), "nope", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.err).error).toMatch(/not found/i);
  });

  it("errors on a missing required flag", async () => {
    const r = await run(["add-child", await fresh(), "--parent", "n2"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/--text is required/);
  });
});
