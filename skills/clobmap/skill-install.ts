/**
 * `clobmap skill …` — copy this SKILL.md into Claude Code's personal skills
 * folder (`<claude dir>/skills/clobmap/`), report on it, or remove it.
 *
 * The desktop app does the same thing from Rust (`src-tauri/src/skill_tool.rs`).
 * Both follow the shared contract in
 * docs/clobmap-skill-app-install-product-doc.md §9 — same folder, same marker,
 * same ownership rule, same messages — so each maintains what the other
 * installed. Change one, change both.
 */
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Ownership marker written next to SKILL.md. A folder is ours iff it has one. */
export const MARKER = ".clobmap-install.json";
/** Shared with the app, so each recognizes the other's install as ours. */
export const INSTALLED_BY = "clobmap";

export interface SkillStatus {
  /** The Claude dir exists, i.e. Claude Code has run on this machine. */
  claudeDetected: boolean;
  /** Something exists at the skill folder (ours or not). */
  installed: boolean;
  /** ...and it's a folder clobmap wrote (marker present and valid). */
  isOurs: boolean;
  /** The skill folder. */
  path: string;
  /** The clobmap version that wrote it, when ours. */
  version: string | null;
}

type Ownership = { kind: "absent" } | { kind: "ours"; version: string } | { kind: "foreign" };

/** `$CLAUDE_CONFIG_DIR` if set (the CLI runs in the user's shell, so it can
 * see it — the app can't), else `~/.claude`. */
export function claudeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}

export function skillDir(claude: string): string {
  return path.join(claude, "skills", "clobmap");
}

/** The exact marker text both implementations write. */
export function markerText(version: string): string {
  return JSON.stringify({ installedBy: INSTALLED_BY, version }) + "\n";
}

async function isDir(p: string): Promise<boolean> {
  return fsp.stat(p).then(
    (s) => s.isDirectory(),
    () => false,
  );
}

/** Ours = a real directory (not a symlink) holding a marker we wrote. Anything
 * else at the path is foreign — including a developer's symlink to the repo. */
async function ownership(dir: string): Promise<Ownership> {
  let meta;
  try {
    meta = await fsp.lstat(dir);
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ENOENT"
      ? { kind: "absent" }
      : { kind: "foreign" }; // can't inspect it → don't touch it
  }
  if (!meta.isDirectory()) return { kind: "foreign" }; // a symlink or a plain file
  try {
    const m = JSON.parse(await fsp.readFile(path.join(dir, MARKER), "utf8")) as unknown;
    if (
      m !== null &&
      typeof m === "object" &&
      (m as { installedBy?: unknown }).installedBy === INSTALLED_BY &&
      typeof (m as { version?: unknown }).version === "string"
    ) {
      return { kind: "ours", version: (m as { version: string }).version };
    }
  } catch {
    // missing or unparseable marker → foreign
  }
  return { kind: "foreign" };
}

function foreignError(dir: string): Error {
  return new Error(
    `A different 'clobmap' skill already exists at ${dir} (not created by clobmap). Remove it first, then retry.`,
  );
}

export async function skillStatus(claude: string): Promise<SkillStatus> {
  const dir = skillDir(claude);
  const own = await ownership(dir);
  return {
    claudeDetected: await isDir(claude),
    installed: own.kind !== "absent",
    isOurs: own.kind === "ours",
    path: dir,
    version: own.kind === "ours" ? own.version : null,
  };
}

/** Write SKILL.md + marker into a temp sibling, then swap it into place, so
 * Claude Code never reads a half-written skill. Returns the skill folder. */
export async function skillInstall(
  claude: string,
  skillMd: string,
  version: string,
): Promise<string> {
  if (!(await isDir(claude))) {
    throw new Error(`Claude Code wasn't found on this computer (no ${claude}).`);
  }
  const dir = skillDir(claude);
  const own = await ownership(dir);
  if (own.kind === "foreign") throw foreignError(dir);
  const skills = path.dirname(dir);
  await fsp.mkdir(skills, { recursive: true });

  const tmp = path.join(skills, `.clobmap.tmp-${process.pid}`);
  await fsp.rm(tmp, { recursive: true, force: true });
  try {
    await fsp.mkdir(tmp);
    await fsp.writeFile(path.join(tmp, "SKILL.md"), skillMd, "utf8");
    await fsp.writeFile(path.join(tmp, MARKER), markerText(version), "utf8");
  } catch (e) {
    await fsp.rm(tmp, { recursive: true, force: true });
    throw e;
  }

  // Renaming a directory over an existing one fails on Windows, so move the
  // old copy aside first, then drop it once the new one is in place.
  const old = path.join(skills, `.clobmap.old-${process.pid}`);
  if (own.kind === "ours") {
    await fsp.rm(old, { recursive: true, force: true });
    try {
      await fsp.rename(dir, old);
    } catch (e) {
      await fsp.rm(tmp, { recursive: true, force: true });
      throw e;
    }
  }
  try {
    await fsp.rename(tmp, dir);
  } catch (e) {
    if (own.kind === "ours") await fsp.rename(old, dir).catch(() => {});
    await fsp.rm(tmp, { recursive: true, force: true });
    throw e;
  }
  await fsp.rm(old, { recursive: true, force: true });
  return dir;
}

/** Removes the skill folder if it's ours. Returns whether anything was removed;
 * absent counts as success. */
export async function skillUninstall(claude: string): Promise<boolean> {
  const dir = skillDir(claude);
  const own = await ownership(dir);
  if (own.kind === "absent") return false;
  if (own.kind === "foreign") throw foreignError(dir);
  await fsp.rm(dir, { recursive: true, force: true });
  return true;
}
