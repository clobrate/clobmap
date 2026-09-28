/**
 * Process-level e2e: spawn the REAL CLI (`tsx skills/clobmap/cli.ts …`) as a
 * child process, so the things the in-process `run()` suite can't reach get
 * exercised for real — the entrypoint's argv slicing, stdout/stderr routing,
 * and the actual `process.exit(code)`. This is the CLI's equivalent of a
 * browser e2e (the app's Playwright specs don't cover the headless skill).
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");
const cli = path.join(repoRoot, "skills", "clobmap", "cli.ts");

interface Proc {
  code: number;
  stdout: string;
  stderr: string;
}
function clob(...args: string[]): Proc {
  const r = spawnSync(tsxBin, [cli, ...args], { cwd: repoRoot, encoding: "utf8" });
  return { code: r.status ?? -1, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
}
async function tmpFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clob-e2e-"));
  return path.join(dir, "d.clobmap.yaml");
}

describe("cli process e2e", () => {
  it("runs a real create → edit → read cycle across process boundaries", async () => {
    const f = await tmpFile();
    const created = clob("new", f, "--title", "Proc Doc");
    expect(created.code).toBe(0);
    expect(created.stdout).toContain("Created");

    const add = clob("add-child", f, "--parent", "Proc Doc", "--text", "Child", "--json");
    expect(add.code).toBe(0);
    expect(JSON.parse(add.stdout).ok).toBe(true);

    const tree = clob("tree", f);
    expect(tree.code).toBe(0);
    expect(tree.stdout).toContain("Proc Doc");
    expect(tree.stdout).toContain("Child");
  }, 30_000);

  it("exits 0 with usage and no stderr when given no args", async () => {
    const r = clob();
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("headless clobmap document toolkit");
    expect(r.stderr).toBe("");
  }, 30_000);

  it("exits 1 and writes the error to stderr (not stdout) on failure", async () => {
    const f = await tmpFile();
    clob("new", f);
    const r = clob("rename", f, "does-not-exist", "--text", "X");
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/not found/i);
    expect(r.stdout).toBe("");
  }, 30_000);

  it("emits a JSON error on stderr with --json", async () => {
    const f = await tmpFile();
    clob("new", f);
    const r = clob("delete", f, "nope", "--json");
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stderr).error).toMatch(/not found/i);
  }, 30_000);
});
