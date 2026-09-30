/**
 * `npm run version:bump` must move every versioned file together — including
 * `.claude-plugin/plugin.json`, since installed plugins only pick up a new
 * SKILL.md when that version changes. Runs the real script against a scratch
 * copy of the four files.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { promises as fs, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");
const FILES = [
  "scripts/bump-version.mjs",
  "package.json",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
  ".claude-plugin/plugin.json",
];

async function scratchRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clob-bump-"));
  for (const f of FILES) {
    await fs.mkdir(path.dirname(path.join(dir, f)), { recursive: true });
    await fs.copyFile(path.join(repoRoot, f), path.join(dir, f));
  }
  return dir;
}

const bump = (dir: string, version: string) =>
  spawnSync(process.execPath, [path.join(dir, "scripts/bump-version.mjs"), version], {
    encoding: "utf8",
  });

const versions = async (dir: string) => ({
  pkg: JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8")).version,
  cargo: (await fs.readFile(path.join(dir, "src-tauri/Cargo.toml"), "utf8")).match(
    /^version = "(.+)"$/m,
  )?.[1],
  tauri: JSON.parse(await fs.readFile(path.join(dir, "src-tauri/tauri.conf.json"), "utf8")).version,
  plugin: JSON.parse(await fs.readFile(path.join(dir, ".claude-plugin/plugin.json"), "utf8"))
    .version,
});

describe("bump-version", () => {
  it("the plugin version is in step with the app version today", () => {
    const read = (f: string) => JSON.parse(readFileSync(path.join(repoRoot, f), "utf8"));
    expect(read(".claude-plugin/plugin.json").version).toBe(read("package.json").version);
  });

  it("bumps all four files, plugin.json included", async () => {
    const dir = await scratchRepo();
    const r = bump(dir, "99.0.0");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/plugin\.json\s+\S+\s+→\s+99\.0\.0/);
    expect(await versions(dir)).toEqual({
      pkg: "99.0.0",
      cargo: "99.0.0",
      tauri: "99.0.0",
      plugin: "99.0.0",
    });
  });

  it("refuses to downgrade when plugin.json is ahead, and writes nothing", async () => {
    const dir = await scratchRepo();
    const pluginFile = path.join(dir, ".claude-plugin/plugin.json");
    const plugin = JSON.parse(await fs.readFile(pluginFile, "utf8"));
    await fs.writeFile(pluginFile, JSON.stringify({ ...plugin, version: "98.0.0" }, null, 2));
    const before = await versions(dir);

    const r = bump(dir, "97.0.0");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/plugin is already at 98\.0\.0/);
    expect(await versions(dir)).toEqual(before);
  });
});
