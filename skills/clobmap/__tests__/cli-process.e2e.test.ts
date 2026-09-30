/**
 * Process-level e2e: spawn the REAL CLI as a child process, so the things the
 * in-process `run()` suite can't reach get exercised for real — the entrypoint's
 * argv handling, stdout/stderr routing, and the actual `process.exit(code)`.
 *
 * By default it runs the source via `tsx skills/clobmap/cli.ts`. In CI the
 * `cli-binary` job sets `CLOBMAP_BIN` to the compiled Node-SEA binary, so the
 * SAME assertions verify the shipped executable — including `--version` parity
 * and the embedded SKILL.md asset (the SEA-only `docs` path).
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "../../../package.json";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");
const cli = path.join(repoRoot, "skills", "clobmap", "cli.ts");
const compiledBin = process.env.CLOBMAP_BIN; // set in CI → test the SEA binary

interface Proc {
  code: number;
  stdout: string;
  stderr: string;
}
function clob(...args: string[]): Proc {
  return clobEnv({}, ...args);
}
function clobEnv(env: Record<string, string>, ...args: string[]): Proc {
  const [cmd, cmdArgs] = compiledBin ? [compiledBin, args] : [tsxBin, [cli, ...args]];
  const r = spawnSync(cmd, cmdArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
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

  it("--version matches the app version (parity)", () => {
    const r = clob("--version");
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(pkg.version);
  }, 30_000);

  it("docs prints the command reference (embedded SKILL.md asset)", () => {
    const r = clob("docs");
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/name: clobmap/); // SKILL.md frontmatter
    expect(r.stdout).toMatch(/Command reference/i);
  }, 30_000);

  it("skill install writes the embedded SKILL.md into CLAUDE_CONFIG_DIR", async () => {
    const claude = await fs.mkdtemp(path.join(os.tmpdir(), "clob-e2e-claude-"));
    const env = { CLAUDE_CONFIG_DIR: claude };
    const installed = clobEnv(env, "skill", "install", "--json");
    expect(installed.code).toBe(0);
    const dir = JSON.parse(installed.stdout).path as string;
    expect(await fs.readFile(path.join(dir, "SKILL.md"), "utf8")).toBe(clob("docs").stdout + "\n");

    const status = JSON.parse(clobEnv(env, "skill", "status", "--json").stdout);
    expect(status).toMatchObject({ isOurs: true, version: clob("--version").stdout });
    expect(clobEnv(env, "skill", "uninstall").code).toBe(0);
  }, 30_000);

  it("skill install upgrades an older copy it installed", async () => {
    const claude = await fs.mkdtemp(path.join(os.tmpdir(), "clob-e2e-claude-"));
    const dir = path.join(claude, "skills", "clobmap");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "SKILL.md"), "stale");
    await fs.writeFile(
      path.join(dir, ".clobmap-install.json"),
      '{"installedBy":"clobmap","version":"0.0.1"}\n',
    );

    const r = clobEnv({ CLAUDE_CONFIG_DIR: claude }, "skill", "install");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`Installed Claude Code skill → ${dir}`);
    expect(await fs.readFile(path.join(dir, "SKILL.md"), "utf8")).not.toBe("stale");
    expect(JSON.parse(await fs.readFile(path.join(dir, ".clobmap-install.json"), "utf8"))).toEqual({
      installedBy: "clobmap",
      version: clob("--version").stdout,
    });
  }, 30_000);

  it("skill install/uninstall refuse a folder clobmap didn't create: exit 1, stderr, untouched", async () => {
    const claude = await fs.mkdtemp(path.join(os.tmpdir(), "clob-e2e-claude-"));
    const dir = path.join(claude, "skills", "clobmap");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "SKILL.md"), "someone else's");
    const env = { CLAUDE_CONFIG_DIR: claude };

    for (const sub of ["install", "uninstall"]) {
      const r = clobEnv(env, "skill", sub);
      expect(r.code).toBe(1);
      expect(r.stdout).toBe("");
      expect(r.stderr).toMatch(/not created by clobmap/);
    }
    expect(await fs.readFile(path.join(dir, "SKILL.md"), "utf8")).toBe("someone else's");
    expect(await fs.readdir(dir)).toEqual(["SKILL.md"]);
  }, 30_000);

  it("skill install without a Claude dir exits 1 with a JSON error and creates nothing", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "clob-e2e-noclaude-"));
    const claude = path.join(parent, ".claude");
    const r = clobEnv({ CLAUDE_CONFIG_DIR: claude }, "skill", "install", "--json");
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
    expect(JSON.parse(r.stderr).error).toMatch(/Claude Code wasn't found/);
    expect(await fs.readdir(parent)).toEqual([]);

    const status = clobEnv({ CLAUDE_CONFIG_DIR: claude }, "skill", "status", "--json");
    expect(status.code).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({ claudeDetected: false, installed: false });
  }, 30_000);
});
