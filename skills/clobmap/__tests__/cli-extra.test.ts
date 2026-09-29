/**
 * Coverage for CLI surfaces the feature suites skip: the `info` alias,
 * unknown-command, `note --from PATH`, export/find JSON + color, and the
 * empty-path addressing guard.
 */
import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../cli";
import { loadDoc } from "../core";
import { resolveNodeId } from "../addressing";
import pkg from "../../../package.json";

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
async function fresh(): Promise<{ dir: string; file: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clob-x-"));
  const file = path.join(dir, "d.clobmap.yaml");
  await fs.writeFile(file, FIXTURE, "utf8");
  return { dir, file };
}

describe("cli — misc surfaces", () => {
  it("info is an alias for tree", async () => {
    const { file } = await fresh();
    const r = await run(["info", file]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Root [n1]");
  });

  it("unknown command exits non-zero with usage", async () => {
    const r = await run(["frobnicate", "x"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/Unknown command: frobnicate/);
    expect(r.err).toMatch(/headless clobmap document toolkit/);
  });

  it("no command prints usage", async () => {
    const r = await run([]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/headless clobmap document toolkit/);
  });

  it("--version / -v / version print the package version", async () => {
    for (const arg of ["--version", "-v", "version"]) {
      const r = await run([arg]);
      expect(r.code).toBe(0);
      expect(r.out).toBe(pkg.version);
    }
  });

  it("docs prints the command reference (SKILL.md)", async () => {
    const r = await run(["docs"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/name: clobmap/); // SKILL.md frontmatter
    expect(r.out).toMatch(/Command reference/i);
  });

  it("note-set --from reads content from a file", async () => {
    const { dir, file } = await fresh();
    const src = path.join(dir, "body.md");
    await fs.writeFile(src, "from a file", "utf8");
    await run(["note-set", file, "n2", "--from", src]);
    const notes = (await loadDoc(file)).tree.root.children[0]!.notes;
    expect(notes).toBe("from a file");
  });

  it("note-set errors when neither --text nor --from is given", async () => {
    const { file } = await fresh();
    const r = await run(["note-set", file, "n2"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/--text or --from/);
  });

  it("export-notes --out --json reports the written path", async () => {
    const { dir, file } = await fresh();
    const out = path.join(dir, "notes.md");
    const r = await run(["export-notes", file, "--out", out, "--json"]);
    expect(JSON.parse(r.out)).toEqual({ ok: true, out });
  });

  it("find --color matches nodes by color", async () => {
    const { file } = await fresh();
    await run(["color-set", file, "n2", "--color", "#abc"]);
    const r = await run(["find", file, "--color", "#abc"]);
    expect(r.out).toBe("Venue [n2]");
  });

  it("find with no matches returns empty output", async () => {
    const { file } = await fresh();
    const r = await run(["find", file, "--text", "zzz-nope"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe("");
  });
});

describe("addressing — empty path guard", () => {
  it("rejects a path made only of separators", async () => {
    const doc = (await loadDoc((await fresh()).file)).tree;
    expect(() => resolveNodeId(doc, "›")).toThrow(/Empty path/);
  });
});
