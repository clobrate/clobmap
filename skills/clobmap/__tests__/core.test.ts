import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDoc, withDoc } from "../core";

const FIXTURE = `# a leading comment
title: Test doc
version: 1
root:
  id: n1
  text: Root
  children:
    - id: n2
      text: Child
      children: []
`;

async function tmpFile(content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clob-"));
  const p = path.join(dir, "d.clobmap.yaml");
  await fs.writeFile(p, content, "utf8");
  return p;
}

describe("core — round-trip engine", () => {
  it("loads and parses a document", async () => {
    const live = await loadDoc(await tmpFile(FIXTURE));
    expect(live.tree.title).toBe("Test doc");
    expect(live.tree.root.children[0]!.text).toBe("Child");
  });

  it("round-trips a no-op edit byte-for-byte (comments preserved)", async () => {
    const out = await withDoc(await tmpFile(FIXTURE), (t) => t, { dryRun: true });
    expect(out).toBe(FIXTURE);
  });

  it("dry-run returns the new text but does not write", async () => {
    const p = await tmpFile(FIXTURE);
    const out = await withDoc(p, (t) => ({ ...t, title: "Changed" }), { dryRun: true });
    expect(out).toContain("Changed");
    expect(await fs.readFile(p, "utf8")).toBe(FIXTURE); // untouched
  });

  it("writes the mutated document when not dry-run", async () => {
    const p = await tmpFile(FIXTURE);
    await withDoc(p, (t) => ({ ...t, title: "Changed" }));
    expect((await loadDoc(p)).tree.title).toBe("Changed");
  });

  it("throws a clean error on invalid YAML", async () => {
    await expect(loadDoc(await tmpFile("title: [unclosed\n"))).rejects.toThrow(/Invalid clobmap YAML/);
  });

  it("throws a clean error on a missing file", async () => {
    await expect(loadDoc("/no/such/file.clobmap.yaml")).rejects.toThrow(/Cannot read file/);
  });
});
