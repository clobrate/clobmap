/**
 * Build the standalone `clobmap` CLI binary (Phase 0 of the bundled-CLI plan).
 *
 * Pipeline: esbuild bundle (all pure-TS deps inlined) → Node SEA blob →
 * copy the node binary → postject the blob in → (macOS) re-sign ad-hoc.
 * Output: dist-cli/clobmap[.exe] — a self-contained binary needing no Node.
 *
 * Isolated here on purpose: if Node SEA proves painful, swapping to Bun
 * `--compile` (product doc D4 fallback) is a change to this one file.
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, statSync, chmodSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "dist-cli");
const BUNDLE = path.join(OUT_DIR, "clobmap.cjs");
const BLOB = path.join(OUT_DIR, "clobmap.blob");
const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
const BIN = path.join(OUT_DIR, isWin ? "clobmap.exe" : "clobmap");
// The Node SEA fuse sentinel (fixed, documented constant).
const FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

// Rust-style target triple, for reference / Phase-1 sidecar naming.
const TRIPLE = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "win32-x64": "x86_64-pc-windows-msvc",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
}[`${process.platform}-${process.arch}`] ?? `${process.arch}-${process.platform}`;

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
}
function log(msg) {
  process.stdout.write(`[build-cli] ${msg}\n`);
}

/**
 * Return a path to an SEA-capable `node`. The running node is used if it was
 * built with SEA (official builds + CI's setup-node are); otherwise (e.g.
 * Homebrew, which compiles SEA out) the matching official build is downloaded
 * and cached under `.sea-node/`. The injected base binary MUST be SEA-capable,
 * or it ignores the embedded blob — so this same node is used as the base.
 */
async function ensureSeaNode() {
  if (process.config?.variables?.single_executable_application) return process.execPath;
  if (isWin) {
    throw new Error("This node lacks SEA support; on Windows use an official Node build to run build:cli.");
  }
  const ver = process.version; // vX.Y.Z
  const plat = process.platform; // darwin | linux
  const arch = process.arch; // arm64 | x64
  const name = `node-${ver}-${plat}-${arch}`;
  const cacheDir = path.join(ROOT, ".sea-node");
  const nodeBin = path.join(cacheDir, name, "bin", "node");
  if (existsSync(nodeBin)) {
    log(`using cached SEA-capable node (${name})`);
    return nodeBin;
  }
  log(`local node lacks SEA — downloading official ${name}…`);
  mkdirSync(cacheDir, { recursive: true });
  const url = `https://nodejs.org/dist/${ver}/${name}.tar.gz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status}): ${url}`);
  const tgz = path.join(cacheDir, `${name}.tar.gz`);
  writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
  run("tar", ["-xzf", tgz, "-C", cacheDir]);
  if (!existsSync(nodeBin)) throw new Error(`extracted node not found at ${nodeBin}`);
  return nodeBin;
}

// Clean output dir.
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

// 1. Bundle cli.ts + all its pure-TS deps into one CJS file. package.json is
//    inlined (version), node builtins stay external (platform: node).
log("bundling with esbuild…");
await build({
  entryPoints: [path.join(ROOT, "skills/clobmap/cli.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: BUNDLE,
  logLevel: "warning",
  // `import.meta.url` is only used in the source/ESM `docs` fallback; the SEA
  // binary always reads the embedded asset, so that branch is dead here.
  logOverride: { "empty-import-meta": "silent" },
});

// 2. Generate the SEA blob (embeds the bundle + SKILL.md asset). Needs an
//    SEA-capable node (downloads one if the local node lacks it).
const seaNode = await ensureSeaNode();
log("generating SEA blob…");
run(seaNode, ["--experimental-sea-config", "sea-config.json"]);

// 3. Copy the SEA-capable node binary as the base executable.
log("copying node runtime…");
copyFileSync(seaNode, BIN);
chmodSync(BIN, 0o755);

// 4. macOS: strip the existing signature before injecting.
if (isMac) {
  log("removing macOS signature…");
  run("codesign", ["--remove-signature", BIN]);
}

// 5. Inject the blob (macho segment on macOS).
log("injecting blob with postject…");
const postject = path.join(ROOT, "node_modules", ".bin", isWin ? "postject.cmd" : "postject");
const injectArgs = [BIN, "NODE_SEA_BLOB", BLOB, "--sentinel-fuse", FUSE];
if (isMac) injectArgs.push("--macho-segment-name", "NODE_SEA");
run(postject, injectArgs);

// 6. macOS: ad-hoc re-sign so it runs locally (CI re-signs with the real identity).
if (isMac) {
  log("ad-hoc re-signing…");
  run("codesign", ["--sign", "-", BIN]);
}

const sizeMB = (statSync(BIN).size / 1024 / 1024).toFixed(1);
log(`done → ${path.relative(ROOT, BIN)}  (${sizeMB} MB, target ${TRIPLE})`);
