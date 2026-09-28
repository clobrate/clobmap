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
async function writeOps(dir: string, ops: unknown): Promise<string> {
  const p = path.join(dir, "ops.json");
  await fs.writeFile(p, JSON.stringify(ops), "utf8");
  return p;
}

describe("cli — apply (batch op-list)", () => {
  it("applies a multi-op batch in order and round-trips once", async () => {
    const p = await fresh();
    const opsPath = await writeOps(path.dirname(p), [
      { op: "add-child", parent: "n2", text: "Ceremony" },
      { op: "rename", ref: "n2", text: "Location" },
      { op: "color-set", ref: "Location", color: "#f00" },
      { op: "tag-add", ref: "Location", tags: ["a", "b"] },
    ]);
    const r = await run(["apply", p, "--ops", opsPath]);
    expect(r.code).toBe(0);
    const doc = await docOf(p);
    const n2 = findById(doc, "n2")!;
    expect(n2.text).toBe("Location");
    expect(n2.color).toBe("#f00");
    expect(n2.tags).toEqual(["a", "b"]);
    expect(n2.children.map((c) => c.text)).toEqual(["Ceremony"]);
  });

  it("shares the id generator so created ids are unique", async () => {
    const p = await fresh();
    const opsPath = await writeOps(path.dirname(p), [
      { op: "add-child", parent: "n1", text: "A" },
      { op: "add-child", parent: "n1", text: "B" },
    ]);
    const r = await run(["apply", p, "--ops", opsPath, "--json"]);
    const affected: string[] = JSON.parse(r.out).affected;
    expect(new Set(affected).size).toBe(affected.length); // no dupes
  });

  it("aborts the whole batch on a bad op — no partial write", async () => {
    const p = await fresh();
    const before = await fs.readFile(p, "utf8");
    const opsPath = await writeOps(path.dirname(p), [
      { op: "rename", ref: "n2", text: "Changed" },
      { op: "rename", ref: "does-not-exist", text: "X" }, // fails
    ]);
    const r = await run(["apply", p, "--ops", opsPath]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/op\[1\].*not found/i);
    expect(await fs.readFile(p, "utf8")).toBe(before); // untouched
  });

  it("--dry-run shows the combined diff and writes nothing", async () => {
    const p = await fresh();
    const before = await fs.readFile(p, "utf8");
    const opsPath = await writeOps(path.dirname(p), [{ op: "rename", ref: "n2", text: "Zzz" }]);
    const r = await run(["apply", p, "--ops", opsPath, "--dry-run"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/[+-] /);
    expect(await fs.readFile(p, "utf8")).toBe(before);
  });

  it("rejects an unknown op", async () => {
    const p = await fresh();
    const opsPath = await writeOps(path.dirname(p), [{ op: "frobnicate", ref: "n2" }]);
    const r = await run(["apply", p, "--ops", opsPath]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/Unknown op/);
  });
});
