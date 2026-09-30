/**
 * `clobmap skill status|install|uninstall` — every row of the shared contract
 * (docs/clobmap-skill-app-install-product-doc.md §9), against a temp
 * CLAUDE_CONFIG_DIR. The Rust side (src-tauri/src/skill_tool.rs) tests the same
 * rows and parses the same marker fixture, so the two can't drift apart.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { promises as fs, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../cli";
import {
  MARKER,
  claudeDir,
  markerText,
  skillDir,
  skillInstall,
  skillStatus,
  skillUninstall,
} from "../skill-install";
import pkg from "../../../package.json";

const SKILL_MD = readFileSync(new URL("../SKILL.md", import.meta.url), "utf8");
const FIXTURE_MARKER = readFileSync(
  new URL("./fixtures/skill-marker.json", import.meta.url),
  "utf8",
);

/** A temp home; `withClaude` creates the Claude dir inside it. */
async function home(withClaude = true): Promise<{ claude: string; dir: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "clob-skill-"));
  const claude = path.join(root, ".claude");
  if (withClaude) await fs.mkdir(claude);
  return { claude, dir: skillDir(claude) };
}

async function writeMarker(dir: string, body: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, MARKER), body);
}

const exists = (p: string): Promise<boolean> =>
  fs.lstat(p).then(
    () => true,
    () => false,
  );

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("skill-install — contract", () => {
  it("claude dir: $CLAUDE_CONFIG_DIR wins, else ~/.claude", () => {
    expect(claudeDir({ CLAUDE_CONFIG_DIR: "/x/cfg" })).toBe("/x/cfg");
    expect(claudeDir({ CLAUDE_CONFIG_DIR: "" })).toBe(path.join(os.homedir(), ".claude"));
    expect(claudeDir({})).toBe(path.join(os.homedir(), ".claude"));
  });

  it("writes the exact marker the app writes, and accepts the shared fixture", async () => {
    expect(markerText("1.2.3")).toBe(FIXTURE_MARKER);
    const { claude, dir } = await home();
    await writeMarker(dir, FIXTURE_MARKER);
    expect(await skillStatus(claude)).toMatchObject({ isOurs: true, version: "1.2.3" });
  });

  it("status: absent, ours, and each foreign shape", async () => {
    const { claude, dir } = await home();
    expect(await skillStatus(claude)).toEqual({
      claudeDetected: true,
      installed: false,
      isOurs: false,
      path: dir,
      version: null,
    });

    for (const body of [
      '{"installedBy":"someone-else","version":"1.0.0"}', // wrong installedBy
      '{"installedBy":"clobmap"}', // no version
      "null",
      "not json",
    ]) {
      await writeMarker(dir, body);
      expect(await skillStatus(claude), body).toMatchObject({ installed: true, isOurs: false });
    }
    await fs.rm(path.join(dir, MARKER));
    expect(await skillStatus(claude)).toMatchObject({ installed: true, isOurs: false });
  });

  it("status without a Claude dir", async () => {
    const { claude } = await home(false);
    expect(await skillStatus(claude)).toMatchObject({ claudeDetected: false, installed: false });
  });

  it("a plain file at the skill path is foreign", async () => {
    const { claude, dir } = await home();
    await fs.mkdir(path.dirname(dir), { recursive: true });
    await fs.writeFile(dir, "not a folder");
    expect(await skillStatus(claude)).toMatchObject({ installed: true, isOurs: false });
    await expect(skillInstall(claude, SKILL_MD, "1.0.0")).rejects.toThrow(/not created by clobmap/);
  });

  it.skipIf(process.platform === "win32")(
    "a symlink is foreign even when it points at a marked folder",
    async () => {
      const { claude, dir } = await home();
      const real = path.join(path.dirname(claude), "repo-skill");
      await writeMarker(real, FIXTURE_MARKER);
      await fs.mkdir(path.dirname(dir), { recursive: true });
      await fs.symlink(real, dir);

      expect(await skillStatus(claude)).toMatchObject({ installed: true, isOurs: false });
      await expect(skillInstall(claude, SKILL_MD, "1.0.0")).rejects.toThrow(/not created/);
      await expect(skillUninstall(claude)).rejects.toThrow(/not created/);
      expect(await exists(path.join(real, MARKER))).toBe(true);
    },
  );

  it("install writes SKILL.md + marker, creating skills/, leaving no temp dirs", async () => {
    const { claude, dir } = await home();
    expect(await skillInstall(claude, SKILL_MD, "9.9.9")).toBe(dir);
    expect(await fs.readFile(path.join(dir, "SKILL.md"), "utf8")).toBe(SKILL_MD);
    expect(await fs.readFile(path.join(dir, MARKER), "utf8")).toBe(markerText("9.9.9"));
    expect(await fs.readdir(path.dirname(dir))).toEqual(["clobmap"]);
  });

  it("install refuses without a Claude dir and never creates it", async () => {
    const { claude } = await home(false);
    await expect(skillInstall(claude, SKILL_MD, "1.0.0")).rejects.toThrow(
      /Claude Code wasn't found/,
    );
    expect(await exists(claude)).toBe(false);
  });

  it("install replaces an older copy of ours whole, and is idempotent", async () => {
    const { claude, dir } = await home();
    await writeMarker(dir, markerText("0.0.1"));
    await fs.writeFile(path.join(dir, "SKILL.md"), "stale");
    await fs.writeFile(path.join(dir, "extra.txt"), "old file");

    await skillInstall(claude, SKILL_MD, "2.0.0");
    await skillInstall(claude, SKILL_MD, "2.0.0");
    expect(await fs.readFile(path.join(dir, "SKILL.md"), "utf8")).toBe(SKILL_MD);
    expect(await exists(path.join(dir, "extra.txt"))).toBe(false);
    expect(await skillStatus(claude)).toMatchObject({ isOurs: true, version: "2.0.0" });
    expect(await fs.readdir(path.dirname(dir))).toEqual(["clobmap"]);
  });

  it("install and uninstall refuse a foreign folder and leave it alone", async () => {
    const { claude, dir } = await home();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "SKILL.md"), "someone else's");

    await expect(skillInstall(claude, SKILL_MD, "1.0.0")).rejects.toThrow(
      `A different 'clobmap' skill already exists at ${dir} (not created by clobmap). Remove it first, then retry.`,
    );
    await expect(skillUninstall(claude)).rejects.toThrow(/not created by clobmap/);
    expect(await fs.readFile(path.join(dir, "SKILL.md"), "utf8")).toBe("someone else's");
  });

  it("install cleans up its temp dir when a write fails", async () => {
    const { claude, dir } = await home();
    // Fail the first write into the temp dir.
    const tmp = path.join(path.dirname(dir), `.clobmap.tmp-${process.pid}`);
    const spy = vi.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("disk full"));
    await expect(skillInstall(claude, SKILL_MD, "1.0.0")).rejects.toThrow("disk full");
    spy.mockRestore();
    expect(await exists(tmp)).toBe(false);
    expect(await exists(dir)).toBe(false);
  });

  it("a skill path it can't inspect (e.g. EACCES) is foreign, never touched", async () => {
    const { claude } = await home();
    const err = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const spy = vi.spyOn(fs, "lstat").mockRejectedValue(err);
    expect(await skillStatus(claude)).toMatchObject({ installed: true, isOurs: false });
    await expect(skillInstall(claude, SKILL_MD, "1.0.0")).rejects.toThrow(/not created by clobmap/);
    await expect(skillUninstall(claude)).rejects.toThrow(/not created by clobmap/);
    spy.mockRestore();
  });

  it("if the final swap fails, the previous copy is put back and the temp dir removed", async () => {
    const { claude, dir } = await home();
    await skillInstall(claude, "old skill", "1.0.0");
    const real = fs.rename.bind(fs);
    // 1st rename (current copy → .old) succeeds; 2nd (temp → skill dir) fails.
    const spy = vi
      .spyOn(fs, "rename")
      .mockImplementationOnce(real)
      .mockRejectedValueOnce(new Error("EBUSY"));
    await expect(skillInstall(claude, SKILL_MD, "2.0.0")).rejects.toThrow("EBUSY");
    spy.mockRestore();

    expect(await fs.readFile(path.join(dir, "SKILL.md"), "utf8")).toBe("old skill");
    expect(await skillStatus(claude)).toMatchObject({ isOurs: true, version: "1.0.0" });
    expect(await fs.readdir(path.dirname(dir))).toEqual(["clobmap"]);
  });

  it("if moving the current copy aside fails, it stays and no temp dir is left", async () => {
    const { claude, dir } = await home();
    await skillInstall(claude, "old skill", "1.0.0");
    const spy = vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("EPERM"));
    await expect(skillInstall(claude, SKILL_MD, "2.0.0")).rejects.toThrow("EPERM");
    spy.mockRestore();
    expect(await fs.readFile(path.join(dir, "SKILL.md"), "utf8")).toBe("old skill");
    expect(await fs.readdir(path.dirname(dir))).toEqual(["clobmap"]);
  });

  it("a failed first install cleans up and leaves nothing behind", async () => {
    const { claude, dir } = await home();
    const spy = vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("EXDEV"));
    await expect(skillInstall(claude, SKILL_MD, "1.0.0")).rejects.toThrow("EXDEV");
    spy.mockRestore();
    expect(await fs.readdir(path.dirname(dir))).toEqual([]);
  });

  it("uninstall removes only our folder; absent counts as success", async () => {
    const { claude, dir } = await home();
    await skillInstall(claude, SKILL_MD, "1.0.0");
    const sibling = path.join(path.dirname(dir), "other");
    await fs.mkdir(sibling);

    expect(await skillUninstall(claude)).toBe(true);
    expect(await exists(dir)).toBe(false);
    expect(await exists(sibling)).toBe(true);
    expect(await skillUninstall(claude)).toBe(false);
  });
});

describe("cli — skill subcommand", () => {
  it("install → status → uninstall, human output", async () => {
    const { claude, dir } = await home();
    vi.stubEnv("CLAUDE_CONFIG_DIR", claude);

    let r = await run(["skill", "status"]);
    expect(r).toMatchObject({ code: 0, out: expect.stringMatching(/not installed/) });

    r = await run(["skill", "install"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`Installed Claude Code skill → ${dir}`);
    // The installed text is what `clobmap docs` prints, stamped with our version.
    expect(await fs.readFile(path.join(dir, "SKILL.md"), "utf8")).toBe((await run(["docs"])).out);
    expect(await fs.readFile(path.join(dir, MARKER), "utf8")).toBe(markerText(pkg.version));

    r = await run(["skill", "status"]);
    expect(r.out).toBe(`Claude Code skill installed at ${dir} (clobmap ${pkg.version}).`);

    r = await run(["skill", "uninstall"]);
    expect(r.out).toBe("Removed Claude Code skill.");
    r = await run(["skill", "uninstall"]);
    expect(r.out).toMatch(/wasn't installed; nothing to remove/);
  });

  it("--json output", async () => {
    const { claude, dir } = await home();
    vi.stubEnv("CLAUDE_CONFIG_DIR", claude);

    expect(JSON.parse((await run(["skill", "install", "--json"])).out)).toEqual({
      ok: true,
      path: dir,
    });
    expect(JSON.parse((await run(["skill", "status", "--json"])).out)).toEqual({
      claudeDetected: true,
      installed: true,
      isOurs: true,
      path: dir,
      version: pkg.version,
    });
    expect(JSON.parse((await run(["skill", "uninstall", "--json"])).out)).toEqual({
      ok: true,
      removed: true,
    });
  });

  it("status reports a missing Claude dir and a foreign folder", async () => {
    const missing = await home(false);
    vi.stubEnv("CLAUDE_CONFIG_DIR", missing.claude);
    expect((await run(["skill", "status"])).out).toBe(
      `Claude Code not found (no ${missing.claude}).`,
    );

    const foreign = await home();
    await fs.mkdir(foreign.dir, { recursive: true });
    vi.stubEnv("CLAUDE_CONFIG_DIR", foreign.claude);
    expect((await run(["skill", "status"])).out).toMatch(/A different 'clobmap' skill is at/);
  });

  it("errors exit 1: refusal, JSON error, and bad/missing subcommand", async () => {
    const { claude } = await home(false);
    vi.stubEnv("CLAUDE_CONFIG_DIR", claude);

    let r = await run(["skill", "install"]);
    expect(r).toMatchObject({ code: 1, err: expect.stringMatching(/Claude Code wasn't found/) });
    r = await run(["skill", "install", "--json"]);
    expect(JSON.parse(r.err).error).toMatch(/Claude Code wasn't found/);

    for (const argv of [["skill"], ["skill", "frobnicate"]]) {
      r = await run(argv);
      expect(r).toMatchObject({ code: 1, err: "Usage: skill status|install|uninstall [--json]" });
    }
  });

  it("--help lists the skill commands", async () => {
    expect((await run(["--help"])).out).toContain("skill status|install|uninstall");
  });
});
